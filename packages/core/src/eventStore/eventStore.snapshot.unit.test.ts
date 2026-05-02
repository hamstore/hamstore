/* eslint-disable max-lines */
import { vi, describe, it, expect, beforeEach } from 'vitest';

import type { Snapshot, SnapshotStorageAdapter } from '~/snapshot';

import { EventStore } from './eventStore';
import {
  PokemonAggregate,
  PokemonEventDetails,
  pokemonAppearedEvent,
  pokemonCaughtEvent,
  pokemonLeveledUpEvent,
  pokemonsReducer,
  pikachuId,
  pikachuAppearedEvent,
  pikachuCaughtEvent,
  pikachuLeveledUpEvent,
  pikachuEventsMocks,
} from './eventStore.fixtures.test';

const eventStoreId = 'POKEMONS';

const buildAggregate = (events: PokemonEventDetails[]): PokemonAggregate =>
  events.reduce(
    pokemonsReducer,
    undefined as unknown as PokemonAggregate,
  );

const fullAggregate = buildAggregate(pikachuEventsMocks);

const partialAggregate = buildAggregate([
  pikachuAppearedEvent,
  pikachuCaughtEvent,
]);

const makeSnapshot = (
  aggregate: PokemonAggregate,
  reducerVersion: string,
  savedAt = '2024-01-01T00:00:00.000Z',
): Snapshot<PokemonAggregate> => ({
  aggregate,
  reducerVersion,
  eventStoreId,
  savedAt,
});

const makeSnapshotAdapter = (): SnapshotStorageAdapter & {
  getLatestSnapshotMock: ReturnType<typeof vi.fn>;
  putSnapshotMock: ReturnType<typeof vi.fn>;
  deleteSnapshotMock: ReturnType<typeof vi.fn>;
  listSnapshotsMock: ReturnType<typeof vi.fn>;
  getSnapshotMock: ReturnType<typeof vi.fn>;
} => {
  const getLatestSnapshotMock = vi
    .fn()
    .mockResolvedValue({ snapshot: undefined });
  const putSnapshotMock = vi.fn().mockResolvedValue(undefined);
  const deleteSnapshotMock = vi.fn().mockResolvedValue(undefined);
  const listSnapshotsMock = vi.fn().mockResolvedValue({ snapshotKeys: [] });
  const getSnapshotMock = vi.fn().mockResolvedValue({ snapshot: undefined });

  return {
    getLatestSnapshot: getLatestSnapshotMock,
    putSnapshot: putSnapshotMock,
    deleteSnapshot: deleteSnapshotMock,
    listSnapshots: listSnapshotsMock,
    getSnapshot: getSnapshotMock,
    getLatestSnapshotMock,
    putSnapshotMock,
    deleteSnapshotMock,
    listSnapshotsMock,
    getSnapshotMock,
  };
};

describe('EventStore snapshot integration', () => {
  describe('reads', () => {
    it('does not consult snapshot adapter when snapshot config is undefined', async () => {
      const adapter = makeSnapshotAdapter();
      const getEventsMock = vi
        .fn()
        .mockResolvedValue({ events: pikachuEventsMocks });

      const store = new EventStore({
        eventStoreId,
        eventTypes: [
          pokemonAppearedEvent,
          pokemonCaughtEvent,
          pokemonLeveledUpEvent,
        ],
        reducer: pokemonsReducer,
        eventStorageAdapter: {
          pushEvent: vi.fn(),
          pushEventGroup: vi.fn(),
          groupEvent: vi.fn(),
          getEvents: getEventsMock,
          listAggregateIds: vi.fn(),
        },
      });

      await store.getAggregate(pikachuId);

      expect(adapter.getLatestSnapshotMock).not.toHaveBeenCalled();
      expect(getEventsMock).toHaveBeenCalledWith(
        pikachuId,
        { eventStoreId },
        undefined,
      );
    });

    it('seeds the rebuild from a snapshot when reducer versions match', async () => {
      const adapter = makeSnapshotAdapter();
      adapter.getLatestSnapshotMock.mockResolvedValue({
        snapshot: makeSnapshot(partialAggregate, 'v1'),
      });

      const getEventsMock = vi
        .fn()
        .mockResolvedValue({ events: [pikachuLeveledUpEvent] });
      const store = new EventStore({
        eventStoreId,
        eventTypes: [
          pokemonAppearedEvent,
          pokemonCaughtEvent,
          pokemonLeveledUpEvent,
        ],
        reducer: pokemonsReducer,
        eventStorageAdapter: {
          pushEvent: vi.fn(),
          pushEventGroup: vi.fn(),
          groupEvent: vi.fn(),
          getEvents: getEventsMock,
          listAggregateIds: vi.fn(),
        },
        snapshotStorageAdapter: adapter,
        snapshotConfig: {
          currentReducerVersion: 'v1',
          policy: { strategy: 'NONE' },
        },
      });

      const { aggregate } = await store.getAggregate(pikachuId);

      expect(aggregate).toEqual(fullAggregate);
      expect(getEventsMock).toHaveBeenCalledWith(
        pikachuId,
        { eventStoreId },
        { minVersion: partialAggregate.version + 1 },
      );
    });

    it('ignores snapshots with mismatching reducer version when no migrator is configured', async () => {
      const adapter = makeSnapshotAdapter();
      adapter.getLatestSnapshotMock.mockResolvedValue({
        snapshot: makeSnapshot(partialAggregate, 'v0'),
      });

      const getEventsMock = vi
        .fn()
        .mockResolvedValue({ events: pikachuEventsMocks });
      const store = new EventStore({
        eventStoreId,
        eventTypes: [
          pokemonAppearedEvent,
          pokemonCaughtEvent,
          pokemonLeveledUpEvent,
        ],
        reducer: pokemonsReducer,
        eventStorageAdapter: {
          pushEvent: vi.fn(),
          pushEventGroup: vi.fn(),
          groupEvent: vi.fn(),
          getEvents: getEventsMock,
          listAggregateIds: vi.fn(),
        },
        snapshotStorageAdapter: adapter,
        snapshotConfig: {
          currentReducerVersion: 'v1',
          policy: { strategy: 'NONE' },
        },
      });

      const { aggregate } = await store.getAggregate(pikachuId);

      expect(aggregate).toEqual(fullAggregate);
      expect(getEventsMock).toHaveBeenCalledWith(
        pikachuId,
        { eventStoreId },
        undefined,
      );
    });

    it('migrates an outdated snapshot when migrateSnapshotReducerVersion is configured', async () => {
      const adapter = makeSnapshotAdapter();
      const outdatedSnapshot = makeSnapshot(partialAggregate, 'v0');
      adapter.getLatestSnapshotMock.mockResolvedValue({
        snapshot: outdatedSnapshot,
      });

      const migrate = vi.fn(async (snap: Snapshot<PokemonAggregate>) => ({
        ...snap,
        reducerVersion: 'v1',
      }));

      const getEventsMock = vi
        .fn()
        .mockResolvedValue({ events: [pikachuLeveledUpEvent] });
      const store = new EventStore({
        eventStoreId,
        eventTypes: [
          pokemonAppearedEvent,
          pokemonCaughtEvent,
          pokemonLeveledUpEvent,
        ],
        reducer: pokemonsReducer,
        eventStorageAdapter: {
          pushEvent: vi.fn(),
          pushEventGroup: vi.fn(),
          groupEvent: vi.fn(),
          getEvents: getEventsMock,
          listAggregateIds: vi.fn(),
        },
        snapshotStorageAdapter: adapter,
        snapshotConfig: {
          currentReducerVersion: 'v1',
          policy: { strategy: 'NONE' },
          migrateSnapshotReducerVersion: migrate,
        },
      });

      const { aggregate } = await store.getAggregate(pikachuId);

      expect(migrate).toHaveBeenCalledWith(outdatedSnapshot);
      expect(aggregate).toEqual(fullAggregate);
      expect(getEventsMock).toHaveBeenCalledWith(
        pikachuId,
        { eventStoreId },
        { minVersion: partialAggregate.version + 1 },
      );
    });

    it('falls back to events when snapshot read throws and routes the error to onSnapshotError', async () => {
      const adapter = makeSnapshotAdapter();
      const readError = new Error('boom');
      adapter.getLatestSnapshotMock.mockRejectedValue(readError);

      const onSnapshotError = vi.fn();

      const getEventsMock = vi
        .fn()
        .mockResolvedValue({ events: pikachuEventsMocks });
      const store = new EventStore({
        eventStoreId,
        eventTypes: [
          pokemonAppearedEvent,
          pokemonCaughtEvent,
          pokemonLeveledUpEvent,
        ],
        reducer: pokemonsReducer,
        eventStorageAdapter: {
          pushEvent: vi.fn(),
          pushEventGroup: vi.fn(),
          groupEvent: vi.fn(),
          getEvents: getEventsMock,
          listAggregateIds: vi.fn(),
        },
        snapshotStorageAdapter: adapter,
        snapshotConfig: {
          currentReducerVersion: 'v1',
          policy: { strategy: 'NONE' },
          onSnapshotError,
        },
      });

      const { aggregate } = await store.getAggregate(pikachuId);
      expect(aggregate).toEqual(fullAggregate);
      expect(onSnapshotError).toHaveBeenCalledWith({
        phase: 'read',
        aggregateId: pikachuId,
        eventStoreId,
        error: readError,
      });
    });

    it('silently swallows snapshot read errors when onSnapshotError is not configured', async () => {
      const adapter = makeSnapshotAdapter();
      adapter.getLatestSnapshotMock.mockRejectedValue(new Error('boom'));

      const getEventsMock = vi
        .fn()
        .mockResolvedValue({ events: pikachuEventsMocks });
      const store = new EventStore({
        eventStoreId,
        eventTypes: [
          pokemonAppearedEvent,
          pokemonCaughtEvent,
          pokemonLeveledUpEvent,
        ],
        reducer: pokemonsReducer,
        eventStorageAdapter: {
          pushEvent: vi.fn(),
          pushEventGroup: vi.fn(),
          groupEvent: vi.fn(),
          getEvents: getEventsMock,
          listAggregateIds: vi.fn(),
        },
        snapshotStorageAdapter: adapter,
        snapshotConfig: {
          currentReducerVersion: 'v1',
          policy: { strategy: 'NONE' },
        },
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { aggregate } = await store.getAggregate(pikachuId);
      expect(aggregate).toEqual(fullAggregate);
      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  describe('saves', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-06-01T00:00:00.000Z'));
    });

    it('saves a snapshot when EVERY_N_VERSIONS threshold is reached', async () => {
      const adapter = makeSnapshotAdapter();
      const getEventsMock = vi
        .fn()
        .mockResolvedValue({ events: pikachuEventsMocks });

      const store = new EventStore({
        eventStoreId,
        eventTypes: [
          pokemonAppearedEvent,
          pokemonCaughtEvent,
          pokemonLeveledUpEvent,
        ],
        reducer: pokemonsReducer,
        eventStorageAdapter: {
          pushEvent: vi.fn(),
          pushEventGroup: vi.fn(),
          groupEvent: vi.fn(),
          getEvents: getEventsMock,
          listAggregateIds: vi.fn(),
        },
        snapshotStorageAdapter: adapter,
        snapshotConfig: {
          currentReducerVersion: 'v1',
          policy: { strategy: 'EVERY_N_VERSIONS', periodInVersions: 3 },
          pruning: { strategy: 'NONE' },
        },
      });

      await store.getAggregate(pikachuId);
      await vi.runAllTimersAsync();

      expect(adapter.putSnapshotMock).toHaveBeenCalledTimes(1);
      const [savedSnapshot] = adapter.putSnapshotMock.mock.calls[0] as [
        Snapshot<PokemonAggregate>,
      ];
      expect(savedSnapshot.aggregate).toEqual(fullAggregate);
      expect(savedSnapshot.reducerVersion).toBe('v1');
      expect(savedSnapshot.eventStoreId).toBe(eventStoreId);
    });

    it('does not save a snapshot when policy is NONE', async () => {
      const adapter = makeSnapshotAdapter();
      const getEventsMock = vi
        .fn()
        .mockResolvedValue({ events: pikachuEventsMocks });

      const store = new EventStore({
        eventStoreId,
        eventTypes: [
          pokemonAppearedEvent,
          pokemonCaughtEvent,
          pokemonLeveledUpEvent,
        ],
        reducer: pokemonsReducer,
        eventStorageAdapter: {
          pushEvent: vi.fn(),
          pushEventGroup: vi.fn(),
          groupEvent: vi.fn(),
          getEvents: getEventsMock,
          listAggregateIds: vi.fn(),
        },
        snapshotStorageAdapter: adapter,
        snapshotConfig: {
          currentReducerVersion: 'v1',
          policy: { strategy: 'NONE' },
        },
      });

      await store.getAggregate(pikachuId);
      await vi.runAllTimersAsync();

      expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
    });

    it('does not save a duplicate snapshot at the same version', async () => {
      const adapter = makeSnapshotAdapter();
      adapter.getLatestSnapshotMock.mockResolvedValue({
        snapshot: makeSnapshot(fullAggregate, 'v1'),
      });

      const getEventsMock = vi.fn().mockResolvedValue({ events: [] });

      const store = new EventStore({
        eventStoreId,
        eventTypes: [
          pokemonAppearedEvent,
          pokemonCaughtEvent,
          pokemonLeveledUpEvent,
        ],
        reducer: pokemonsReducer,
        eventStorageAdapter: {
          pushEvent: vi.fn(),
          pushEventGroup: vi.fn(),
          groupEvent: vi.fn(),
          getEvents: getEventsMock,
          listAggregateIds: vi.fn(),
        },
        snapshotStorageAdapter: adapter,
        snapshotConfig: {
          currentReducerVersion: 'v1',
          policy: { strategy: 'EVERY_N_VERSIONS', periodInVersions: 1 },
        },
      });

      const { aggregate } = await store.getAggregate(pikachuId);
      await vi.runAllTimersAsync();

      expect(aggregate).toEqual(fullAggregate);
      expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
    });

    it('does not propagate errors thrown during snapshot save and routes them to onSnapshotError', async () => {
      const adapter = makeSnapshotAdapter();
      const saveError = new Error('save fail');
      adapter.putSnapshotMock.mockRejectedValue(saveError);

      const onSnapshotError = vi.fn();

      const getEventsMock = vi
        .fn()
        .mockResolvedValue({ events: pikachuEventsMocks });

      const store = new EventStore({
        eventStoreId,
        eventTypes: [
          pokemonAppearedEvent,
          pokemonCaughtEvent,
          pokemonLeveledUpEvent,
        ],
        reducer: pokemonsReducer,
        eventStorageAdapter: {
          pushEvent: vi.fn(),
          pushEventGroup: vi.fn(),
          groupEvent: vi.fn(),
          getEvents: getEventsMock,
          listAggregateIds: vi.fn(),
        },
        snapshotStorageAdapter: adapter,
        snapshotConfig: {
          currentReducerVersion: 'v1',
          policy: { strategy: 'EVERY_N_VERSIONS', periodInVersions: 1 },
          onSnapshotError,
        },
      });

      const { aggregate } = await store.getAggregate(pikachuId);
      await vi.runAllTimersAsync();

      expect(aggregate).toEqual(fullAggregate);
      expect(onSnapshotError).toHaveBeenCalledWith({
        phase: 'save',
        aggregateId: pikachuId,
        eventStoreId,
        error: saveError,
      });
    });

    it('does not prune by default (pruning: NONE)', async () => {
      const adapter = makeSnapshotAdapter();
      const previousKeys = [
        {
          aggregateId: pikachuId,
          aggregateVersion: 3,
          reducerVersion: 'v1',
          savedAt: new Date(2024, 0, 1, 3).toISOString(),
        },
        {
          aggregateId: pikachuId,
          aggregateVersion: 2,
          reducerVersion: 'v1',
          savedAt: new Date(2024, 0, 1, 2).toISOString(),
        },
        {
          aggregateId: pikachuId,
          aggregateVersion: 1,
          reducerVersion: 'v1',
          savedAt: new Date(2024, 0, 1, 1).toISOString(),
        },
      ];
      adapter.listSnapshotsMock.mockResolvedValue({
        snapshotKeys: previousKeys,
      });

      const getEventsMock = vi
        .fn()
        .mockResolvedValue({ events: pikachuEventsMocks });

      const store = new EventStore({
        eventStoreId,
        eventTypes: [
          pokemonAppearedEvent,
          pokemonCaughtEvent,
          pokemonLeveledUpEvent,
        ],
        reducer: pokemonsReducer,
        eventStorageAdapter: {
          pushEvent: vi.fn(),
          pushEventGroup: vi.fn(),
          groupEvent: vi.fn(),
          getEvents: getEventsMock,
          listAggregateIds: vi.fn(),
        },
        snapshotStorageAdapter: adapter,
        snapshotConfig: {
          currentReducerVersion: 'v1',
          policy: { strategy: 'EVERY_N_VERSIONS', periodInVersions: 1 },
          // pruning omitted ⇒ defaults to NONE
        },
      });

      await store.getAggregate(pikachuId);
      await vi.runAllTimersAsync();

      expect(adapter.putSnapshotMock).toHaveBeenCalledTimes(1);
      expect(adapter.listSnapshotsMock).not.toHaveBeenCalled();
      expect(adapter.deleteSnapshotMock).not.toHaveBeenCalled();
    });

    it('prunes previous snapshots when pruning is explicitly DELETE_PREVIOUS', async () => {
      const adapter = makeSnapshotAdapter();
      const previousKeys = [
        {
          aggregateId: pikachuId,
          aggregateVersion: 3,
          reducerVersion: 'v1',
          savedAt: new Date(2024, 0, 1, 3).toISOString(),
        },
        {
          aggregateId: pikachuId,
          aggregateVersion: 2,
          reducerVersion: 'v1',
          savedAt: new Date(2024, 0, 1, 2).toISOString(),
        },
        {
          aggregateId: pikachuId,
          aggregateVersion: 1,
          reducerVersion: 'v1',
          savedAt: new Date(2024, 0, 1, 1).toISOString(),
        },
      ];
      adapter.listSnapshotsMock.mockResolvedValue({
        snapshotKeys: previousKeys,
      });

      const getEventsMock = vi
        .fn()
        .mockResolvedValue({ events: pikachuEventsMocks });

      const store = new EventStore({
        eventStoreId,
        eventTypes: [
          pokemonAppearedEvent,
          pokemonCaughtEvent,
          pokemonLeveledUpEvent,
        ],
        reducer: pokemonsReducer,
        eventStorageAdapter: {
          pushEvent: vi.fn(),
          pushEventGroup: vi.fn(),
          groupEvent: vi.fn(),
          getEvents: getEventsMock,
          listAggregateIds: vi.fn(),
        },
        snapshotStorageAdapter: adapter,
        snapshotConfig: {
          currentReducerVersion: 'v1',
          policy: { strategy: 'EVERY_N_VERSIONS', periodInVersions: 1 },
          pruning: { strategy: 'DELETE_PREVIOUS' },
        },
      });

      await store.getAggregate(pikachuId);
      await vi.runAllTimersAsync();

      // DELETE_PREVIOUS keeps the newest (position 0) only.
      expect(adapter.deleteSnapshotMock).toHaveBeenCalledTimes(2);
      expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(previousKeys[1], {
        eventStoreId,
      });
      expect(adapter.deleteSnapshotMock).toHaveBeenCalledWith(previousKeys[2], {
        eventStoreId,
      });
    });
  });
});
