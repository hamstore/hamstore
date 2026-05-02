import type { Aggregate } from '~/aggregate';

import type { Snapshot } from './snapshotStorageAdapter';

/**
 * Inputs passed to `shouldSaveSnapshot` callbacks (the policy decides whether
 * to persist a new snapshot after a `getAggregate` call rebuilt one).
 *
 * - `aggregate` is the aggregate just rebuilt. Always defined when
 *   `shouldSaveSnapshot` is invoked: we never call the policy without an
 *   aggregate to potentially save.
 * - `previousSnapshot` is the snapshot that seeded the rebuild, if any.
 * - `newEventCount` is the number of events fetched on top of
 *   `previousSnapshot` to produce `aggregate`. With no previous snapshot it is
 *   the total number of events read.
 * - `now` is provided by the EventStore so policies can be deterministic in
 *   tests.
 */
export type ShouldSaveSnapshotArgs<AGGREGATE extends Aggregate = Aggregate> = {
  aggregate: AGGREGATE;
  previousSnapshot?: Snapshot<AGGREGATE>;
  newEventCount: number;
  now: Date;
};

export type ShouldSaveSnapshot<AGGREGATE extends Aggregate = Aggregate> = (
  args: ShouldSaveSnapshotArgs<AGGREGATE>,
) => boolean;

/**
 * When and how often to persist snapshots.
 *
 * - `NONE` — never save a snapshot automatically. Useful when you only ever
 *   write snapshots manually (compaction-style use cases, future PR).
 * - `EVERY_N_VERSIONS` — save when the version gap to the previous snapshot
 *   reaches `periodInVersions` (or there is no previous snapshot and the
 *   aggregate has at least that many versions).
 * - `EVERY_N_MS_SINCE_LAST` — save when the elapsed time since the previous
 *   snapshot's `savedAt` reaches `periodInMs`. With no previous snapshot the
 *   policy fires on the first read.
 * - `AUTO` — adaptive: save more often for high-throughput aggregates and
 *   less often for low-throughput ones, bounded by `min`/`max` values. The
 *   first snapshot is taken once `minPeriodInVersions` is reached; subsequent
 *   snapshots use a target version-gap that grows linearly with elapsed time
 *   between `minPeriodInMs` and `maxPeriodInMs`, clamped to
 *   `[minPeriodInVersions, maxPeriodInVersions]`.
 * - `CUSTOM` — bring your own predicate.
 */
export type SnapshotPolicy<AGGREGATE extends Aggregate = Aggregate> =
  | { strategy: 'NONE' }
  | { strategy: 'EVERY_N_VERSIONS'; periodInVersions: number }
  | { strategy: 'EVERY_N_MS_SINCE_LAST'; periodInMs: number }
  | {
      strategy: 'AUTO';
      /** Default: 25. */
      minPeriodInVersions?: number;
      /** Default: 500. */
      maxPeriodInVersions?: number;
      /** Default: 1 hour. */
      minPeriodInMs?: number;
      /** Default: 24 hours. */
      maxPeriodInMs?: number;
    }
  | {
      strategy: 'CUSTOM';
      shouldSaveSnapshot: ShouldSaveSnapshot<AGGREGATE>;
    };

/**
 * What to do with older snapshots after a new one is saved successfully.
 *
 * - `NONE` — keep them all (useful if you query snapshots for audit/history).
 * - `DELETE_PREVIOUS` — keep only the latest snapshot per aggregate.
 * - `KEEP_LAST_N` — keep the latest `n` snapshots per aggregate.
 */
export type PruningPolicy =
  | { strategy: 'NONE' }
  | { strategy: 'DELETE_PREVIOUS' }
  | { strategy: 'KEEP_LAST_N'; n: number };

export interface SnapshotConfig<AGGREGATE extends Aggregate = Aggregate> {
  /**
   * Reducer fingerprint. Bump whenever the reducer's logic or the aggregate
   * shape changes. Snapshots written under a different value are NEVER
   * applied to the current reducer (they are migrated if a migrator is
   * configured, or ignored and rebuilt from events otherwise).
   *
   * A common pattern is to derive this from a build identifier or to
   * increment manually:
   *
   *     currentReducerVersion: 'v3',
   */
  currentReducerVersion: string;

  /** When to save snapshots. */
  policy: SnapshotPolicy<AGGREGATE>;

  /** What to do with older snapshots after a successful save. Defaults to `DELETE_PREVIOUS`. */
  pruning?: PruningPolicy;

  /**
   * Optional. When `getAggregate` finds a snapshot under a different
   * `reducerVersion`, this hook is invoked. If it returns a snapshot under
   * the current reducer version, that snapshot is used as the seed. If it
   * returns `undefined` (or is not configured), the snapshot is ignored and
   * the aggregate is rebuilt from events.
   *
   * Useful when reducer changes are backwards-compatible and you can avoid a
   * full rebuild.
   */
  migrateSnapshotReducerVersion?: (
    snapshot: Snapshot<AGGREGATE>,
  ) =>
    | Promise<Snapshot<AGGREGATE> | undefined>
    | Snapshot<AGGREGATE>
    | undefined;
}
