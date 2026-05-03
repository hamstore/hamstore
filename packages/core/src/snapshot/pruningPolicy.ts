import type {
  PruningPolicy,
  ShouldKeepSnapshot,
  ShouldKeepSnapshotArgs,
} from './snapshotConfig';

const validatePositive = (label: string, value: number): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Invalid PruningPolicy: ${label} must be a positive finite number, got ${String(
        value,
      )}`,
    );
  }
};

const validatePositiveInteger = (label: string, value: number): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `Invalid PruningPolicy: ${label} must be a positive integer, got ${String(
        value,
      )}`,
    );
  }
};

const keepAll: ShouldKeepSnapshot = () => true;

const keepNewest: ShouldKeepSnapshot = ({ position }) => position === 0;

const keepLastN =
  (n: number): ShouldKeepSnapshot =>
  ({ position }) =>
    position < n;

const keepNewerThanMs =
  (ageMs: number): ShouldKeepSnapshot =>
  ({ position, ageMs: candidateAgeMs }) =>
    // Always keep the newest snapshot (position 0) so an "all snapshots are
    // older than the window" prune doesn't wipe the cache.
    position === 0 || candidateAgeMs <= ageMs;

/**
 * Compile a `PruningPolicy` into a runtime `shouldKeep` predicate.
 *
 * The predicate returns `true` for snapshots to KEEP and `false` for
 * snapshots to DELETE. It is invoked once per candidate snapshot key with
 * its 0-based newest-first `position` and `ageMs`.
 *
 * All built-in non-`NONE` strategies always preserve the newest snapshot
 * (position 0) so an over-eager prune cannot wipe out the cache.
 *
 * Exposed so the offline pruning helpers and tests can reuse the same
 * compilation the EventStore uses internally.
 */
export const compilePruningPolicy = (
  policy: PruningPolicy,
): ShouldKeepSnapshot => {
  switch (policy.strategy) {
    case 'NONE':
      return keepAll;

    case 'DELETE_PREVIOUS':
      return keepNewest;

    case 'KEEP_LAST_N':
      validatePositiveInteger('n', policy.n);

      return keepLastN(policy.n);

    case 'KEEP_NEWER_THAN_MS':
      validatePositive('ageMs', policy.ageMs);

      return keepNewerThanMs(policy.ageMs);

    case 'CUSTOM':
      return policy.shouldKeep;
  }
};

export type { ShouldKeepSnapshot, ShouldKeepSnapshotArgs };
