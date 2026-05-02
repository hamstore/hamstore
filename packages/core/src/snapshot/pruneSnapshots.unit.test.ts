/* eslint-disable max-lines */
import { describe, it, expect, vi } from 'vitest';

import {
  pruneAggregateSnapshots,
  pruneEventStoreSnapshots,
} from './pruneSnapshots';
import type {
  ListSnapshotsOutput,
  SnapshotKey,
  SnapshotStorageAdapter,
} from './snapshotStorageAdapter';

const eventStoreId = 'POKEMONS';
const baseDate = new Date('2024-01-01T00:00:00.000Z');

const makeKey = (
  aggregateId: string,
  aggregateVersion: number,
  ageMs: number,
  reducerVersion = 'v1',
): SnapshotKey => ({
  aggregateId,
  aggregateVersion,
  reducerVersion,
  savedAt: new Date(baseDate.getTime() - ageMs).toISOString(),
});

const makeAdapter = (
  pages: ListSnapshotsOutput[],
): SnapshotStorageAdapter & {
  listSnapshotsMock: ReturnType<typeof vi.fn>;
  deleteSnapshotMock: ReturnType<typeof vi.fn>;
} => {
  const queue = [...pages];
  const listSnapshotsMock = vi.fn().mockImplementation(async () => {
    const next = queue.shift();
    if (next === undefined) {
      return { snapshotKeys: [] };
    }

    return next;
  });
  const deleteSnapshotMock = vi.fn().mockResolvedValue(undefined);

  return {
    getLatestSnapshot: vi.fn(),
    getSnapshot: vi.fn(),
    putSnapshot: vi.fn(),
    deleteSnapshot: deleteSnapshotMock,
    listSnapshots: listSnapshotsMock,
    listSnapshotsMock,
    deleteSnapshotMock,
  };
};

describe('pruneAggregateSnapshots', () => {
  it('does nothing when policy is NONE', async () => {
    const adapter = makeAdapter([]);

    const { deletedCount } = await pruneAggregateSnapshots(
      adapter,
      eventStoreId,
      'a1',
      { policy: { strategy: 'NONE' } },
    );

    expect(deletedCount).toBe(0);
    expect(adapter.listSnapshotsMock).not.toHaveBeenCalled();
    expect(adapter.deleteSnapshotMock).not.toHaveBeenCalled();
  });

  it('deletes everything except the newest with DELETE_PREVIOUS', async () => {
    const keys = [
      makeKey('a1', 5, 0),
      makeKey('a1', 4, 1000),
      makeKey('a1', 3, 2000),
    ];
    const adapter = makeAdapter([{ snapshotKeys: keys }]);

    const { deletedCount } = await pruneAggregateSnapshots(
      adapter,
      eventStoreId,
      'a1',
      { policy: { strategy: 'DELETE_PREVIOUS' }, now: baseDate },
    );

    expect(deletedCount).toBe(2);
    expect(adapter.deleteSnapshotMock).toHaveBeenCalledTimes(2);
    expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(keys[1], {
      eventStoreId,
    });
    expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(keys[2], {
      eventStoreId,
    });
  });

  it('keeps last N with KEEP_LAST_N', async () => {
    const keys = [
      makeKey('a1', 5, 0),
      makeKey('a1', 4, 1000),
      makeKey('a1', 3, 2000),
      makeKey('a1', 2, 3000),
      makeKey('a1', 1, 4000),
    ];
    const adapter = makeAdapter([{ snapshotKeys: keys }]);

    const { deletedCount } = await pruneAggregateSnapshots(
      adapter,
      eventStoreId,
      'a1',
      { policy: { strategy: 'KEEP_LAST_N', n: 2 }, now: baseDate },
    );

    expect(deletedCount).toBe(3);
    [keys[2], keys[3], keys[4]].forEach(key => {
      expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(key, {
        eventStoreId,
      });
    });
  });

  it('keeps snapshots within the time window with KEEP_NEWER_THAN_MS', async () => {
    const oneHourMs = 60 * 60 * 1000;
    const keys = [
      makeKey('a1', 5, 0),
      makeKey('a1', 4, oneHourMs / 2),
      makeKey('a1', 3, oneHourMs * 2),
      makeKey('a1', 2, oneHourMs * 3),
    ];
    const adapter = makeAdapter([{ snapshotKeys: keys }]);

    const { deletedCount } = await pruneAggregateSnapshots(
      adapter,
      eventStoreId,
      'a1',
      {
        policy: { strategy: 'KEEP_NEWER_THAN_MS', ageMs: oneHourMs },
        now: baseDate,
      },
    );

    expect(deletedCount).toBe(2);
    expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(keys[2], {
      eventStoreId,
    });
    expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(keys[3], {
      eventStoreId,
    });
  });

  it('always keeps the newest with KEEP_NEWER_THAN_MS even if all are old', async () => {
    const oneHourMs = 60 * 60 * 1000;
    const keys = [
      makeKey('a1', 5, oneHourMs * 10),
      makeKey('a1', 4, oneHourMs * 100),
    ];
    const adapter = makeAdapter([{ snapshotKeys: keys }]);

    const { deletedCount } = await pruneAggregateSnapshots(
      adapter,
      eventStoreId,
      'a1',
      {
        policy: { strategy: 'KEEP_NEWER_THAN_MS', ageMs: oneHourMs },
        now: baseDate,
      },
    );

    expect(deletedCount).toBe(1);
    expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(keys[1], {
      eventStoreId,
    });
  });

  it('uses the CUSTOM shouldKeep predicate', async () => {
    const keys = [
      makeKey('a1', 5, 0),
      makeKey('a1', 4, 1000),
      makeKey('a1', 3, 2000),
      makeKey('a1', 2, 3000),
    ];
    const adapter = makeAdapter([{ snapshotKeys: keys }]);

    const { deletedCount } = await pruneAggregateSnapshots(
      adapter,
      eventStoreId,
      'a1',
      {
        policy: {
          strategy: 'CUSTOM',
          shouldKeep: ({ position }) => position % 2 === 0,
        },
        now: baseDate,
      },
    );

    expect(deletedCount).toBe(2);
    expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(keys[1], {
      eventStoreId,
    });
    expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(keys[3], {
      eventStoreId,
    });
  });

  it('paginates correctly across multiple pages', async () => {
    const pageA = [makeKey('a1', 9, 0), makeKey('a1', 8, 100)];
    const pageB = [makeKey('a1', 7, 200), makeKey('a1', 6, 300)];

    const adapter = makeAdapter([
      { snapshotKeys: pageA, nextPageToken: 'p2' },
      { snapshotKeys: pageB },
    ]);

    const { deletedCount } = await pruneAggregateSnapshots(
      adapter,
      eventStoreId,
      'a1',
      {
        policy: { strategy: 'KEEP_LAST_N', n: 2 },
        batchSize: 2,
        now: baseDate,
      },
    );

    expect(deletedCount).toBe(2);
    expect(adapter.listSnapshotsMock).toHaveBeenCalledTimes(2);
    expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(pageB[0], {
      eventStoreId,
    });
    expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(pageB[1], {
      eventStoreId,
    });
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects invalid batchSize=%s',
    async batchSize => {
      const adapter = makeAdapter([]);

      await expect(() =>
        pruneAggregateSnapshots(adapter, eventStoreId, 'a1', {
          policy: { strategy: 'DELETE_PREVIOUS' },
          batchSize,
        }),
      ).rejects.toThrow(/batchSize.*must be a positive integer/);
    },
  );
});

describe('pruneEventStoreSnapshots', () => {
  it('does nothing when policy is NONE', async () => {
    const adapter = makeAdapter([]);

    const result = await pruneEventStoreSnapshots(adapter, eventStoreId, {
      policy: { strategy: 'NONE' },
    });

    expect(result).toEqual({ deletedCount: 0, aggregateCount: 0 });
    expect(adapter.listSnapshotsMock).not.toHaveBeenCalled();
  });

  it('tracks per-aggregate position across pages', async () => {
    const pageA: SnapshotKey[] = [
      makeKey('a1', 5, 0),
      makeKey('a1', 4, 100),
      makeKey('a2', 9, 0),
    ];
    const pageB: SnapshotKey[] = [
      makeKey('a1', 3, 200),
      makeKey('a2', 8, 100),
      makeKey('a2', 7, 200),
    ];

    const adapter = makeAdapter([
      { snapshotKeys: pageA, nextPageToken: 'p2' },
      { snapshotKeys: pageB },
    ]);

    const result = await pruneEventStoreSnapshots(adapter, eventStoreId, {
      policy: { strategy: 'DELETE_PREVIOUS' },
      batchSize: 3,
      now: baseDate,
    });

    expect(result.deletedCount).toBe(4);
    expect(result.aggregateCount).toBe(2);
    expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(pageA[1], {
      eventStoreId,
    });
    expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(pageB[0], {
      eventStoreId,
    });
    expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(pageB[1], {
      eventStoreId,
    });
    expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(pageB[2], {
      eventStoreId,
    });
  });

  it('passes reducerVersion through to listSnapshots', async () => {
    const adapter = makeAdapter([{ snapshotKeys: [] }]);

    await pruneEventStoreSnapshots(adapter, eventStoreId, {
      policy: { strategy: 'DELETE_PREVIOUS' },
      reducerVersion: 'v2',
    });

    expect(adapter.listSnapshotsMock).toHaveBeenCalledWith(
      { eventStoreId },
      {
        reducerVersion: 'v2',
        reverse: true,
        limit: 100,
        pageToken: undefined,
      },
    );
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'rejects invalid batchSize=%s',
    async batchSize => {
      const adapter = makeAdapter([]);

      await expect(() =>
        pruneEventStoreSnapshots(adapter, eventStoreId, {
          policy: { strategy: 'DELETE_PREVIOUS' },
          batchSize,
        }),
      ).rejects.toThrow(/batchSize.*must be a positive integer/);
    },
  );
});
