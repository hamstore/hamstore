/* eslint-disable max-lines */
import { describe, it, expect } from 'vitest';

import { compileSnapshotPolicy } from './policy';
import type { Snapshot } from './snapshotStorageAdapter';

type Aggregate = { aggregateId: string; version: number };

const makeAggregate = (version: number): Aggregate => ({
  aggregateId: 'a1',
  version,
});

const makeSnapshot = (
  version: number,
  savedAt = new Date('2024-01-01T00:00:00.000Z').toISOString(),
): Snapshot<Aggregate> => ({
  aggregate: makeAggregate(version),
  reducerVersion: 'v1',
  eventStoreId: 'store',
  savedAt,
});

const now = new Date('2024-01-01T01:00:00.000Z');

describe('compileSnapshotPolicy', () => {
  describe('NONE', () => {
    it('always returns false', () => {
      const should = compileSnapshotPolicy<Aggregate>({ strategy: 'NONE' });

      expect(
        should({
          aggregate: makeAggregate(100),
          previousSnapshot: undefined,
          newEventCount: 100,
          now,
        }),
      ).toBe(false);
    });
  });

  describe('EVERY_N_VERSIONS', () => {
    const policy = { strategy: 'EVERY_N_VERSIONS' as const, periodInVersions: 50 };

    it('returns true when no previous snapshot and version >= period', () => {
      const should = compileSnapshotPolicy<Aggregate>(policy);

      expect(
        should({
          aggregate: makeAggregate(50),
          previousSnapshot: undefined,
          newEventCount: 50,
          now,
        }),
      ).toBe(true);
    });

    it('returns false when no previous snapshot and version < period', () => {
      const should = compileSnapshotPolicy<Aggregate>(policy);

      expect(
        should({
          aggregate: makeAggregate(49),
          previousSnapshot: undefined,
          newEventCount: 49,
          now,
        }),
      ).toBe(false);
    });

    it('returns true when version - previousSnapshot.version >= period', () => {
      const should = compileSnapshotPolicy<Aggregate>(policy);

      expect(
        should({
          aggregate: makeAggregate(150),
          previousSnapshot: makeSnapshot(100),
          newEventCount: 50,
          now,
        }),
      ).toBe(true);
    });

    it('returns false when version - previousSnapshot.version < period', () => {
      const should = compileSnapshotPolicy<Aggregate>(policy);

      expect(
        should({
          aggregate: makeAggregate(149),
          previousSnapshot: makeSnapshot(100),
          newEventCount: 49,
          now,
        }),
      ).toBe(false);
    });

    it('rejects invalid period', () => {
      expect(() =>
        compileSnapshotPolicy({
          strategy: 'EVERY_N_VERSIONS',
          periodInVersions: 0,
        }),
      ).toThrow();

      expect(() =>
        compileSnapshotPolicy({
          strategy: 'EVERY_N_VERSIONS',
          periodInVersions: -1,
        }),
      ).toThrow();
    });
  });

  describe('EVERY_N_MS_SINCE_LAST', () => {
    const policy = {
      strategy: 'EVERY_N_MS_SINCE_LAST' as const,
      periodInMs: 60_000,
    };

    it('returns true when no previous snapshot exists', () => {
      const should = compileSnapshotPolicy<Aggregate>(policy);

      expect(
        should({
          aggregate: makeAggregate(1),
          previousSnapshot: undefined,
          newEventCount: 1,
          now,
        }),
      ).toBe(true);
    });

    it('returns true when elapsed >= period', () => {
      const should = compileSnapshotPolicy<Aggregate>(policy);
      const previousSnapshot = makeSnapshot(
        1,
        new Date(now.getTime() - 120_000).toISOString(),
      );

      expect(
        should({
          aggregate: makeAggregate(2),
          previousSnapshot,
          newEventCount: 1,
          now,
        }),
      ).toBe(true);
    });

    it('returns false when elapsed < period', () => {
      const should = compileSnapshotPolicy<Aggregate>(policy);
      const previousSnapshot = makeSnapshot(
        1,
        new Date(now.getTime() - 30_000).toISOString(),
      );

      expect(
        should({
          aggregate: makeAggregate(2),
          previousSnapshot,
          newEventCount: 1,
          now,
        }),
      ).toBe(false);
    });

    it('rejects invalid period', () => {
      expect(() =>
        compileSnapshotPolicy({
          strategy: 'EVERY_N_MS_SINCE_LAST',
          periodInMs: 0,
        }),
      ).toThrow();
    });
  });

  describe('AUTO', () => {
    it('uses default min/max when no overrides are provided', () => {
      const should = compileSnapshotPolicy<Aggregate>({ strategy: 'AUTO' });

      expect(
        should({
          aggregate: makeAggregate(24),
          previousSnapshot: undefined,
          newEventCount: 24,
          now,
        }),
      ).toBe(false);

      expect(
        should({
          aggregate: makeAggregate(25),
          previousSnapshot: undefined,
          newEventCount: 25,
          now,
        }),
      ).toBe(true);
    });

    it('rejects min > max', () => {
      expect(() =>
        compileSnapshotPolicy({
          strategy: 'AUTO',
          minPeriodInVersions: 100,
          maxPeriodInVersions: 50,
        }),
      ).toThrow();

      expect(() =>
        compileSnapshotPolicy({
          strategy: 'AUTO',
          minPeriodInMs: 10,
          maxPeriodInMs: 5,
        }),
      ).toThrow();
    });
  });

  describe('CUSTOM', () => {
    it('passes through the user-supplied callback', () => {
      const should = compileSnapshotPolicy<Aggregate>({
        strategy: 'CUSTOM',
        shouldSaveSnapshot: ({ aggregate }) => aggregate.version === 7,
      });

      expect(
        should({
          aggregate: makeAggregate(7),
          previousSnapshot: undefined,
          newEventCount: 0,
          now,
        }),
      ).toBe(true);

      expect(
        should({
          aggregate: makeAggregate(8),
          previousSnapshot: undefined,
          newEventCount: 0,
          now,
        }),
      ).toBe(false);
    });
  });
});
