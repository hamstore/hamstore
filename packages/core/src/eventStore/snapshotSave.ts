import type { Aggregate } from '~/aggregate';
import type {
  SeedSnapshot,
  ShouldKeepSnapshot,
  ShouldSaveSnapshot,
  Snapshot,
  SnapshotConfig,
  SnapshotStorageAdapter,
} from '~/snapshot';
import {
  compilePruningPolicy,
  compileSnapshotPolicy,
  seedSnapshotValue,
} from '~/snapshot';

/**
 * Inputs the snapshot-save pipeline reads off an `EventStore` for a single
 * committed write. Kept as plain data (rather than the whole store) so the
 * pipeline stays a set of free functions — `EventStore._dispatchSnapshotSave`
 * is the only place that touches `this`.
 */
export type SnapshotSaveContext = {
  eventStoreId: string;
  snapshotStorageAdapter: SnapshotStorageAdapter;
  snapshotConfig: SnapshotConfig;
  shouldSave: ShouldSaveSnapshot;
  shouldKeep: ShouldKeepSnapshot | undefined;
};

/**
 * Build the `SnapshotSaveContext` for a store, or `undefined` when snapshots
 * are not configured (no adapter or no config) — in which case there is
 * nothing to save.
 */
export const resolveSnapshotSaveContext = (store: {
  eventStoreId: string;
  snapshotStorageAdapter?: SnapshotStorageAdapter;
  snapshotConfig?: SnapshotConfig;
}): SnapshotSaveContext | undefined => {
  const { snapshotConfig, snapshotStorageAdapter } = store;
  if (snapshotConfig === undefined || snapshotStorageAdapter === undefined) {
    return undefined;
  }

  const pruning = snapshotConfig.pruning;

  return {
    eventStoreId: store.eventStoreId,
    snapshotStorageAdapter,
    snapshotConfig,
    shouldSave: compileSnapshotPolicy(snapshotConfig.policy),
    shouldKeep:
      pruning === undefined || pruning.strategy === 'NONE'
        ? undefined
        : compilePruningPolicy(pruning),
  };
};

const snapshotPolicyFires = (
  ctx: SnapshotSaveContext,
  args: {
    aggregate: Aggregate;
    seedSnapshot: SeedSnapshot | undefined;
    newEventCount: number;
  },
): boolean => {
  if (args.aggregate.version <= 0) {
    return false;
  }

  // Nothing new to snapshot: the seed already captures this exact version.
  const seedValue = seedSnapshotValue(args.seedSnapshot);
  if (seedValue?.aggregate.version === args.aggregate.version) {
    return false;
  }

  return ctx.shouldSave({
    aggregate: args.aggregate,
    seedSnapshot: args.seedSnapshot,
    newEventCount: args.newEventCount,
    now: new Date(),
  });
};

/**
 * Delete every snapshot the configured pruning policy declines to keep,
 * paging through the aggregate's snapshots (newest-first) up to and including
 * the just-saved version.
 */
const pruneSnapshotsAfterSave = async (
  ctx: SnapshotSaveContext,
  args: { aggregateId: string; newSnapshot: Snapshot },
): Promise<void> => {
  const { shouldKeep } = ctx;
  if (shouldKeep === undefined) {
    return;
  }

  const adapter = ctx.snapshotStorageAdapter;
  const context = { eventStoreId: ctx.eventStoreId };
  const reducerVersion = ctx.snapshotConfig.currentReducerVersion;
  const now = new Date(args.newSnapshot.savedAt);

  let pageToken: string | undefined = undefined;
  let position = 0;

  do {
    const { snapshotKeys, nextPageToken } = await adapter.listSnapshots(
      context,
      {
        aggregateId: args.aggregateId,
        reducerVersion,
        reverse: true,
        maxVersion: args.newSnapshot.aggregate.version,
        pageToken,
      },
    );

    for (const key of snapshotKeys) {
      const ageMs = now.getTime() - new Date(key.savedAt).getTime();
      if (!shouldKeep({ key, position, ageMs, now })) {
        await adapter.deleteSnapshot(key, context);
      }
      position += 1;
    }

    pageToken = nextPageToken;
  } while (pageToken !== undefined);
};

/**
 * Evaluate the policy, persist a new snapshot if it fires, then prune. Catches
 * all errors and routes them through `onSnapshotError`, so it never rejects —
 * safe to hand to a background-work runner.
 */
export const runSnapshotSave = async (
  ctx: SnapshotSaveContext,
  args: {
    aggregate: Aggregate;
    seedSnapshot: SeedSnapshot | undefined;
    newEventCount: number;
  },
): Promise<void> => {
  try {
    if (!snapshotPolicyFires(ctx, args)) {
      return;
    }

    const newSnapshot: Snapshot = {
      aggregate: args.aggregate,
      reducerVersion: ctx.snapshotConfig.currentReducerVersion,
      eventStoreId: ctx.eventStoreId,
      savedAt: new Date().toISOString(),
    };

    await ctx.snapshotStorageAdapter.putSnapshot(newSnapshot, {
      eventStoreId: ctx.eventStoreId,
    });

    await pruneSnapshotsAfterSave(ctx, {
      aggregateId: args.aggregate.aggregateId,
      newSnapshot,
    });
  } catch (error) {
    ctx.snapshotConfig.onSnapshotError?.({
      phase: 'save',
      aggregateId: args.aggregate.aggregateId,
      eventStoreId: ctx.eventStoreId,
      error,
    });
  }
};
