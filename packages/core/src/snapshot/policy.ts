/* eslint-disable max-lines */
import type { Aggregate } from '~/aggregate';

import type {
  ShouldSaveSnapshot,
  ShouldSaveSnapshotArgs,
  SnapshotPolicy,
} from './snapshotConfig';

const AUTO_DEFAULTS = {
  minPeriodInVersions: 25,
  maxPeriodInVersions: 500,
  minPeriodInMs: 60 * 60 * 1000, // 1 hour
  maxPeriodInMs: 24 * 60 * 60 * 1000, // 24 hours
};

const everyNVersions =
  (periodInVersions: number): ShouldSaveSnapshot =>
  ({ aggregate, previousSnapshot }) => {
    if (previousSnapshot === undefined) {
      return aggregate.version >= periodInVersions;
    }

    return (
      aggregate.version - previousSnapshot.aggregate.version >= periodInVersions
    );
  };

const everyNMsSinceLast =
  (periodInMs: number): ShouldSaveSnapshot =>
  ({ previousSnapshot, now }) => {
    if (previousSnapshot === undefined) {
      return true;
    }

    const lastSavedAt = Date.parse(previousSnapshot.savedAt);
    if (Number.isNaN(lastSavedAt)) {
      return true;
    }

    return now.getTime() - lastSavedAt >= periodInMs;
  };

const auto = (params: {
  minPeriodInVersions: number;
  maxPeriodInVersions: number;
  minPeriodInMs: number;
  maxPeriodInMs: number;
}): ShouldSaveSnapshot => {
  const {
    minPeriodInVersions,
    maxPeriodInVersions,
    minPeriodInMs,
    maxPeriodInMs,
  } = params;

  return ({ aggregate, previousSnapshot, now }) => {
    if (previousSnapshot === undefined) {
      return aggregate.version >= minPeriodInVersions;
    }

    const lastSavedAt = Date.parse(previousSnapshot.savedAt);
    const elapsedMs = Number.isNaN(lastSavedAt)
      ? maxPeriodInMs
      : now.getTime() - lastSavedAt;

    // Linearly map elapsedMs (clamped to [minPeriodInMs, maxPeriodInMs]) into
    // a target version gap (linearly between max..min — i.e. high-throughput
    // aggregates that fill up many events quickly fire sooner than slow ones).
    const clampedMs = Math.min(
      Math.max(elapsedMs, minPeriodInMs),
      maxPeriodInMs,
    );
    const ratio =
      maxPeriodInMs === minPeriodInMs
        ? 0
        : (clampedMs - minPeriodInMs) / (maxPeriodInMs - minPeriodInMs);
    const targetGap =
      maxPeriodInVersions -
      ratio * (maxPeriodInVersions - minPeriodInVersions);

    const actualGap = aggregate.version - previousSnapshot.aggregate.version;

    return actualGap >= targetGap;
  };
};

const validatePositive = (label: string, value: number): void => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Invalid SnapshotPolicy: ${label} must be a positive finite number, got ${String(
        value,
      )}`,
    );
  }
};

/**
 * Compile a `SnapshotPolicy` into a runtime `shouldSaveSnapshot` predicate.
 *
 * Exposed so adapter authors and tests can reuse the same policy compilation
 * the EventStore uses internally.
 */
export const compileSnapshotPolicy = <AGGREGATE extends Aggregate>(
  policy: SnapshotPolicy<AGGREGATE>,
): ShouldSaveSnapshot<AGGREGATE> => {
  switch (policy.strategy) {
    case 'NONE':
      return () => false;

    case 'EVERY_N_VERSIONS': {
      validatePositive('periodInVersions', policy.periodInVersions);

      return everyNVersions(policy.periodInVersions);
    }

    case 'EVERY_N_MS_SINCE_LAST': {
      validatePositive('periodInMs', policy.periodInMs);

      return everyNMsSinceLast(policy.periodInMs);
    }

    case 'AUTO':
      return compileAutoPolicy(policy);

    case 'CUSTOM':
      return policy.shouldSaveSnapshot as ShouldSaveSnapshot<AGGREGATE>;
  }
};

/**
 * Like `compileSnapshotPolicy`, but produces a predicate suitable for the
 * **write path** — i.e. evaluated *after* a `pushEvent` /
 * `pushEventGroup` succeeds and the new aggregate is in scope, **without**
 * the previous snapshot.
 *
 * Strategies that fundamentally need the previous snapshot to compute a
 * spacing decision are evaluated in a stateless mode (or skipped):
 *
 * - `EVERY_N_VERSIONS` — fires when `aggregate.version > 0 &&
 *   aggregate.version % periodInVersions === 0`. Equivalent steady-state
 *   spacing to the read-path version that subtracts from the previous
 *   snapshot's version.
 * - `EVERY_N_MS_SINCE_LAST` — silently returns `false` (no time data
 *   without the previous snapshot's `savedAt`). Users who need time-based
 *   policies should set `saveOn: 'read'` or `saveOn: 'both'`.
 * - `AUTO` — silently returns `false` for the same reason as above.
 * - `CUSTOM` — invoked with `previousSnapshot: undefined`; the user
 *   predicate decides.
 * - `NONE` — returns `false`.
 */
export const compileWritePathSnapshotPolicy = <AGGREGATE extends Aggregate>(
  policy: SnapshotPolicy<AGGREGATE>,
): ShouldSaveSnapshot<AGGREGATE> => {
  switch (policy.strategy) {
    case 'NONE':
      return () => false;

    case 'EVERY_N_VERSIONS': {
      validatePositive('periodInVersions', policy.periodInVersions);
      const period = policy.periodInVersions;

      return ({ aggregate }) =>
        aggregate.version > 0 && aggregate.version % period === 0;
    }

    case 'EVERY_N_MS_SINCE_LAST': {
      validatePositive('periodInMs', policy.periodInMs);

      return () => false;
    }

    case 'AUTO':
      validateAutoPolicy(policy); // throws on bad config

      return () => false;

    case 'CUSTOM':
      return policy.shouldSaveSnapshot as ShouldSaveSnapshot<AGGREGATE>;
  }
};

const validateAutoPolicy = (policy: {
  strategy: 'AUTO';
  minPeriodInVersions?: number;
  maxPeriodInVersions?: number;
  minPeriodInMs?: number;
  maxPeriodInMs?: number;
}): void => {
  const minPeriodInVersions =
    policy.minPeriodInVersions ?? AUTO_DEFAULTS.minPeriodInVersions;
  const maxPeriodInVersions =
    policy.maxPeriodInVersions ?? AUTO_DEFAULTS.maxPeriodInVersions;
  const minPeriodInMs = policy.minPeriodInMs ?? AUTO_DEFAULTS.minPeriodInMs;
  const maxPeriodInMs = policy.maxPeriodInMs ?? AUTO_DEFAULTS.maxPeriodInMs;

  validatePositive('minPeriodInVersions', minPeriodInVersions);
  validatePositive('maxPeriodInVersions', maxPeriodInVersions);
  validatePositive('minPeriodInMs', minPeriodInMs);
  validatePositive('maxPeriodInMs', maxPeriodInMs);

  if (minPeriodInVersions > maxPeriodInVersions) {
    throw new Error(
      'Invalid SnapshotPolicy AUTO: minPeriodInVersions > maxPeriodInVersions',
    );
  }

  if (minPeriodInMs > maxPeriodInMs) {
    throw new Error(
      'Invalid SnapshotPolicy AUTO: minPeriodInMs > maxPeriodInMs',
    );
  }
};

const compileAutoPolicy = (policy: {
  strategy: 'AUTO';
  minPeriodInVersions?: number;
  maxPeriodInVersions?: number;
  minPeriodInMs?: number;
  maxPeriodInMs?: number;
}): ShouldSaveSnapshot => {
  validateAutoPolicy(policy);

  return auto({
    minPeriodInVersions:
      policy.minPeriodInVersions ?? AUTO_DEFAULTS.minPeriodInVersions,
    maxPeriodInVersions:
      policy.maxPeriodInVersions ?? AUTO_DEFAULTS.maxPeriodInVersions,
    minPeriodInMs: policy.minPeriodInMs ?? AUTO_DEFAULTS.minPeriodInMs,
    maxPeriodInMs: policy.maxPeriodInMs ?? AUTO_DEFAULTS.maxPeriodInMs,
  });
};

export type { ShouldSaveSnapshotArgs };
