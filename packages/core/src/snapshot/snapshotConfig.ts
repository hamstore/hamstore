/* eslint-disable max-lines */
import type { Aggregate } from '~/aggregate';

import type { SeedSnapshot } from './seedSnapshot';
import type { Snapshot, SnapshotKey } from './snapshotStorageAdapter';

/**
 * Inputs passed to `shouldSaveSnapshot` callbacks. The policy decides whether
 * to persist a *new* snapshot after a successful `pushEvent` / `pushEventGroup`
 * produced `aggregate`.
 *
 * - `aggregate` is the aggregate just produced. Always defined when
 *   `shouldSaveSnapshot` is invoked: we never call the policy without an
 *   aggregate to potentially save.
 * - `seedSnapshot` is the snapshot that seeded the aggregate the caller pushed
 *   onto, in tri-state form (see {@link SeedSnapshot}):
 *     - `{ status: 'present' }` — a snapshot seeded the load; spacing is
 *       computed relative to it.
 *     - `{ status: 'absent' }` — the load found no snapshot; establish a first
 *       one.
 *     - `undefined` — unknown (the caller did not supply it, e.g. a raw
 *       `pushEvent` with no preceding read); only history-free policies fire.
 * - `newEventCount` is the number of events committed in this operation on top
 *   of the aggregate (`1` for a single `pushEvent`).
 * - `now` is provided by the EventStore so policies can be deterministic in
 *   tests.
 */
export type ShouldSaveSnapshotArgs<AGGREGATE extends Aggregate = Aggregate> = {
  aggregate: AGGREGATE;
  seedSnapshot: SeedSnapshot<AGGREGATE> | undefined;
  newEventCount: number;
  now: Date;
};

export type ShouldSaveSnapshot<AGGREGATE extends Aggregate = Aggregate> = (
  args: ShouldSaveSnapshotArgs<AGGREGATE>,
) => boolean;

/**
 * When and how often to persist snapshots.
 *
 * The policy is evaluated on the write path with the `seedSnapshot` that
 * seeded the aggregate being pushed onto (see {@link ShouldSaveSnapshotArgs}).
 * Each strategy reacts to the three `seedSnapshot` states (present / absent /
 * unknown):
 *
 * - `NONE` — never save a snapshot automatically. Useful when you only ever
 *   write snapshots manually (compaction-style use cases, future PR).
 * - `EVERY_N_VERSIONS` — `present`: save when the version gap to the seed
 *   snapshot reaches `periodInVersions`. `absent`: save once the aggregate has
 *   at least that many versions. `unknown`: save when `version %
 *   periodInVersions === 0` (history-free steady-state spacing).
 * - `EVERY_N_MS_SINCE_LAST` — `present`: save when the elapsed time since the
 *   seed snapshot's `savedAt` reaches `periodInMs`. `absent`: save (establish
 *   the first snapshot). `unknown`: never fires (no time data to reason about).
 * - `AUTO` — adaptive: save more often for high-throughput aggregates and
 *   less often for low-throughput ones, bounded by `min`/`max` values.
 *   `present`: target version-gap grows linearly with elapsed time between
 *   `minPeriodInMs` and `maxPeriodInMs`, clamped to `[minPeriodInVersions,
 *   maxPeriodInVersions]`. `absent`: save once `minPeriodInVersions` is
 *   reached. `unknown`: never fires.
 * - `CUSTOM` — bring your own predicate (receives the full `seedSnapshot`).
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
 * Inputs passed to a `CUSTOM` pruning callback for a single candidate
 * snapshot key.
 *
 * - `key` is the candidate snapshot's key (with `savedAt`).
 * - `position` is the snapshot's 0-based index when sorted newest-first
 *   within its aggregate (0 = newest, 1 = next-newest, …). The newly-saved
 *   snapshot is always at `position: 0`.
 * - `ageMs` is `now.getTime() - new Date(key.savedAt).getTime()`.
 * - `now` is provided by the caller so policies can be deterministic in
 *   tests.
 */
export type ShouldKeepSnapshotArgs = {
  key: SnapshotKey;
  position: number;
  ageMs: number;
  now: Date;
};

export type ShouldKeepSnapshot = (args: ShouldKeepSnapshotArgs) => boolean;

/**
 * What to do with older snapshots after a new one is saved successfully, or
 * during an offline `pruneAggregateSnapshots` / `pruneEventStoreSnapshots`
 * sweep.
 *
 * - `NONE` — keep them all (useful if you query snapshots for audit/history,
 *   or if you want to prune offline rather than on the hot path).
 * - `DELETE_PREVIOUS` — keep only the latest snapshot per aggregate.
 * - `KEEP_LAST_N` — keep the latest `n` snapshots per aggregate.
 * - `KEEP_NEWER_THAN_MS` — keep every snapshot whose `savedAt` is within
 *   `ageMs` of "now" (rolling window). Older snapshots are pruned.
 *   Snapshots written in the future (clock skew) are always kept.
 * - `CUSTOM` — bring your own per-snapshot predicate.
 */
export type PruningPolicy =
  | { strategy: 'NONE' }
  | { strategy: 'DELETE_PREVIOUS' }
  | { strategy: 'KEEP_LAST_N'; n: number }
  | { strategy: 'KEEP_NEWER_THAN_MS'; ageMs: number }
  | { strategy: 'CUSTOM'; shouldKeep: ShouldKeepSnapshot };

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

  /**
   * What to do with older snapshots after a successful save. Defaults to
   * `{ strategy: 'NONE' }` — i.e. *no inline pruning*. This keeps the write
   * path lean (one `putSnapshot`, no `listSnapshots` / `deleteSnapshot`
   * calls) at the cost of letting old snapshots accumulate.
   *
   * For low-traffic services / demos, `{ strategy: 'DELETE_PREVIOUS' }` is
   * a reasonable inline default.
   *
   * For production / serverless, prefer the default and run pruning
   * **offline** via `pruneAggregateSnapshots` / `pruneEventStoreSnapshots`
   * (see `~/snapshot`). That keeps the hot path's adapter cost predictable
   * (one `putSnapshot` per save) while still bounding storage.
   */
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

  /**
   * Optional. Routes the snapshot save (+ prune) work scheduled after a
   * successful `pushEvent` / `pushEventGroup` to a host-provided background
   * runner instead of awaiting it inline.
   *
   * By default (hook absent) the save is **awaited** as part of the push, so
   * it cannot be lost — important on platforms that freeze the event loop
   * once the response is flushed (e.g. AWS Lambda). The cost is a little
   * write latency whenever the policy fires.
   *
   * Provide this hook to keep that latency off the request's critical path
   * while still guaranteeing the work runs: plumb `work` into a
   * request-scoped "wait until" tracker (e.g. an explicit pending-work
   * registry that drains before the response commits). The EventStore never
   * awaits `work` itself when the hook is set — ownership transfers to the
   * host. `work` already catches its own errors (routed through
   * `onSnapshotError`), so it never rejects.
   */
  scheduleBackgroundWork?: (work: () => Promise<void>) => void;

  /**
   * Optional. Invoked when a snapshot read (seeding) or save/prune operation
   * throws. The EventStore swallows the error in both cases (reads fall back
   * to events, save/prune is best-effort) — this hook lets you route those
   * errors to your observability stack of choice. If not provided, errors
   * are silently swallowed.
   *
   * `phase` distinguishes the seeding read path (`'read'`) from the save /
   * prune path (`'save'` / `'prune'`).
   */
  onSnapshotError?: (args: {
    phase: 'read' | 'save' | 'prune';
    aggregateId?: string;
    eventStoreId: string;
    error: unknown;
  }) => void;
}
