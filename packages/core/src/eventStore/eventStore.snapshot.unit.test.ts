/* eslint-disable max-lines */
import { vi, describe, it, expect, beforeEach } from 'vitest';

import { GroupedEvent } from '~/event/groupedEvent';
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

    it('getAggregateAndEvents by default returns the full event history (snapshot used to seed aggregate replay only)', async () => {
      const adapter = makeSnapshotAdapter();
      adapter.getLatestSnapshotMock.mockResolvedValue({
        snapshot: makeSnapshot(partialAggregate, 'v1'),
      });

      // Snapshot covers events 1..2; events on top = event 3.
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

      const { aggregate, events } =
        await store.getAggregateAndEvents(pikachuId);

      // Aggregate is correctly rebuilt from snapshot + post-snapshot events.
      expect(aggregate).toEqual(fullAggregate);
      // Default mode returns the full event history regardless of the
      // snapshot's coverage.
      expect(events).toEqual(pikachuEventsMocks);
      // Single fetch from version 1 (no minVersion in the query).
      expect(getEventsMock).toHaveBeenCalledTimes(1);
      expect(getEventsMock).toHaveBeenCalledWith(
        pikachuId,
        { eventStoreId },
        undefined,
      );
      // Snapshot picker is unconstrained (no aggregateMaxVersion).
      expect(adapter.getLatestSnapshotMock).toHaveBeenCalledWith(
        pikachuId,
        { eventStoreId },
        {},
      );
    });

    it('getAggregateAndEvents with fromVersion uses any snapshot whose seed is below fromVersion (single events fetch)', async () => {
      const adapter = makeSnapshotAdapter();
      // Snapshot at v2; aggregateMin = 3; fromVersion = 3; fetchMin = 3.
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

      const { aggregate, events } = await store.getAggregateAndEvents(
        pikachuId,
        { fromVersion: 3 },
      );

      expect(aggregate).toEqual(fullAggregate);
      expect(events).toEqual([pikachuLeveledUpEvent]);
      // Snapshot picker is no longer constrained by `fromVersion`.
      expect(adapter.getLatestSnapshotMock).toHaveBeenCalledWith(
        pikachuId,
        { eventStoreId },
        {},
      );
      expect(getEventsMock).toHaveBeenCalledWith(
        pikachuId,
        { eventStoreId },
        { minVersion: 3 },
      );
    });

    it('getAggregateAndEvents with fromVersion uses a snapshot whose version is at or above fromVersion (no replay of pre-fromVersion events)', async () => {
      const adapter = makeSnapshotAdapter();
      // Snapshot at v3 (= fullAggregate). With fromVersion = 2:
      //   aggregateMin = 4 (no events to replay on top)
      //   eventsMinVersion = 2 → fetchMin = min(4, 2) = 2
      // Single fetch 2..end; aggregate = snapshot directly (no replay).
      adapter.getLatestSnapshotMock.mockResolvedValue({
        snapshot: makeSnapshot(fullAggregate, 'v1'),
      });

      const getEventsMock = vi.fn().mockResolvedValue({
        events: [pikachuCaughtEvent, pikachuLeveledUpEvent],
      });
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

      const { aggregate, events } = await store.getAggregateAndEvents(
        pikachuId,
        { fromVersion: 2 },
      );

      expect(aggregate).toEqual(fullAggregate);
      expect(events).toEqual([pikachuCaughtEvent, pikachuLeveledUpEvent]);
      // Single events fetch from fromVersion onward — the events the caller
      // asked for, no extra read.
      expect(getEventsMock).toHaveBeenCalledTimes(1);
      expect(getEventsMock).toHaveBeenCalledWith(
        pikachuId,
        { eventStoreId },
        { minVersion: 2 },
      );
    });

    it('getAggregateAndEvents with fromLatestSnapshot returns events on top of the latest snapshot', async () => {
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

      const { aggregate, events, lastEvent } =
        await store.getAggregateAndEvents(pikachuId, {
          fromLatestSnapshot: true,
        });

      expect(aggregate).toEqual(fullAggregate);
      expect(events).toEqual([pikachuLeveledUpEvent]);
      expect(lastEvent).toEqual(pikachuLeveledUpEvent);
      expect(adapter.getLatestSnapshotMock).toHaveBeenCalledWith(
        pikachuId,
        { eventStoreId },
        {},
      );
      expect(getEventsMock).toHaveBeenCalledWith(
        pikachuId,
        { eventStoreId },
        { minVersion: partialAggregate.version + 1 },
      );
    });

    it('getAggregateAndEvents with fromLatestSnapshot falls back to the full history when no snapshot is applicable', async () => {
      const adapter = makeSnapshotAdapter();
      adapter.getLatestSnapshotMock.mockResolvedValue({
        snapshot: undefined,
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

      const { aggregate, events } = await store.getAggregateAndEvents(
        pikachuId,
        { fromLatestSnapshot: true },
      );

      expect(aggregate).toEqual(fullAggregate);
      expect(events).toEqual(pikachuEventsMocks);
    });

    it('getAggregateAndEvents with lastN returns at least the trailing N events when the snapshot covers the rest', async () => {
      const adapter = makeSnapshotAdapter();
      // Snapshot at version 2 covers events 1–2; tail read returns event 3.
      adapter.getLatestSnapshotMock.mockResolvedValue({
        snapshot: makeSnapshot(partialAggregate, 'v1'),
      });

      const getEventsMock = vi.fn();
      // First call: events on top of snapshot (snapshot.version+1 = 3).
      getEventsMock.mockResolvedValueOnce({ events: [pikachuLeveledUpEvent] });
      // Second call: missing earlier events (versions 2 only — event 1 is not
      // needed because lastN=2 → desiredFloor = 3-2+1 = 2).
      getEventsMock.mockResolvedValueOnce({ events: [pikachuCaughtEvent] });

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

      const { aggregate, events, lastEvent } =
        await store.getAggregateAndEvents(pikachuId, { lastN: 2 });

      expect(aggregate).toEqual(fullAggregate);
      expect(events).toEqual([pikachuCaughtEvent, pikachuLeveledUpEvent]);
      expect(lastEvent).toEqual(pikachuLeveledUpEvent);

      // First call: tail read on top of snapshot.
      expect(getEventsMock).toHaveBeenNthCalledWith(
        1,
        pikachuId,
        { eventStoreId },
        { minVersion: partialAggregate.version + 1 },
      );
      // Second call: backfill of events the snapshot covered.
      expect(getEventsMock).toHaveBeenNthCalledWith(
        2,
        pikachuId,
        { eventStoreId },
        { minVersion: 2, maxVersion: partialAggregate.version },
      );
    });

    it('getAggregateAndEvents with lastN does not refetch when the tail already contains N events', async () => {
      const adapter = makeSnapshotAdapter();
      // Snapshot at version 1 covers event 1; tail covers events 2–3 (2 events).
      const snapshotAggregate = buildAggregate([pikachuAppearedEvent]);
      adapter.getLatestSnapshotMock.mockResolvedValue({
        snapshot: makeSnapshot(snapshotAggregate, 'v1'),
      });

      const getEventsMock = vi
        .fn()
        .mockResolvedValue({
          events: [pikachuCaughtEvent, pikachuLeveledUpEvent],
        });
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

      const { aggregate, events } = await store.getAggregateAndEvents(
        pikachuId,
        { lastN: 2 },
      );

      expect(aggregate).toEqual(fullAggregate);
      expect(events).toEqual([pikachuCaughtEvent, pikachuLeveledUpEvent]);
      // Only one events call — no backfill needed.
      expect(getEventsMock).toHaveBeenCalledTimes(1);
    });

    it('getAggregateAndEvents with lastN larger than total events returns the full history', async () => {
      const adapter = makeSnapshotAdapter();
      adapter.getLatestSnapshotMock.mockResolvedValue({ snapshot: undefined });

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

      const { aggregate, events } = await store.getAggregateAndEvents(
        pikachuId,
        { lastN: 100 },
      );

      expect(aggregate).toEqual(fullAggregate);
      expect(events).toEqual(pikachuEventsMocks);
      expect(getEventsMock).toHaveBeenCalledTimes(1);
    });

    it('getAggregateAndEvents with lastN: 0 returns no events but the full aggregate', async () => {
      const adapter = makeSnapshotAdapter();
      adapter.getLatestSnapshotMock.mockResolvedValue({ snapshot: undefined });

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

      const { aggregate, events, lastEvent } =
        await store.getAggregateAndEvents(pikachuId, { lastN: 0 });

      expect(aggregate).toEqual(fullAggregate);
      expect(events).toEqual([]);
      expect(lastEvent).toBeUndefined();
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

    it('saves a snapshot when EVERY_N_VERSIONS threshold is reached on read (saveOn: "read")', async () => {
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
          saveOn: 'read',
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
          saveOn: 'read',
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
          saveOn: 'read',
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
          saveOn: 'read',
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
          saveOn: 'read',
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

  describe('saveOn', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-06-01T00:00:00.000Z'));
    });

    const setupStore = (
      saveOn: 'write' | 'read' | 'both' | undefined,
      policy = { strategy: 'EVERY_N_VERSIONS' as const, periodInVersions: 3 },
    ): {
      store: EventStore<
        'POKEMONS',
        typeof eventTypes,
        PokemonEventDetails,
        PokemonEventDetails,
        typeof pokemonsReducer
      >;
      adapter: ReturnType<typeof makeSnapshotAdapter>;
      pushEventMock: ReturnType<typeof vi.fn>;
    } => {
      const adapter = makeSnapshotAdapter();
      const pushEventMock = vi
        .fn()
        .mockImplementation(async (event: PokemonEventDetails) => ({ event }));
      const getEventsMock = vi
        .fn()
        .mockResolvedValue({ events: pikachuEventsMocks });

      const store = new EventStore({
        eventStoreId,
        eventTypes,
        reducer: pokemonsReducer,
        eventStorageAdapter: {
          pushEvent: pushEventMock,
          pushEventGroup: vi.fn(),
          groupEvent: vi.fn(),
          getEvents: getEventsMock,
          listAggregateIds: vi.fn(),
        },
        snapshotStorageAdapter: adapter,
        snapshotConfig: {
          currentReducerVersion: 'v1',
          ...(saveOn !== undefined ? { saveOn } : {}),
          policy,
        },
      });

      return { store, adapter, pushEventMock };
    };

    const eventTypes = [
      pokemonAppearedEvent,
      pokemonCaughtEvent,
      pokemonLeveledUpEvent,
    ];

    describe("default (saveOn omitted, equivalent to 'write')", () => {
      it('saves on pushEvent when threshold is reached', async () => {
        const { store, adapter } = setupStore(undefined);

        await store.pushEvent(pikachuLeveledUpEvent, {
          prevAggregate: partialAggregate,
        });
        await vi.runAllTimersAsync();

        expect(adapter.putSnapshotMock).toHaveBeenCalledTimes(1);
        const [savedSnapshot] = adapter.putSnapshotMock.mock.calls[0] as [
          Snapshot<PokemonAggregate>,
        ];
        expect(savedSnapshot.aggregate).toEqual(fullAggregate);
      });

      it('does NOT save on getAggregate', async () => {
        const { store, adapter } = setupStore(undefined);

        await store.getAggregate(pikachuId);
        await vi.runAllTimersAsync();

        expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
      });
    });

    describe("'write'", () => {
      it('saves on pushEvent when threshold is reached', async () => {
        const { store, adapter } = setupStore('write');

        await store.pushEvent(pikachuLeveledUpEvent, {
          prevAggregate: partialAggregate,
        });
        await vi.runAllTimersAsync();

        expect(adapter.putSnapshotMock).toHaveBeenCalledTimes(1);
      });

      it('does NOT save on getAggregate', async () => {
        const { store, adapter } = setupStore('write');

        await store.getAggregate(pikachuId);
        await vi.runAllTimersAsync();

        expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
      });

      it('does NOT save on pushEvent when version is not a multiple of period', async () => {
        const { store, adapter } = setupStore('write');

        await store.pushEvent(pikachuCaughtEvent, {
          prevAggregate: buildAggregate([pikachuAppearedEvent]),
        });
        await vi.runAllTimersAsync();

        expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
      });

      it('skips when prevAggregate is missing on a non-initial event (no nextAggregate computed)', async () => {
        const { store, adapter } = setupStore('write');

        // Pushing without prevAggregate on a version > 1 event means
        // pushEvent does not compute nextAggregate, and the write-path save
        // therefore has nothing to evaluate.
        await store.pushEvent(pikachuLeveledUpEvent);
        await vi.runAllTimersAsync();

        expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
      });

      it('silently skips EVERY_N_MS_SINCE_LAST on the write path', async () => {
        const { store, adapter } = setupStore('write', {
          strategy: 'EVERY_N_VERSIONS',
          periodInVersions: 1,
        });
        // Reset for time-based test:
        store.snapshotConfig = {
          currentReducerVersion: 'v1',
          saveOn: 'write',
          policy: { strategy: 'EVERY_N_MS_SINCE_LAST', periodInMs: 1 },
        };

        await store.pushEvent(pikachuAppearedEvent);
        await vi.runAllTimersAsync();

        expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
      });

      it('silently skips AUTO on the write path', async () => {
        const { store, adapter } = setupStore('write');
        store.snapshotConfig = {
          currentReducerVersion: 'v1',
          saveOn: 'write',
          policy: { strategy: 'AUTO' },
        };

        await store.pushEvent(pikachuLeveledUpEvent, {
          prevAggregate: partialAggregate,
        });
        await vi.runAllTimersAsync();

        expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
      });

      it('routes write-path save errors to onSnapshotError', async () => {
        const onSnapshotError = vi.fn();
        const { store, adapter } = setupStore('write');
        const saveError = new Error('write save fail');
        adapter.putSnapshotMock.mockRejectedValue(saveError);
        store.snapshotConfig = {
          currentReducerVersion: 'v1',
          saveOn: 'write',
          policy: { strategy: 'EVERY_N_VERSIONS', periodInVersions: 3 },
          onSnapshotError,
        };

        await store.pushEvent(pikachuLeveledUpEvent, {
          prevAggregate: partialAggregate,
        });
        await vi.runAllTimersAsync();

        expect(onSnapshotError).toHaveBeenCalledWith({
          phase: 'save',
          aggregateId: pikachuId,
          eventStoreId,
          error: saveError,
        });
      });
    });

    describe("'read'", () => {
      it('saves on getAggregate when threshold is reached', async () => {
        const { store, adapter } = setupStore('read');

        await store.getAggregate(pikachuId);
        await vi.runAllTimersAsync();

        expect(adapter.putSnapshotMock).toHaveBeenCalledTimes(1);
      });

      it('does NOT save on pushEvent', async () => {
        const { store, adapter } = setupStore('read');

        await store.pushEvent(pikachuLeveledUpEvent, {
          prevAggregate: partialAggregate,
        });
        await vi.runAllTimersAsync();

        expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
      });
    });

    describe("'both'", () => {
      it('saves on both getAggregate and pushEvent', async () => {
        const { store, adapter } = setupStore('both');

        await store.getAggregate(pikachuId);
        await vi.runAllTimersAsync();
        const callsAfterRead = adapter.putSnapshotMock.mock.calls.length;
        expect(callsAfterRead).toBeGreaterThanOrEqual(1);

        adapter.putSnapshotMock.mockClear();

        await store.pushEvent(pikachuLeveledUpEvent, {
          prevAggregate: partialAggregate,
        });
        await vi.runAllTimersAsync();

        expect(adapter.putSnapshotMock).toHaveBeenCalledTimes(1);
      });
    });

    describe('pushEventGroup write-path saves', () => {
      it('saves a snapshot per event store whose policy fires after pushEventGroup', async () => {
        const adapterA = makeSnapshotAdapter();
        const adapterB = makeSnapshotAdapter();

        const pushEventGroupMock = vi.fn().mockResolvedValue({
          eventGroup: [
            { event: pikachuLeveledUpEvent },
            { event: pikachuLeveledUpEvent },
          ],
        });

        const eventStorageAdapterA = {
          pushEvent: vi.fn(),
          pushEventGroup: pushEventGroupMock,
          groupEvent: vi.fn(),
          getEvents: vi.fn(),
          listAggregateIds: vi.fn(),
        };
        const eventStorageAdapterB = {
          ...eventStorageAdapterA,
          pushEventGroup: vi.fn(),
        };

        const storeA = new EventStore({
          eventStoreId: 'A',
          eventTypes,
          reducer: pokemonsReducer,
          eventStorageAdapter: eventStorageAdapterA,
          snapshotStorageAdapter: adapterA,
          snapshotConfig: {
            currentReducerVersion: 'v1',
            saveOn: 'write',
            policy: { strategy: 'EVERY_N_VERSIONS', periodInVersions: 3 },
          },
        });

        const storeB = new EventStore({
          eventStoreId: 'B',
          eventTypes,
          reducer: pokemonsReducer,
          eventStorageAdapter: eventStorageAdapterB,
          snapshotStorageAdapter: adapterB,
          snapshotConfig: {
            currentReducerVersion: 'v1',
            saveOn: 'write',
            policy: { strategy: 'EVERY_N_VERSIONS', periodInVersions: 7 },
          },
        });

        const groupedA = new GroupedEvent({
          event: pikachuLeveledUpEvent,
          eventStorageAdapter: eventStorageAdapterA,
          context: { eventStoreId: 'A' },
        });
        groupedA.eventStore = storeA;
        groupedA.prevAggregate = partialAggregate;

        const groupedB = new GroupedEvent({
          event: pikachuLeveledUpEvent,
          eventStorageAdapter: eventStorageAdapterA,
          context: { eventStoreId: 'B' },
        });
        groupedB.eventStore = storeB;
        groupedB.prevAggregate = partialAggregate;

        await EventStore.pushEventGroup(groupedA, groupedB);
        await vi.runAllTimersAsync();

        // Store A: aggregate version becomes 3 → 3 % 3 === 0 → save fires.
        expect(adapterA.putSnapshotMock).toHaveBeenCalledTimes(1);
        // Store B: aggregate version becomes 3 → 3 % 7 !== 0 → no save.
        expect(adapterB.putSnapshotMock).not.toHaveBeenCalled();
      });
    });
  });
});
