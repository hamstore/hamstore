/* eslint-disable max-lines */
import { describe, it, expect } from 'vitest';

import { compileSnapshotPolicy } from './policy';
import {
  absentSeedSnapshot,
  presentSeedSnapshot,
  type SeedSnapshot,
} from './seedSnapshot';
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

const present = (
  version: number,
  savedAt?: string,
): SeedSnapshot<Aggregate> => presentSeedSnapshot(makeSnapshot(version, savedAt));

const now = new Date('2024-01-01T01:00:00.000Z');

describe('compileSnapshotPolicy', () => {
  describe('NONE', () => {
    it('always returns false regardless of seedSnapshot state', () => {
      const should = compileSnapshotPolicy<Aggregate>({ strategy: 'NONE' });

      for (const seedSnapshot of [
        undefined,
        absentSeedSnapshot,
        present(50),
      ] as const) {
        expect(
          should({
            aggregate: makeAggregate(100),
            seedSnapshot,
            newEventCount: 100,
            now,
          }),
        ).toBe(false);
      }
    });
  });

  describe('EVERY_N_VERSIONS', () => {
    const policy = { strategy: 'EVERY_N_VERSIONS' as const, periodInVersions: 50 };

    it('unknown (undefined): fires on exact multiples of the period', () => {
      const should = compileSnapshotPolicy<Aggregate>(policy);

      for (const version of [50, 100, 150]) {
        expect(
          should({
            aggregate: makeAggregate(version),
            seedSnapshot: undefined,
            newEventCount: 1,
            now,
          }),
        ).toBe(true);
      }

      for (const version of [1, 49, 51, 99, 101]) {
        expect(
          should({
            aggregate: makeAggregate(version),
            seedSnapshot: undefined,
            newEventCount: 1,
            now,
          }),
        ).toBe(false);
      }
    });

    it('absent: fires once the aggregate reaches the period', () => {
      const should = compileSnapshotPolicy<Aggregate>(policy);

      expect(
        should({
          aggregate: makeAggregate(50),
          seedSnapshot: absentSeedSnapshot,
          newEventCount: 50,
          now,
        }),
      ).toBe(true);

      expect(
        should({
          aggregate: makeAggregate(49),
          seedSnapshot: absentSeedSnapshot,
          newEventCount: 49,
          now,
        }),
      ).toBe(false);
    });

    it('present: fires when the version gap to the seed reaches the period', () => {
      const should = compileSnapshotPolicy<Aggregate>(policy);

      expect(
        should({
          aggregate: makeAggregate(150),
          seedSnapshot: present(100),
          newEventCount: 50,
          now,
        }),
      ).toBe(true);

      expect(
        should({
          aggregate: makeAggregate(149),
          seedSnapshot: present(100),
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

    it('unknown (undefined): never fires (no time data to reason about)', () => {
      const should = compileSnapshotPolicy<Aggregate>(policy);

      expect(
        should({
          aggregate: makeAggregate(50),
          seedSnapshot: undefined,
          newEventCount: 1,
          now,
        }),
      ).toBe(false);
    });

    it('absent: fires to establish the first snapshot', () => {
      const should = compileSnapshotPolicy<Aggregate>(policy);

      expect(
        should({
          aggregate: makeAggregate(1),
          seedSnapshot: absentSeedSnapshot,
          newEventCount: 1,
          now,
        }),
      ).toBe(true);
    });

    it('present: fires when elapsed since the seed >= period', () => {
      const should = compileSnapshotPolicy<Aggregate>(policy);

      expect(
        should({
          aggregate: makeAggregate(2),
          seedSnapshot: present(
            1,
            new Date(now.getTime() - 120_000).toISOString(),
          ),
          newEventCount: 1,
          now,
        }),
      ).toBe(true);
    });

    it('present: does not fire when elapsed since the seed < period', () => {
      const should = compileSnapshotPolicy<Aggregate>(policy);

      expect(
        should({
          aggregate: makeAggregate(2),
          seedSnapshot: present(
            1,
            new Date(now.getTime() - 30_000).toISOString(),
          ),
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
    it('unknown (undefined): never fires (no elapsed-time target)', () => {
      const should = compileSnapshotPolicy<Aggregate>({ strategy: 'AUTO' });

      expect(
        should({
          aggregate: makeAggregate(1000),
          seedSnapshot: undefined,
          newEventCount: 1,
          now,
        }),
      ).toBe(false);
    });

    it('absent: fires once the default minPeriodInVersions is reached', () => {
      const should = compileSnapshotPolicy<Aggregate>({ strategy: 'AUTO' });

      expect(
        should({
          aggregate: makeAggregate(24),
          seedSnapshot: absentSeedSnapshot,
          newEventCount: 24,
          now,
        }),
      ).toBe(false);

      expect(
        should({
          aggregate: makeAggregate(25),
          seedSnapshot: absentSeedSnapshot,
          newEventCount: 25,
          now,
        }),
      ).toBe(true);
    });

    it('present: a large elapsed time lowers the target gap toward the min', () => {
      const should = compileSnapshotPolicy<Aggregate>({ strategy: 'AUTO' });
      // Elapsed >= maxPeriodInMs (24h) → target gap clamps to minPeriodInVersions (25).
      const seedSnapshot = present(
        100,
        new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
      );

      expect(
        should({
          aggregate: makeAggregate(125),
          seedSnapshot,
          newEventCount: 25,
          now,
        }),
      ).toBe(true);

      expect(
        should({
          aggregate: makeAggregate(124),
          seedSnapshot,
          newEventCount: 24,
          now,
        }),
      ).toBe(false);
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
          seedSnapshot: undefined,
          newEventCount: 0,
          now,
        }),
      ).toBe(true);

      expect(
        should({
          aggregate: makeAggregate(8),
          seedSnapshot: undefined,
          newEventCount: 0,
          now,
        }),
      ).toBe(false);
    });

    it('receives the full tri-state seedSnapshot', () => {
      const should = compileSnapshotPolicy<Aggregate>({
        strategy: 'CUSTOM',
        shouldSaveSnapshot: ({ seedSnapshot }) =>
          seedSnapshot?.status === 'present' &&
          seedSnapshot.snapshot.aggregate.version === 3,
      });

      expect(
        should({
          aggregate: makeAggregate(10),
          seedSnapshot: present(3),
          newEventCount: 1,
          now,
        }),
      ).toBe(true);

      expect(
        should({
          aggregate: makeAggregate(10),
          seedSnapshot: absentSeedSnapshot,
          newEventCount: 1,
          now,
        }),
      ).toBe(false);
    });
  });
});
