import { compilePruningPolicy } from './pruningPolicy';
import type { PruningPolicy, ShouldKeepSnapshot } from './snapshotConfig';
import type {
  ListSnapshotsOptions,
  SnapshotKey,
  SnapshotStorageAdapter,
} from './snapshotStorageAdapter';

const requirePositiveInteger = (
  caller: string,
  name: string,
  value: number,
): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(
      `${caller}: \`${name}\` must be a positive integer (got ${String(value)})`,
    );
  }
};

const ageMsOf = (key: SnapshotKey, now: Date): number =>
  now.getTime() - new Date(key.savedAt).getTime();

type CommonPruneArgs = {
  /** Pruning policy (`NONE` is a no-op). */
  policy: PruningPolicy;
  /** Restrict to this reducer fingerprint. Default: any. */
  reducerVersion?: string;
  /** How many keys to fetch per page. Default 100. */
  batchSize?: number;
  /** Override "now" — useful for deterministic tests. */
  now?: Date;
  /** Optional progress hook; called after every deletion with running count. */
  onProgress?: (deletedSoFar: number) => void;
};

type SweepDeps = {
  adapter: SnapshotStorageAdapter;
  eventStoreId: string;
  shouldKeep: ShouldKeepSnapshot;
  now: Date;
  onProgress?: (deletedSoFar: number) => void;
};

const sweepPages = async (
  deps: SweepDeps,
  listOptions: Omit<ListSnapshotsOptions, 'pageToken' | 'reverse'>,
  positionFor: (key: SnapshotKey) => number,
): Promise<{ deletedCount: number }> => {
  const ctx = { eventStoreId: deps.eventStoreId };
  let pageToken: string | undefined = undefined;
  let deletedCount = 0;

  do {
    const { snapshotKeys, nextPageToken } = await deps.adapter.listSnapshots(
      ctx,
      { ...listOptions, reverse: true, pageToken },
    );

    for (const key of snapshotKeys) {
      const position = positionFor(key);
      const ageMs = ageMsOf(key, deps.now);
      if (deps.shouldKeep({ key, position, ageMs, now: deps.now })) {
        continue;
      }
      await deps.adapter.deleteSnapshot(key, ctx);
      deletedCount += 1;
      deps.onProgress?.(deletedCount);
    }

    pageToken = nextPageToken;
  } while (pageToken !== undefined);

  return { deletedCount };
};

/**
 * Prune snapshots for **a single aggregate** according to `args.policy`.
 *
 * Pages through `listSnapshots({ aggregateId, reducerVersion, reverse: true })`
 * (newest-first within the aggregate, per the adapter contract) and asks the
 * compiled policy for each candidate whether to keep it. Deletes the rest via
 * `deleteSnapshot`.
 *
 * Useful for offline / scheduled pruning when the EventStore is configured
 * with `pruning: { strategy: 'NONE' }` (recommended for serverless / hot
 * paths).
 */
export const pruneAggregateSnapshots = async (
  adapter: SnapshotStorageAdapter,
  eventStoreId: string,
  aggregateId: string,
  args: CommonPruneArgs & {
    /** Inclusive upper bound on `aggregateVersion`. Default: any. */
    maxVersion?: number;
  },
): Promise<{ deletedCount: number }> => {
  const {
    policy,
    reducerVersion,
    maxVersion,
    batchSize = 100,
    now = new Date(),
    onProgress,
  } = args;

  requirePositiveInteger('pruneAggregateSnapshots', 'batchSize', batchSize);

  if (policy.strategy === 'NONE') {
    return { deletedCount: 0 };
  }

  let position = 0;

  return sweepPages(
    {
      adapter,
      eventStoreId,
      shouldKeep: compilePruningPolicy(policy),
      now,
      onProgress,
    },
    {
      aggregateId,
      reducerVersion,
      maxVersion,
      limit: batchSize,
    },
    () => position++,
  );
};

/**
 * Prune snapshots **across every aggregate** in an event store according to
 * `args.policy`.
 *
 * Pages through `listSnapshots({ reducerVersion, reverse: true })` (no
 * `aggregateId` filter). Within each aggregate the listing is newest-first;
 * cross-aggregate ordering is implementation-defined but stable within an
 * aggregate, so this helper tracks each aggregate's `position` counter
 * separately as it sweeps the store.
 *
 * Designed for scheduled maintenance jobs (cron Lambda, lib-dam-style
 * scripts) when the EventStore uses `pruning: { strategy: 'NONE' }`.
 */
export const pruneEventStoreSnapshots = async (
  adapter: SnapshotStorageAdapter,
  eventStoreId: string,
  args: CommonPruneArgs,
): Promise<{ deletedCount: number; aggregateCount: number }> => {
  const {
    policy,
    reducerVersion,
    batchSize = 100,
    now = new Date(),
    onProgress,
  } = args;

  requirePositiveInteger('pruneEventStoreSnapshots', 'batchSize', batchSize);

  if (policy.strategy === 'NONE') {
    return { deletedCount: 0, aggregateCount: 0 };
  }

  const positionByAggregate = new Map<string, number>();

  const { deletedCount } = await sweepPages(
    {
      adapter,
      eventStoreId,
      shouldKeep: compilePruningPolicy(policy),
      now,
      onProgress,
    },
    {
      reducerVersion,
      limit: batchSize,
    },
    key => {
      const position = positionByAggregate.get(key.aggregateId) ?? 0;
      positionByAggregate.set(key.aggregateId, position + 1);

      return position;
    },
  );

  return { deletedCount, aggregateCount: positionByAggregate.size };
};
