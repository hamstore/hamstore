/* eslint-disable max-lines */
import { GroupedEvent } from '~/event/groupedEvent';

import { AggregateHandle } from './aggregateHandle';
import { AggregateNotFoundError } from './errors/aggregateNotFound';
import {
  eventStorageAdapterMock,
  getEventsMock,
  groupEventMock,
  pikachuAppearedEvent,
  pikachuCaughtEvent,
  pikachuId,
  pokemonsEventStore,
  pushEventGroupMock,
  pushEventMock,
} from './eventStore.fixtures.test';

describe('AggregateHandle', () => {
  beforeEach(() => {
    getEventsMock.mockClear();
    getEventsMock.mockResolvedValue({ events: [pikachuAppearedEvent] });
    pushEventMock.mockClear();
    pushEventGroupMock.mockClear();
    groupEventMock.mockClear();
    groupEventMock.mockImplementation(
      event =>
        new GroupedEvent({
          event,
          eventStorageAdapter: eventStorageAdapterMock,
        }),
    );
  });

  describe('openAggregate', () => {
    it('reads the aggregate and pins the next version', async () => {
      const handle = await pokemonsEventStore.openAggregate(pikachuId);

      expect(getEventsMock).toHaveBeenCalledTimes(1);
      expect(handle.aggregateId).toBe(pikachuId);
      expect(handle.aggregate).toStrictEqual(
        pokemonsEventStore.buildAggregate([pikachuAppearedEvent]),
      );
      // pikachuAppearedEvent is version 1 → next write targets version 2
      expect(handle.nextVersion).toBe(2);
    });

    it('pins version 1 when the aggregate does not exist yet', async () => {
      getEventsMock.mockResolvedValue({ events: [] });

      const handle = await pokemonsEventStore.openAggregate('ghost');

      expect(handle.aggregate).toBeUndefined();
      expect(handle.nextVersion).toBe(1);
    });
  });

  describe('openExistingAggregate', () => {
    it('throws AggregateNotFoundError when the aggregate is missing', async () => {
      getEventsMock.mockResolvedValue({ events: [] });

      await expect(
        pokemonsEventStore.openExistingAggregate('ghost'),
      ).rejects.toBeInstanceOf(AggregateNotFoundError);
    });
  });

  describe('openNewAggregate', () => {
    it('pins version 1 for a brand-new aggregate without reading storage', () => {
      const handle = pokemonsEventStore.openNewAggregate('new-1');

      expect(getEventsMock).not.toHaveBeenCalled();
      expect(handle.aggregateId).toBe('new-1');
      expect(handle.aggregate).toBeUndefined();
      expect(handle.nextVersion).toBe(1);
    });
  });

  describe('openAggregateFrom', () => {
    it('wraps an aggregate without reading storage, deriving id + version', () => {
      const aggregate = pokemonsEventStore.buildAggregate([
        pikachuAppearedEvent,
      ])!;

      const handle = pokemonsEventStore.openAggregateFrom(aggregate);

      expect(getEventsMock).not.toHaveBeenCalled();
      expect(handle.aggregateId).toBe(pikachuId);
      expect(handle.aggregate).toStrictEqual(aggregate);
      expect(handle.nextVersion).toBe(2);
    });
  });

  describe('static factories', () => {
    it('open reads the aggregate and pins the next version', async () => {
      const handle = await AggregateHandle.open(pokemonsEventStore, pikachuId);

      expect(getEventsMock).toHaveBeenCalledTimes(1);
      expect(handle.aggregateId).toBe(pikachuId);
      expect(handle.aggregate).toStrictEqual(
        pokemonsEventStore.buildAggregate([pikachuAppearedEvent]),
      );
      expect(handle.nextVersion).toBe(2);
    });

    it('openExisting throws AggregateNotFoundError when the aggregate is missing', async () => {
      getEventsMock.mockResolvedValue({ events: [] });

      await expect(
        AggregateHandle.openExisting(pokemonsEventStore, 'ghost'),
      ).rejects.toBeInstanceOf(AggregateNotFoundError);
    });

    it('forNew pins version 1 without reading storage', () => {
      const handle = AggregateHandle.forNew(pokemonsEventStore, 'new-1');

      expect(getEventsMock).not.toHaveBeenCalled();
      expect(handle.aggregateId).toBe('new-1');
      expect(handle.aggregate).toBeUndefined();
      expect(handle.nextVersion).toBe(1);
    });

    it('from wraps an aggregate without reading storage, deriving id + version', () => {
      const aggregate = pokemonsEventStore.buildAggregate([
        pikachuAppearedEvent,
      ])!;

      const handle = AggregateHandle.from(pokemonsEventStore, aggregate);

      expect(getEventsMock).not.toHaveBeenCalled();
      expect(handle.aggregateId).toBe(pikachuId);
      expect(handle.aggregate).toStrictEqual(aggregate);
      expect(handle.nextVersion).toBe(2);
    });
  });

  describe('pushEvent', () => {
    it('auto-fills aggregateId + version and commits via store.pushEvent', async () => {
      pushEventMock.mockResolvedValue({ event: pikachuCaughtEvent });

      const handle = await pokemonsEventStore.openAggregate(pikachuId);
      const { event, nextAggregate } = await handle.pushEvent({
        type: 'POKEMON_CAUGHT',
      });

      expect(pushEventMock).toHaveBeenCalledTimes(1);
      expect(pushEventMock).toHaveBeenCalledWith(
        { aggregateId: pikachuId, version: 2, type: 'POKEMON_CAUGHT' },
        { eventStoreId: pokemonsEventStore.eventStoreId, force: false },
      );

      expect(event).toStrictEqual(pikachuCaughtEvent);
      expect(nextAggregate).toStrictEqual(
        pokemonsEventStore.buildAggregate([
          pikachuAppearedEvent,
          pikachuCaughtEvent,
        ]),
      );
    });

    it('rejects version / aggregateId overrides in the input', async () => {
      const handle = await pokemonsEventStore.openAggregate(pikachuId);

      await expect(
        handle.pushEvent({ type: 'POKEMON_CAUGHT', version: 9 } as never),
      ).rejects.toThrow(/cannot be set on handle pushes/);
      await expect(
        handle.pushEvent({
          type: 'POKEMON_CAUGHT',
          aggregateId: 'other',
        } as never),
      ).rejects.toThrow(/cannot be set on handle pushes/);
      expect(pushEventMock).not.toHaveBeenCalled();
    });
  });

  describe('pushEvents', () => {
    it('chains dependent events and commits them atomically', async () => {
      // Echo back the committed events (like a real storage adapter), so the
      // rebuilt `nextAggregate` reflects what was actually persisted.
      pushEventGroupMock.mockImplementation(
        (_options: { force?: boolean }, ...grouped: GroupedEvent[]) => ({
          eventGroup: grouped.map(groupedEvent => ({
            event: groupedEvent.event,
          })),
        }),
      );

      const seen: Array<{ level: number; version: number } | undefined> = [];

      const handle = await pokemonsEventStore.openAggregate(pikachuId);
      const { events, nextAggregate } = await handle.pushEvents([
        { type: 'POKEMON_LEVELED_UP' },
        prevAggregate => {
          seen.push(
            prevAggregate && {
              level: prevAggregate.level,
              version: prevAggregate.version,
            },
          );

          return { type: 'POKEMON_LEVELED_UP' };
        },
      ]);

      // One atomic commit through the group pusher.
      expect(pushEventGroupMock).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(2);

      // The dependent fn sees the aggregate folded through the first event:
      // pikachu started at level 42 (version 1), so after one level-up it is
      // level 43 at version 2.
      expect(seen).toStrictEqual([{ level: 43, version: 2 }]);

      // Two level-ups from version 1 → version 3, level 44.
      expect(nextAggregate.version).toBe(3);
      expect(nextAggregate.level).toBe(44);
    });
  });

  describe('groupEvent', () => {
    it('builds ONE grouped event pinned at the next version', () => {
      const aggregate = pokemonsEventStore.buildAggregate([
        pikachuAppearedEvent,
      ])!;
      const handle = pokemonsEventStore.openAggregateFrom(aggregate);

      const grouped = handle.groupEvent({ type: 'POKEMON_CAUGHT' });

      expect(groupEventMock).toHaveBeenCalledTimes(1);
      expect(groupEventMock).toHaveBeenCalledWith({
        aggregateId: pikachuId,
        version: 2,
        type: 'POKEMON_CAUGHT',
      });
      expect(grouped).toBeInstanceOf(GroupedEvent);
      expect(grouped.eventStore).toBe(pokemonsEventStore);
      expect(grouped.prevAggregate).toStrictEqual(aggregate);
    });

    it('does NOT chain: two calls target the same version (collide loudly)', () => {
      const aggregate = pokemonsEventStore.buildAggregate([
        pikachuAppearedEvent,
      ])!;
      const handle = pokemonsEventStore.openAggregateFrom(aggregate);

      handle.groupEvent({ type: 'POKEMON_CAUGHT' });
      handle.groupEvent({ type: 'POKEMON_LEVELED_UP' });

      expect(groupEventMock).toHaveBeenNthCalledWith(1, {
        aggregateId: pikachuId,
        version: 2,
        type: 'POKEMON_CAUGHT',
      });
      // Same version 2 — pushing both collides on (aggregateId, version).
      expect(groupEventMock).toHaveBeenNthCalledWith(2, {
        aggregateId: pikachuId,
        version: 2,
        type: 'POKEMON_LEVELED_UP',
      });
    });
  });

  describe('groupEvents', () => {
    it('chains multiple grouped events on one aggregate', () => {
      const aggregate = pokemonsEventStore.buildAggregate([
        pikachuAppearedEvent,
      ])!;
      const handle = pokemonsEventStore.openAggregateFrom(aggregate);

      const grouped = handle.groupEvents([
        { type: 'POKEMON_LEVELED_UP' },
        { type: 'POKEMON_LEVELED_UP' },
      ]);

      expect(grouped).toHaveLength(2);
      expect(groupEventMock).toHaveBeenNthCalledWith(1, {
        aggregateId: pikachuId,
        version: 2,
        type: 'POKEMON_LEVELED_UP',
      });
      expect(groupEventMock).toHaveBeenNthCalledWith(2, {
        aggregateId: pikachuId,
        version: 3,
        type: 'POKEMON_LEVELED_UP',
      });
    });

    it('rejects an empty list of inputs', () => {
      const handle = pokemonsEventStore.openNewAggregate(pikachuId);

      expect(() => handle.groupEvents([] as never)).toThrow(
        /empty list of events/,
      );
    });

    it('rejects version / aggregateId overrides', () => {
      const handle = pokemonsEventStore.openNewAggregate(pikachuId);

      expect(() =>
        handle.groupEvents([
          { type: 'POKEMON_LEVELED_UP', version: 9 } as never,
        ]),
      ).toThrow(/cannot be set on handle pushes/);
      expect(() =>
        handle.groupEvents([
          { type: 'POKEMON_LEVELED_UP', aggregateId: 'other' } as never,
        ]),
      ).toThrow(/cannot be set on handle pushes/);
      // singular groupEvent rejects too:
      expect(() =>
        handle.groupEvent({ type: 'POKEMON_LEVELED_UP', version: 9 } as never),
      ).toThrow(/cannot be set on handle pushes/);
    });
  });
});
