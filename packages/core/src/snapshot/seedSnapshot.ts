import type { Aggregate } from '~/aggregate';

import type { Snapshot } from './snapshotStorageAdapter';

/**
 * The snapshot that seeded (or could have seeded) an aggregate load, in the
 * form threaded back into the write path so the snapshot policy can decide
 * whether a *new* snapshot is warranted.
 *
 * This is the canonical wrapper used everywhere a "snapshot that backs an
 * aggregate" is referenced — `getAggregate`'s output, the `pushEvent` /
 * `pushEventGroup` option, the policy args and what an `AggregateHandle`
 * carries. The raw {@link Snapshot} stays the stored, on-the-wire payload and
 * lives inside the `present` variant.
 *
 * Two known states are modelled here; a third — *unknown* — is represented by
 * the **absence** of a `SeedSnapshot` altogether (an omitted `seedSnapshot`
 * option, i.e. `undefined`). The distinction matters:
 *
 * - `present` — a snapshot seeded the read; the policy evaluates fully
 *   (version gap and elapsed time relative to it).
 * - `absent` — we looked and there was no snapshot to seed from. We *know*
 *   none exists, so time-based policies should establish a first snapshot
 *   rather than skip forever.
 * - `undefined` (unknown) — the caller never supplied it (e.g. a raw
 *   `pushEvent` with no preceding read). We cannot reason about elapsed time
 *   or a version gap, so only history-free policies fire.
 *
 * The union is intentionally shaped to grow: the `absent` variant is the
 * natural home for future metadata such as the `reducerVersion` of a snapshot
 * that existed but was declined (e.g. incompatible reducer version, not
 * migrated) — a signal the policy may later use to snapshot eagerly.
 */
export type SeedSnapshot<AGGREGATE extends Aggregate = Aggregate> =
  | { status: 'present'; snapshot: Snapshot<AGGREGATE> }
  | { status: 'absent' };

/** Wrap a loaded snapshot as a `present` {@link SeedSnapshot}. */
export const presentSeedSnapshot = <AGGREGATE extends Aggregate>(
  snapshot: Snapshot<AGGREGATE>,
): SeedSnapshot<AGGREGATE> => ({ status: 'present', snapshot });

/**
 * The `absent` (known-none) {@link SeedSnapshot}.
 *
 * Typed as the bare `absent` variant (rather than `SeedSnapshot`) so it is
 * assignable to `SeedSnapshot<A>` for *any* aggregate `A` — the `absent`
 * variant carries no aggregate, so there is nothing to make it invariant.
 */
export const absentSeedSnapshot: { readonly status: 'absent' } = {
  status: 'absent',
};

/**
 * Narrow a `SeedSnapshot` (or `undefined` for the unknown state) to the
 * underlying {@link Snapshot}, or `undefined` when not `present`.
 */
export const seedSnapshotValue = <AGGREGATE extends Aggregate>(
  seedSnapshot: SeedSnapshot<AGGREGATE> | undefined,
): Snapshot<AGGREGATE> | undefined =>
  seedSnapshot?.status === 'present' ? seedSnapshot.snapshot : undefined;
