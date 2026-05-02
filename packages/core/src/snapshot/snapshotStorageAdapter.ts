import type { Aggregate } from '~/aggregate';
import type { EventStoreContext } from '~/eventStorageAdapter';

/**
 * A snapshot of an aggregate at a point in time.
 *
 * Snapshots are tied to a `reducerVersion` so that bumping the reducer
 * invalidates them: snapshots written under a different reducer version are
 * never silently applied to the current reducer.
 */
export type Snapshot<AGGREGATE extends Aggregate = Aggregate> = {
  /** The reduced aggregate. `aggregate.version` is the version it covers up to. */
  aggregate: AGGREGATE;
  /** The reducer fingerprint under which this snapshot was produced. */
  reducerVersion: string;
  /** The id of the event store the snapshot belongs to. */
  eventStoreId: string;
  /** ISO-8601 timestamp the snapshot was written. */
  savedAt: string;
};

/**
 * Identifies a snapshot uniquely. Returned by `listSnapshots` so callers can
 * efficiently enumerate snapshots without loading payloads (used e.g. by the
 * `cleanUpOutdatedSnapshots` helper).
 */
export type SnapshotKey = {
  aggregateId: string;
  aggregateVersion: number;
  reducerVersion: string;
};

export type ListSnapshotsOptions = {
  /** Restrict to one aggregate. */
  aggregateId?: string;
  /** Restrict to one reducer version (used by cleanup of outdated reducers). */
  reducerVersion?: string;
  minVersion?: number;
  maxVersion?: number;
  limit?: number;
  reverse?: boolean;
  pageToken?: string;
};

export type ListSnapshotsOutput = {
  /** Keys only — payloads not loaded. */
  snapshotKeys: SnapshotKey[];
  nextPageToken?: string;
};

/**
 * Pluggable port for snapshot storage. Mirrors `EventStorageAdapter` in shape:
 * a stateless object with a fixed set of methods. Multiple `EventStore`s can
 * share one adapter, so methods always take the `eventStoreId` via context.
 *
 * The adapter itself is non-generic (operating on `Snapshot<Aggregate>`); the
 * `EventStore` handles aggregate-type casts at the boundary, exactly like
 * `EventStorageAdapter` does for events.
 */
export interface SnapshotStorageAdapter {
  /**
   * Hot path. Used by `EventStore.getAggregate`. Returns the highest-version
   * snapshot for the given aggregate, or `undefined` if none.
   *
   * `aggregateMaxVersion` lets `getAggregate({ maxVersion })` retrieve a
   * snapshot bounded by the requested version. `reducerVersion` lets the
   * caller pre-filter to only snapshots matching a specific reducer
   * fingerprint (the EventStore additionally enforces this client-side).
   */
  getLatestSnapshot: (
    aggregateId: string,
    context: EventStoreContext,
    options?: { aggregateMaxVersion?: number; reducerVersion?: string },
  ) => Promise<{ snapshot: Snapshot | undefined }>;

  /**
   * Read a specific snapshot by key. Used during migration/inspection helpers.
   */
  getSnapshot: (
    snapshotKey: SnapshotKey,
    context: EventStoreContext,
  ) => Promise<{ snapshot: Snapshot | undefined }>;

  /**
   * Persist a snapshot. Implementations may overwrite an existing snapshot
   * with the same (aggregateId, aggregateVersion, reducerVersion) key.
   */
  putSnapshot: (
    snapshot: Snapshot,
    context: EventStoreContext,
  ) => Promise<void>;

  /**
   * Delete a single snapshot. No-op if the snapshot is already gone.
   */
  deleteSnapshot: (
    snapshotKey: SnapshotKey,
    context: EventStoreContext,
  ) => Promise<void>;

  /**
   * List snapshot keys (not payloads). With `reducerVersion` set, this gives
   * an efficient way to enumerate every snapshot for one outdated reducer
   * version across all aggregates — that's what the `cleanUpOutdatedSnapshots`
   * helper uses to be O(M) in the number of stale snapshots, not O(table size).
   */
  listSnapshots: (
    context: EventStoreContext,
    options?: ListSnapshotsOptions,
  ) => Promise<ListSnapshotsOutput>;
}
