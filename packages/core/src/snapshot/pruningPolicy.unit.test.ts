import { describe, it, expect } from 'vitest';

import { compilePruningPolicy } from './pruningPolicy';
import type { ShouldKeepSnapshotArgs } from './snapshotConfig';

const now = new Date('2024-06-15T12:00:00.000Z');

const argsAt = (
  position: number,
  ageMs: number,
): ShouldKeepSnapshotArgs => ({
  key: {
    aggregateId: 'a1',
    aggregateVersion: 100 - position,
    reducerVersion: 'v1',
    savedAt: new Date(now.getTime() - ageMs).toISOString(),
  },
  position,
  ageMs,
  now,
});

describe('compilePruningPolicy', () => {
  describe('NONE', () => {
    it('keeps every snapshot', () => {
      const shouldKeep = compilePruningPolicy({ strategy: 'NONE' });

      expect(shouldKeep(argsAt(0, 0))).toBe(true);
      expect(shouldKeep(argsAt(5, 1_000_000))).toBe(true);
    });
  });

  describe('DELETE_PREVIOUS', () => {
    it('keeps only position 0', () => {
      const shouldKeep = compilePruningPolicy({ strategy: 'DELETE_PREVIOUS' });

      expect(shouldKeep(argsAt(0, 0))).toBe(true);
      expect(shouldKeep(argsAt(1, 0))).toBe(false);
      expect(shouldKeep(argsAt(2, 0))).toBe(false);
    });
  });

  describe('KEEP_LAST_N', () => {
    it('keeps positions 0..n-1', () => {
      const shouldKeep = compilePruningPolicy({ strategy: 'KEEP_LAST_N', n: 3 });

      expect(shouldKeep(argsAt(0, 0))).toBe(true);
      expect(shouldKeep(argsAt(1, 0))).toBe(true);
      expect(shouldKeep(argsAt(2, 0))).toBe(true);
      expect(shouldKeep(argsAt(3, 0))).toBe(false);
      expect(shouldKeep(argsAt(4, 0))).toBe(false);
    });

    it.each([
      [0, 'must be a positive integer'],
      [-1, 'must be a positive integer'],
      [1.5, 'must be a positive integer'],
      [Number.NaN, 'must be a positive integer'],
    ])('rejects n=%s', (n, expected) => {
      expect(() => compilePruningPolicy({ strategy: 'KEEP_LAST_N', n })).toThrow(
        expected,
      );
    });
  });

  describe('KEEP_NEWER_THAN_MS', () => {
    it('keeps snapshots within the window AND always keeps position 0', () => {
      const oneHour = 60 * 60 * 1000;
      const shouldKeep = compilePruningPolicy({
        strategy: 'KEEP_NEWER_THAN_MS',
        ageMs: oneHour,
      });

      // Within window
      expect(shouldKeep(argsAt(1, oneHour - 1))).toBe(true);
      expect(shouldKeep(argsAt(1, oneHour))).toBe(true);
      // Outside window, but not the newest
      expect(shouldKeep(argsAt(1, oneHour + 1))).toBe(false);
      // Outside window AND newest -> still kept
      expect(shouldKeep(argsAt(0, oneHour * 1000))).toBe(true);
    });

    it.each([
      [0, 'must be a positive finite number'],
      [-1, 'must be a positive finite number'],
      [Number.NaN, 'must be a positive finite number'],
      [Number.POSITIVE_INFINITY, 'must be a positive finite number'],
    ])('rejects ageMs=%s', (ageMs, expected) => {
      expect(() =>
        compilePruningPolicy({ strategy: 'KEEP_NEWER_THAN_MS', ageMs }),
      ).toThrow(expected);
    });
  });

  describe('CUSTOM', () => {
    it('passes through the user-provided shouldKeep', () => {
      const shouldKeep = compilePruningPolicy({
        strategy: 'CUSTOM',
        shouldKeep: ({ position }) => position % 2 === 0,
      });

      expect(shouldKeep(argsAt(0, 0))).toBe(true);
      expect(shouldKeep(argsAt(1, 0))).toBe(false);
      expect(shouldKeep(argsAt(2, 0))).toBe(true);
    });
  });
});
