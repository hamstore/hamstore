/* eslint-disable max-lines */
import { vi, describe, it, expect } from 'vitest';

import { GroupedEvent } from '~/event/groupedEvent';
import {
  absentSeedSnapshot,
  presentSeedSnapshot,
  type Snapshot,
  type SnapshotConfig,
  type SnapshotStorageAdapter,
} from '~/snapshot';

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

  describe('write-path saves (pushEvent)', () => {
    const eventTypes = [
      pokemonAppearedEvent,
      pokemonCaughtEvent,
      pokemonLeveledUpEvent,
    ];

    const appearedAggregate = buildAggregate([pikachuAppearedEvent]);

    const setupStore = (
      policy: SnapshotConfig<PokemonAggregate>['policy'],
      extraConfig: Partial<SnapshotConfig<PokemonAggregate>> = {},
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
          policy,
          ...extraConfig,
        },
      });

      return { store, adapter, pushEventMock };
    };

    it('saves when the policy fires and prevAggregate is supplied', async () => {
      const { store, adapter } = setupStore({
        strategy: 'EVERY_N_VERSIONS',
        periodInVersions: 3,
      });

      await store.pushEvent(pikachuLeveledUpEvent, {
        prevAggregate: partialAggregate,
      });

      expect(adapter.putSnapshotMock).toHaveBeenCalledTimes(1);
      const [savedSnapshot] = adapter.putSnapshotMock.mock.calls[0] as [
        Snapshot<PokemonAggregate>,
      ];
      expect(savedSnapshot.aggregate).toEqual(fullAggregate);
      expect(savedSnapshot.reducerVersion).toBe('v1');
      expect(savedSnapshot.eventStoreId).toBe(eventStoreId);
    });

    it('saves on a version-1 event even without prevAggregate', async () => {
      const { store, adapter } = setupStore({
        strategy: 'EVERY_N_VERSIONS',
        periodInVersions: 1,
      });

      await store.pushEvent(pikachuAppearedEvent);

      expect(adapter.putSnapshotMock).toHaveBeenCalledTimes(1);
      const [savedSnapshot] = adapter.putSnapshotMock.mock.calls[0] as [
        Snapshot<PokemonAggregate>,
      ];
      expect(savedSnapshot.aggregate).toEqual(appearedAggregate);
    });

    it('does not save when the policy is NONE', async () => {
      const { store, adapter } = setupStore({ strategy: 'NONE' });

      await store.pushEvent(pikachuLeveledUpEvent, {
        prevAggregate: partialAggregate,
      });

      expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
    });

    it('does not save when the version is not a multiple of the period (unknown seed)', async () => {
      const { store, adapter } = setupStore({
        strategy: 'EVERY_N_VERSIONS',
        periodInVersions: 3,
      });

      await store.pushEvent(pikachuCaughtEvent, {
        prevAggregate: appearedAggregate,
      });

      expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
    });

    it('skips when prevAggregate is missing on a non-initial event (no nextAggregate)', async () => {
      const { store, adapter } = setupStore({
        strategy: 'EVERY_N_VERSIONS',
        periodInVersions: 1,
      });

      // No prevAggregate on a version > 1 event ⇒ pushEvent never builds
      // nextAggregate, so there is nothing to snapshot (no history rebuild).
      await store.pushEvent(pikachuLeveledUpEvent);

      expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
    });

    it('never writes a snapshot on the read path (getAggregate)', async () => {
      const { store, adapter } = setupStore({
        strategy: 'EVERY_N_VERSIONS',
        periodInVersions: 1,
      });

      await store.getAggregate(pikachuId);

      expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
    });

    describe('tri-state seedSnapshot', () => {
      it('present: evaluates the version gap relative to the seed', async () => {
        const { store, adapter } = setupStore({
          strategy: 'EVERY_N_VERSIONS',
          periodInVersions: 2,
        });

        // Seed at v2, result v3 ⇒ gap 1 < 2 ⇒ no save.
        await store.pushEvent(pikachuLeveledUpEvent, {
          prevAggregate: partialAggregate,
          seedSnapshot: presentSeedSnapshot(makeSnapshot(partialAggregate, 'v1')),
        });
        expect(adapter.putSnapshotMock).not.toHaveBeenCalled();

        // Seed at v1, result v3 ⇒ gap 2 >= 2 ⇒ save.
        await store.pushEvent(pikachuLeveledUpEvent, {
          prevAggregate: partialAggregate,
          seedSnapshot: presentSeedSnapshot(
            makeSnapshot(appearedAggregate, 'v1'),
          ),
        });
        expect(adapter.putSnapshotMock).toHaveBeenCalledTimes(1);
      });

      it('present: skips when the seed already covers the resulting version', async () => {
        const { store, adapter } = setupStore({
          strategy: 'EVERY_N_VERSIONS',
          periodInVersions: 1,
        });

        await store.pushEvent(pikachuLeveledUpEvent, {
          prevAggregate: partialAggregate,
          seedSnapshot: presentSeedSnapshot(makeSnapshot(fullAggregate, 'v1')),
        });

        expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
      });

      it('absent: establishes a first snapshot for a time-based policy', async () => {
        const { store, adapter } = setupStore({
          strategy: 'EVERY_N_MS_SINCE_LAST',
          periodInMs: 60_000,
        });

        await store.pushEvent(pikachuLeveledUpEvent, {
          prevAggregate: partialAggregate,
          seedSnapshot: absentSeedSnapshot,
        });

        expect(adapter.putSnapshotMock).toHaveBeenCalledTimes(1);
      });

      it('unknown: a time-based policy never fires (no spacing data)', async () => {
        const { store, adapter } = setupStore({
          strategy: 'EVERY_N_MS_SINCE_LAST',
          periodInMs: 60_000,
        });

        // seedSnapshot omitted ⇒ unknown.
        await store.pushEvent(pikachuLeveledUpEvent, {
          prevAggregate: partialAggregate,
        });

        expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
      });
    });

    it('routes save errors to onSnapshotError and does not reject the push', async () => {
      const onSnapshotError = vi.fn();
      const saveError = new Error('write save fail');
      const { store, adapter } = setupStore(
        { strategy: 'EVERY_N_VERSIONS', periodInVersions: 3 },
        { onSnapshotError },
      );
      adapter.putSnapshotMock.mockRejectedValue(saveError);

      await expect(
        store.pushEvent(pikachuLeveledUpEvent, {
          prevAggregate: partialAggregate,
        }),
      ).resolves.toBeDefined();

      expect(onSnapshotError).toHaveBeenCalledWith({
        phase: 'save',
        aggregateId: pikachuId,
        eventStoreId,
        error: saveError,
      });
    });

    describe('scheduleBackgroundWork', () => {
      it('routes the save to the hook instead of awaiting it inline', async () => {
        let captured: (() => Promise<void>) | undefined = undefined;
        const { store, adapter } = setupStore(
          { strategy: 'EVERY_N_VERSIONS', periodInVersions: 3 },
          {
            scheduleBackgroundWork: work => {
              captured = work;
            },
          },
        );

        await store.pushEvent(pikachuLeveledUpEvent, {
          prevAggregate: partialAggregate,
        });

        // Not awaited inline: ownership transferred to the hook.
        expect(adapter.putSnapshotMock).not.toHaveBeenCalled();
        expect(captured).toBeDefined();

        await captured!();
        expect(adapter.putSnapshotMock).toHaveBeenCalledTimes(1);
      });
    });

    describe('pruning', () => {
      const previousKeys = [
        {
          aggregateId: pikachuId,
          aggregateVersion: 3,
          reducerVersion: 'v1',
          savedAt: new Date('2024-01-01T03:00:00.000Z').toISOString(),
        },
        {
          aggregateId: pikachuId,
          aggregateVersion: 2,
          reducerVersion: 'v1',
          savedAt: new Date('2024-01-01T02:00:00.000Z').toISOString(),
        },
        {
          aggregateId: pikachuId,
          aggregateVersion: 1,
          reducerVersion: 'v1',
          savedAt: new Date('2024-01-01T01:00:00.000Z').toISOString(),
        },
      ];

      it('does not prune by default (pruning omitted ⇒ NONE)', async () => {
        const { store, adapter } = setupStore({
          strategy: 'EVERY_N_VERSIONS',
          periodInVersions: 3,
        });
        adapter.listSnapshotsMock.mockResolvedValue({
          snapshotKeys: previousKeys,
        });

        await store.pushEvent(pikachuLeveledUpEvent, {
          prevAggregate: partialAggregate,
        });

        expect(adapter.putSnapshotMock).toHaveBeenCalledTimes(1);
        expect(adapter.listSnapshotsMock).not.toHaveBeenCalled();
        expect(adapter.deleteSnapshotMock).not.toHaveBeenCalled();
      });

      it('prunes previous snapshots when pruning is DELETE_PREVIOUS', async () => {
        const { store, adapter } = setupStore(
          { strategy: 'EVERY_N_VERSIONS', periodInVersions: 3 },
          { pruning: { strategy: 'DELETE_PREVIOUS' } },
        );
        adapter.listSnapshotsMock.mockResolvedValue({
          snapshotKeys: previousKeys,
        });

        await store.pushEvent(pikachuLeveledUpEvent, {
          prevAggregate: partialAggregate,
        });

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

  describe('pushEventGroup write-path saves', () => {
    const eventTypes = [
      pokemonAppearedEvent,
      pokemonCaughtEvent,
      pokemonLeveledUpEvent,
    ];

    it('saves a snapshot per event store whose policy fires after the group commits', async () => {
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

      // Store A: aggregate version becomes 3 → 3 % 3 === 0 → save fires.
      expect(adapterA.putSnapshotMock).toHaveBeenCalledTimes(1);
      // Store B: aggregate version becomes 3 → 3 % 7 !== 0 → no save.
      expect(adapterB.putSnapshotMock).not.toHaveBeenCalled();
    });
  });
});
