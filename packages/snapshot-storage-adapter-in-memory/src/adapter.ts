/* eslint-disable max-lines */
import type {
  ListSnapshotsOptions,
  ListSnapshotsOutput,
  Snapshot,
  SnapshotKey,
  SnapshotStorageAdapter,
} from '@hamstore/core';

type StorageRow = Snapshot;

const matchesAggregateId = (
  row: StorageRow,
  options: ListSnapshotsOptions,
): boolean =>
  options.aggregateId === undefined ||
  row.aggregate.aggregateId === options.aggregateId;

const matchesReducerVersion = (
  row: StorageRow,
  options: ListSnapshotsOptions,
): boolean =>
  options.reducerVersion === undefined ||
  row.reducerVersion === options.reducerVersion;

const matchesVersionRange = (
  row: StorageRow,
  options: ListSnapshotsOptions,
): boolean => {
  const v = row.aggregate.version;

  return (
    (options.minVersion === undefined || v >= options.minVersion) &&
    (options.maxVersion === undefined || v <= options.maxVersion)
  );
};

const matchesPrefix = (
  row: StorageRow,
  options: ListSnapshotsOptions,
): boolean =>
  matchesAggregateId(row, options) &&
  matchesReducerVersion(row, options) &&
  matchesVersionRange(row, options);

const isCandidateForLatest = (
  row: StorageRow,
  aggregateId: string,
  options: { aggregateMaxVersion?: number; reducerVersion?: string },
): boolean => {
  if (row.aggregate.aggregateId !== aggregateId) {
    return false;
  }
  if (
    options.aggregateMaxVersion !== undefined &&
    row.aggregate.version > options.aggregateMaxVersion
  ) {
    return false;
  }
  if (
    options.reducerVersion !== undefined &&
    row.reducerVersion !== options.reducerVersion
  ) {
    return false;
  }

  return true;
};

const parsePageToken = (token: string | undefined): number => {
  if (token === undefined) {
    return 0;
  }
  if (!/^[0-9]+$/.test(token)) {
    throw new Error(
      `InMemorySnapshotStorageAdapter: invalid pageToken "${token}"`,
    );
  }
  const parsed = Number(token);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(
      `InMemorySnapshotStorageAdapter: invalid pageToken "${token}"`,
    );
  }

  return parsed;
};

const sortRows = (rows: StorageRow[], reverse: boolean): StorageRow[] => {
  const direction = reverse ? -1 : 1;

  return [...rows].sort((a, b) => {
    const idCmp = a.aggregate.aggregateId.localeCompare(b.aggregate.aggregateId);
    if (idCmp !== 0) {
      return idCmp * direction;
    }

    const versionCmp = a.aggregate.version - b.aggregate.version;
    if (versionCmp !== 0) {
      return versionCmp * direction;
    }

    return a.reducerVersion.localeCompare(b.reducerVersion) * direction;
  });
};

/**
 * In-memory implementation of `SnapshotStorageAdapter`. Snapshots are stored
 * keyed by `(eventStoreId, aggregateId, aggregateVersion, reducerVersion)`,
 * mirroring the conformance shape expected by the EventStore.
 *
 * Intended for tests and local demos. Not durable across processes.
 */
export class InMemorySnapshotStorageAdapter implements SnapshotStorageAdapter {
  /** Map<eventStoreId, Map<rowKey, Snapshot>> */
  private store: Map<string, Map<string, StorageRow>>;

  constructor({
    initialSnapshots = [],
  }: { initialSnapshots?: Snapshot[] } = {}) {
    this.store = new Map();

    for (const snapshot of initialSnapshots) {
      this.putSync(snapshot);
    }
  }

  private storeFor(eventStoreId: string): Map<string, StorageRow> {
    let bucket = this.store.get(eventStoreId);
    if (bucket === undefined) {
      bucket = new Map();
      this.store.set(eventStoreId, bucket);
    }

    return bucket;
  }

  private rowKey(snapshotKey: SnapshotKey): string {
    return `${snapshotKey.aggregateId}#${String(snapshotKey.aggregateVersion).padStart(20, '0')}#${snapshotKey.reducerVersion}`;
  }

  private putSync(snapshot: Snapshot): void {
    const bucket = this.storeFor(snapshot.eventStoreId);
    const key = this.rowKey({
      aggregateId: snapshot.aggregate.aggregateId,
      aggregateVersion: snapshot.aggregate.version,
      reducerVersion: snapshot.reducerVersion,
    });
    bucket.set(key, snapshot);
  }

  getLatestSnapshot: SnapshotStorageAdapter['getLatestSnapshot'] = async (
    aggregateId,
    context,
    options = {},
  ) => {
    const bucket = this.store.get(context.eventStoreId);
    if (bucket === undefined) {
      return { snapshot: undefined };
    }

    let candidate: Snapshot | undefined = undefined;
    for (const row of bucket.values()) {
      if (!isCandidateForLatest(row, aggregateId, options)) {
        continue;
      }
      if (
        candidate === undefined ||
        row.aggregate.version > candidate.aggregate.version
      ) {
        candidate = row;
      }
    }

    return { snapshot: candidate };
  };

  getSnapshot: SnapshotStorageAdapter['getSnapshot'] = async (
    snapshotKey,
    context,
  ) => {
    const bucket = this.store.get(context.eventStoreId);
    if (bucket === undefined) {
      return { snapshot: undefined };
    }

    const snapshot = bucket.get(this.rowKey(snapshotKey));

    return { snapshot };
  };

  putSnapshot: SnapshotStorageAdapter['putSnapshot'] = async (
    snapshot,
    context,
  ) => {
    if (snapshot.eventStoreId !== context.eventStoreId) {
      throw new Error(
        `Snapshot eventStoreId "${snapshot.eventStoreId}" does not match context "${context.eventStoreId}"`,
      );
    }

    this.putSync(snapshot);
  };

  deleteSnapshot: SnapshotStorageAdapter['deleteSnapshot'] = async (
    snapshotKey,
    context,
  ) => {
    const bucket = this.store.get(context.eventStoreId);
    if (bucket === undefined) {
      return;
    }

    bucket.delete(this.rowKey(snapshotKey));
  };

  listSnapshots: SnapshotStorageAdapter['listSnapshots'] = async (
    context,
    options = {},
  ): Promise<ListSnapshotsOutput> => {
    const bucket = this.store.get(context.eventStoreId);
    if (bucket === undefined) {
      return { snapshotKeys: [] };
    }

    const matching = sortRows(
      [...bucket.values()].filter(row => matchesPrefix(row, options)),
      options.reverse === true,
    );

    const start = parsePageToken(options.pageToken);
    const end =
      options.limit !== undefined ? start + options.limit : matching.length;
    const page = matching.slice(start, end);

    const snapshotKeys: SnapshotKey[] = page.map(row => ({
      aggregateId: row.aggregate.aggregateId,
      aggregateVersion: row.aggregate.version,
      reducerVersion: row.reducerVersion,
      savedAt: row.savedAt,
    }));

    return {
      snapshotKeys,
      ...(end < matching.length ? { nextPageToken: String(end) } : {}),
    };
  };
}
