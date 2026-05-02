/* eslint-disable max-lines */
import type { Snapshot } from '@hamstore/core';
import { describe, expect, it } from 'vitest';

import { InMemorySnapshotStorageAdapter } from './adapter';

const eventStoreId = 'POKEMONS';
const reducerV1 = 'v1';
const reducerV2 = 'v2';

const makeSnapshot = (
  aggregateId: string,
  version: number,
  reducerVersion: string,
  extra: Record<string, unknown> = {},
): Snapshot => ({
  aggregate: { aggregateId, version, ...extra },
  reducerVersion,
  eventStoreId,
  savedAt: new Date(version * 1000).toISOString(),
});

describe('InMemorySnapshotStorageAdapter', () => {
  it('stores and reads back a snapshot by exact key', async () => {
    const adapter = new InMemorySnapshotStorageAdapter();
    const snapshot = makeSnapshot('a1', 5, reducerV1);

    await adapter.putSnapshot(snapshot, { eventStoreId });

    const read = await adapter.getSnapshot(
      {
        aggregateId: 'a1',
        aggregateVersion: 5,
        reducerVersion: reducerV1,
      },
      { eventStoreId },
    );

    expect(read.snapshot).toEqual(snapshot);
  });

  it('returns undefined when no snapshot exists for an aggregate', async () => {
    const adapter = new InMemorySnapshotStorageAdapter();

    const read = await adapter.getLatestSnapshot('missing', { eventStoreId });

    expect(read.snapshot).toBeUndefined();
  });

  it('returns the highest-version snapshot for an aggregate', async () => {
    const adapter = new InMemorySnapshotStorageAdapter();
    await adapter.putSnapshot(makeSnapshot('a1', 1, reducerV1), {
      eventStoreId,
    });
    await adapter.putSnapshot(makeSnapshot('a1', 12, reducerV1), {
      eventStoreId,
    });
    await adapter.putSnapshot(makeSnapshot('a1', 7, reducerV1), {
      eventStoreId,
    });

    const read = await adapter.getLatestSnapshot('a1', { eventStoreId });

    expect(read.snapshot?.aggregate.version).toBe(12);
  });

  it('honors aggregateMaxVersion when reading the latest snapshot', async () => {
    const adapter = new InMemorySnapshotStorageAdapter();
    await adapter.putSnapshot(makeSnapshot('a1', 5, reducerV1), {
      eventStoreId,
    });
    await adapter.putSnapshot(makeSnapshot('a1', 10, reducerV1), {
      eventStoreId,
    });
    await adapter.putSnapshot(makeSnapshot('a1', 25, reducerV1), {
      eventStoreId,
    });

    const read = await adapter.getLatestSnapshot(
      'a1',
      { eventStoreId },
      { aggregateMaxVersion: 12 },
    );

    expect(read.snapshot?.aggregate.version).toBe(10);
  });

  it('honors reducerVersion when reading the latest snapshot', async () => {
    const adapter = new InMemorySnapshotStorageAdapter();
    await adapter.putSnapshot(makeSnapshot('a1', 10, reducerV1), {
      eventStoreId,
    });
    await adapter.putSnapshot(makeSnapshot('a1', 5, reducerV2), {
      eventStoreId,
    });

    const read = await adapter.getLatestSnapshot(
      'a1',
      { eventStoreId },
      { reducerVersion: reducerV2 },
    );

    expect(read.snapshot?.aggregate.version).toBe(5);
  });

  it('overwrites a snapshot with the same key', async () => {
    const adapter = new InMemorySnapshotStorageAdapter();
    await adapter.putSnapshot(
      makeSnapshot('a1', 5, reducerV1, { name: 'first' }),
      { eventStoreId },
    );
    await adapter.putSnapshot(
      makeSnapshot('a1', 5, reducerV1, { name: 'second' }),
      { eventStoreId },
    );

    const { snapshot } = await adapter.getSnapshot(
      {
        aggregateId: 'a1',
        aggregateVersion: 5,
        reducerVersion: reducerV1,
      },
      { eventStoreId },
    );

    expect(snapshot?.aggregate).toMatchObject({ name: 'second' });
  });

  it('deletes a snapshot by key', async () => {
    const adapter = new InMemorySnapshotStorageAdapter();
    await adapter.putSnapshot(makeSnapshot('a1', 5, reducerV1), {
      eventStoreId,
    });

    await adapter.deleteSnapshot(
      {
        aggregateId: 'a1',
        aggregateVersion: 5,
        reducerVersion: reducerV1,
      },
      { eventStoreId },
    );

    const { snapshot } = await adapter.getSnapshot(
      {
        aggregateId: 'a1',
        aggregateVersion: 5,
        reducerVersion: reducerV1,
      },
      { eventStoreId },
    );
    expect(snapshot).toBeUndefined();
  });

  it('does not throw when deleting a missing snapshot', async () => {
    const adapter = new InMemorySnapshotStorageAdapter();

    await expect(
      adapter.deleteSnapshot(
        {
          aggregateId: 'gone',
          aggregateVersion: 99,
          reducerVersion: reducerV1,
        },
        { eventStoreId },
      ),
    ).resolves.toBeUndefined();
  });

  it('lists snapshot keys filtered by reducerVersion', async () => {
    const adapter = new InMemorySnapshotStorageAdapter();
    await adapter.putSnapshot(makeSnapshot('a1', 5, reducerV1), {
      eventStoreId,
    });
    await adapter.putSnapshot(makeSnapshot('a2', 7, reducerV1), {
      eventStoreId,
    });
    await adapter.putSnapshot(makeSnapshot('a3', 3, reducerV2), {
      eventStoreId,
    });

    const { snapshotKeys } = await adapter.listSnapshots(
      { eventStoreId },
      { reducerVersion: reducerV1 },
    );

    expect(snapshotKeys).toHaveLength(2);
    expect(snapshotKeys.map(k => k.aggregateId).sort()).toEqual(['a1', 'a2']);
    snapshotKeys.forEach(k => {
      expect(k.reducerVersion).toBe(reducerV1);
    });
  });

  it('paginates snapshot listings', async () => {
    const adapter = new InMemorySnapshotStorageAdapter();
    for (let v = 1; v <= 7; v += 1) {
      await adapter.putSnapshot(makeSnapshot('a1', v, reducerV1), {
        eventStoreId,
      });
    }

    const first = await adapter.listSnapshots(
      { eventStoreId },
      { aggregateId: 'a1', limit: 3 },
    );
    expect(first.snapshotKeys.map(k => k.aggregateVersion)).toEqual([1, 2, 3]);
    expect(first.nextPageToken).toBeDefined();

    const second = await adapter.listSnapshots(
      { eventStoreId },
      { aggregateId: 'a1', limit: 3, pageToken: first.nextPageToken },
    );
    expect(second.snapshotKeys.map(k => k.aggregateVersion)).toEqual([
      4, 5, 6,
    ]);

    const third = await adapter.listSnapshots(
      { eventStoreId },
      { aggregateId: 'a1', limit: 3, pageToken: second.nextPageToken },
    );
    expect(third.snapshotKeys.map(k => k.aggregateVersion)).toEqual([7]);
    expect(third.nextPageToken).toBeUndefined();
  });

  it('isolates snapshots by eventStoreId', async () => {
    const adapter = new InMemorySnapshotStorageAdapter();
    await adapter.putSnapshot(
      {
        aggregate: { aggregateId: 'a1', version: 5 },
        reducerVersion: reducerV1,
        eventStoreId: 'A',
        savedAt: new Date().toISOString(),
      },
      { eventStoreId: 'A' },
    );

    const inOther = await adapter.getLatestSnapshot('a1', {
      eventStoreId: 'B',
    });

    expect(inOther.snapshot).toBeUndefined();
  });

  it.each(['not-a-number', '-1', '1.5', ''])(
    'rejects invalid pageToken %p',
    async invalidToken => {
      const adapter = new InMemorySnapshotStorageAdapter();
      await adapter.putSnapshot(
        {
          aggregate: { aggregateId: 'a1', version: 5 },
          reducerVersion: reducerV1,
          eventStoreId,
          savedAt: new Date().toISOString(),
        },
        { eventStoreId },
      );

      await expect(
        adapter.listSnapshots(
          { eventStoreId },
          { pageToken: invalidToken },
        ),
      ).rejects.toThrow(/invalid pageToken/);
    },
  );

  it('preserves initialSnapshots eventStoreId on construction', async () => {
    const adapter = new InMemorySnapshotStorageAdapter({
      initialSnapshots: [
        {
          aggregate: { aggregateId: 'a1', version: 1 },
          reducerVersion: reducerV1,
          eventStoreId,
          savedAt: new Date().toISOString(),
        },
      ],
    });

    const { snapshot } = await adapter.getLatestSnapshot('a1', {
      eventStoreId,
    });

    expect(snapshot).toBeDefined();
    expect(snapshot?.eventStoreId).toBe(eventStoreId);
  });

  it('rejects putSnapshot when context eventStoreId mismatches snapshot', async () => {
    const adapter = new InMemorySnapshotStorageAdapter();

    await expect(
      adapter.putSnapshot(
        {
          aggregate: { aggregateId: 'a1', version: 5 },
          reducerVersion: reducerV1,
          eventStoreId: 'A',
          savedAt: new Date().toISOString(),
        },
        { eventStoreId: 'B' },
      ),
    ).rejects.toThrow();
  });
});
