import { describe, it, expect, vi } from 'vitest';

import { cleanUpOutdatedSnapshots } from './cleanUpOutdatedSnapshots';
import type {
  ListSnapshotsOutput,
  SnapshotKey,
  SnapshotStorageAdapter,
} from './snapshotStorageAdapter';

const eventStoreId = 'POKEMONS';

const makeKey = (aggregateVersion: number): SnapshotKey => ({
  aggregateId: `agg-${aggregateVersion}`,
  aggregateVersion,
  reducerVersion: 'v0',
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

describe('cleanUpOutdatedSnapshots', () => {
  it('returns 0 when no snapshots match', async () => {
    const adapter = makeAdapter([{ snapshotKeys: [] }]);

    const { deletedCount } = await cleanUpOutdatedSnapshots(
      adapter,
      eventStoreId,
      'v0',
    );

    expect(deletedCount).toBe(0);
    expect(adapter.deleteSnapshotMock).not.toHaveBeenCalled();
  });

  it('deletes all snapshots for the given outdated reducer version across pages', async () => {
    const page1Keys = [makeKey(1), makeKey(2), makeKey(3)];
    const page2Keys = [makeKey(4), makeKey(5)];

    const adapter = makeAdapter([
      { snapshotKeys: page1Keys, nextPageToken: 'p2' },
      { snapshotKeys: page2Keys },
    ]);

    const { deletedCount } = await cleanUpOutdatedSnapshots(
      adapter,
      eventStoreId,
      'v0',
      { batchSize: 3 },
    );

    expect(deletedCount).toBe(5);
    expect(adapter.listSnapshotsMock).toHaveBeenNthCalledWith(
      1,
      { eventStoreId },
      { reducerVersion: 'v0', limit: 3, pageToken: undefined },
    );
    expect(adapter.listSnapshotsMock).toHaveBeenNthCalledWith(
      2,
      { eventStoreId },
      { reducerVersion: 'v0', limit: 3, pageToken: 'p2' },
    );
    expect(adapter.deleteSnapshotMock).toHaveBeenCalledTimes(5);
    [...page1Keys, ...page2Keys].forEach(key => {
      expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(key, {
        eventStoreId,
      });
    });
  });

  it('reports progress after each page', async () => {
    const page1Keys = [makeKey(1), makeKey(2)];
    const page2Keys = [makeKey(3)];

    const adapter = makeAdapter([
      { snapshotKeys: page1Keys, nextPageToken: 'p2' },
      { snapshotKeys: page2Keys },
    ]);

    const onProgress = vi.fn();

    await cleanUpOutdatedSnapshots(adapter, eventStoreId, 'v0', {
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 2);
    expect(onProgress).toHaveBeenNthCalledWith(2, 3);
  });
});
