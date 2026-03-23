/* eslint-disable max-lines */
import type { EventDetail, OptionalTimestamp } from '~/event/eventDetail';
import { EventType } from '~/event/eventType';
import { GroupedEvent } from '~/event/groupedEvent';

import { AggregateNotFoundError } from './errors/aggregateNotFound';
import { EventDetailParserNotDefinedError } from './errors/eventDetailParserNotDefined';
import { EventDetailTypeDoesNotExistError } from './errors/eventDetailTypeDoesNotExist';
import { EventStore } from './eventStore';
import {
  PokemonAggregate,
  pokemonsEventStore,
  pokemonAppearedEvent,
  pokemonCaughtEvent,
  pokemonLeveledUpEvent,
  pokemonsReducer,
  pikachuId,
  pikachuAppearedEvent,
  pikachuLeveledUpEvent,
  pikachuCaughtEvent,
  pikachuEventsMocks,
  getEventsMock,
  pushEventMock,
  pushEventGroupMock,
  listAggregateIdsMock,
  groupEventMock,
  eventStorageAdapterMock,
  PokemonEventDetails,
} from './eventStore.fixtures.test';

describe('event store', () => {
  beforeEach(() => {
    getEventsMock.mockClear();
    getEventsMock.mockResolvedValue({ events: pikachuEventsMocks });
    pushEventMock.mockClear();
    listAggregateIdsMock.mockClear();
    listAggregateIdsMock.mockReturnValue({ aggregateIds: [pikachuId] });
  });

  it('has correct properties', () => {
    expect(new Set(Object.keys(pokemonsEventStore))).toStrictEqual(
      new Set([
        '_types',
        'eventStoreId',
        'eventTypes',
        'reducer',
        'simulateSideEffect',
        'onEventPushed',
        'eventStorageAdapter',
        'getEventStorageAdapter',
        'getEvents',
        'pushEvent',
        'groupEvent',
        'listAggregateIds',
        'buildAggregate',
        'getAggregate',
        'getExistingAggregate',
        'simulateAggregate',
      ]),
    );

    expect(pokemonsEventStore.eventStoreId).toBe('POKEMONS');

    expect(pokemonsEventStore.eventTypes).toStrictEqual([
      pokemonAppearedEvent,
      pokemonCaughtEvent,
      pokemonLeveledUpEvent,
    ]);
  });

  describe('getEvents', () => {
    it('gets events correctly', async () => {
      const response = await pokemonsEventStore.getEvents(pikachuId);

      expect(getEventsMock).toHaveBeenCalledTimes(1);
      expect(getEventsMock).toHaveBeenCalledWith(
        pikachuId,
        { eventStoreId: pokemonsEventStore.eventStoreId },
        undefined,
      );
      expect(response).toStrictEqual({ events: pikachuEventsMocks });
    });
  });

  describe('getAggregate', () => {
    it('gets aggregate correctly', async () => {
      const response = await pokemonsEventStore.getAggregate(pikachuId);

      expect(getEventsMock).toHaveBeenCalledTimes(1);
      expect(getEventsMock).toHaveBeenCalledWith(
        pikachuId,
        { eventStoreId: pokemonsEventStore.eventStoreId },
        {},
      );
      expect(response).toStrictEqual({
        aggregate: pikachuEventsMocks.reduce(
          pokemonsReducer,
          undefined as unknown as PokemonAggregate,
        ),
        events: pikachuEventsMocks,
        lastEvent: pikachuEventsMocks[pikachuEventsMocks.length - 1],
      });
    });
  });

  describe('getExistingAggregate', () => {
    it('gets aggregate correctly if it exists', async () => {
      const response = await pokemonsEventStore.getExistingAggregate(pikachuId);

      expect(getEventsMock).toHaveBeenCalledTimes(1);
      expect(getEventsMock).toHaveBeenCalledWith(
        pikachuId,
        { eventStoreId: pokemonsEventStore.eventStoreId },
        {},
      );

      expect(response).toStrictEqual({
        aggregate: pikachuEventsMocks.reduce(
          pokemonsReducer,
          undefined as unknown as PokemonAggregate,
        ),
        events: pikachuEventsMocks,
        lastEvent: pikachuEventsMocks[pikachuEventsMocks.length - 1],
      });
    });

    it('throws an AggregateNotFound error if it does not', async () => {
      getEventsMock.mockResolvedValue({ events: [] });

      await expect(() =>
        pokemonsEventStore.getExistingAggregate(pikachuId),
      ).rejects.toThrow(
        new AggregateNotFoundError({
          eventStoreId: pokemonsEventStore.eventStoreId,
          aggregateId: pikachuId,
        }),
      );
    });
  });

  describe('pushEvent', () => {
    it('pushes new event correctly', async () => {
      pushEventMock.mockResolvedValue({ event: pikachuLeveledUpEvent });

      const response = await pokemonsEventStore.pushEvent(
        pikachuLeveledUpEvent,
      );

      expect(pushEventMock).toHaveBeenCalledTimes(1);
      expect(pushEventMock).toHaveBeenCalledWith(pikachuLeveledUpEvent, {
        eventStoreId: pokemonsEventStore.eventStoreId,
        force: false,
      });
      expect(response).toStrictEqual({ event: pikachuLeveledUpEvent });
    });

    it('returns the next aggregate if event is initial event', async () => {
      pushEventMock.mockResolvedValue({ event: pikachuAppearedEvent });

      const response = await pokemonsEventStore.pushEvent(pikachuAppearedEvent);

      expect(response).toStrictEqual({
        event: pikachuAppearedEvent,
        nextAggregate: pokemonsEventStore.buildAggregate([
          pikachuAppearedEvent,
        ]),
      });
    });

    it('returns the next aggregate if prev aggregate has been provided', async () => {
      pushEventMock.mockResolvedValue({ event: pikachuLeveledUpEvent });

      const response = await pokemonsEventStore.pushEvent(
        pikachuLeveledUpEvent,
        {
          prevAggregate: pokemonsEventStore.buildAggregate([
            pikachuAppearedEvent,
            pikachuCaughtEvent,
          ]),
        },
      );

      expect(response).toStrictEqual({
        event: pikachuLeveledUpEvent,
        nextAggregate: pokemonsEventStore.buildAggregate([
          pikachuAppearedEvent,
          pikachuCaughtEvent,
          pikachuLeveledUpEvent,
        ]),
      });
    });
  });

  describe('groupEvent', () => {
    groupEventMock.mockReturnValue(
      new GroupedEvent({
        event: pikachuLeveledUpEvent,
        eventStorageAdapter: eventStorageAdapterMock,
      }),
    );

    it('calls the storage adapter groupEvent method', () => {
      const groupedEvent = pokemonsEventStore.groupEvent(pikachuLeveledUpEvent);

      expect(groupEventMock).toHaveBeenCalledTimes(1);
      expect(groupEventMock).toHaveBeenCalledWith(pikachuLeveledUpEvent);

      expect(groupedEvent).toBeInstanceOf(GroupedEvent);
      expect(groupedEvent.eventStore).toBe(pokemonsEventStore);
      expect(groupedEvent.context).toStrictEqual({
        eventStoreId: pokemonsEventStore.eventStoreId,
      });
      expect(groupedEvent.prevAggregate).toBeUndefined();
    });

    it('appends the prevAggregate if one has been provided', () => {
      const prevAggregate = pokemonsEventStore.buildAggregate([
        pikachuAppearedEvent,
        pikachuCaughtEvent,
      ]);

      const groupedEvent = pokemonsEventStore.groupEvent(
        pikachuLeveledUpEvent,
        { prevAggregate },
      );
      expect(groupedEvent.prevAggregate).toStrictEqual(prevAggregate);
    });
  });

  describe('pushEventGroup', () => {
    const charizardLeveledUpEvent: PokemonEventDetails = {
      aggregateId: 'charizard1',
      version: 3,
      type: 'POKEMON_LEVELED_UP',
      timestamp: pikachuLeveledUpEvent.timestamp,
    };

    beforeEach(() => {
      pushEventGroupMock.mockReset();
    });

    it('pushes new event group correctly', async () => {
      pushEventGroupMock.mockResolvedValue({
        eventGroup: [
          { event: pikachuLeveledUpEvent },
          { event: charizardLeveledUpEvent },
        ],
      });

      const eventGroup = [
        new GroupedEvent({
          event: pikachuLeveledUpEvent,
          eventStorageAdapter: eventStorageAdapterMock,
        }),
        new GroupedEvent({
          event: charizardLeveledUpEvent,
          eventStorageAdapter: eventStorageAdapterMock,
        }),
      ] as const;

      const response = await EventStore.pushEventGroup(...eventGroup);

      expect(pushEventGroupMock).toHaveBeenCalledTimes(1);
      expect(pushEventGroupMock).toHaveBeenCalledWith({}, ...eventGroup);

      expect(response).toStrictEqual({
        eventGroup: [
          { event: pikachuLeveledUpEvent },
          { event: charizardLeveledUpEvent },
        ],
      });
    });

    it('passes options through', async () => {
      const options = { force: true };

      pushEventGroupMock.mockResolvedValue({
        eventGroup: [
          { event: pikachuLeveledUpEvent },
          { event: charizardLeveledUpEvent },
        ],
      });

      const eventGroup = [
        new GroupedEvent({
          event: pikachuLeveledUpEvent,
          eventStorageAdapter: eventStorageAdapterMock,
        }),
        new GroupedEvent({
          event: charizardLeveledUpEvent,
          eventStorageAdapter: eventStorageAdapterMock,
        }),
      ] as const;

      const response = await EventStore.pushEventGroup(options, ...eventGroup);

      expect(pushEventGroupMock).toHaveBeenCalledTimes(1);
      expect(pushEventGroupMock).toHaveBeenCalledWith(options, ...eventGroup);

      expect(response).toStrictEqual({
        eventGroup: [
          { event: pikachuLeveledUpEvent },
          { event: charizardLeveledUpEvent },
        ],
      });
    });

    it('returns the next aggregate if event is initial event', async () => {
      pushEventGroupMock.mockResolvedValue({
        eventGroup: [
          { event: pikachuAppearedEvent },
          { event: charizardLeveledUpEvent },
        ],
      });

      const eventGroup = [
        new GroupedEvent({
          event: pikachuLeveledUpEvent,
          eventStore: pokemonsEventStore,
          eventStorageAdapter: eventStorageAdapterMock,
        }),
        new GroupedEvent({
          event: charizardLeveledUpEvent,
          eventStorageAdapter: eventStorageAdapterMock,
        }),
      ] as const;

      const response = await EventStore.pushEventGroup(...eventGroup);

      expect(response.eventGroup[0].nextAggregate).toStrictEqual(
        pokemonsEventStore.buildAggregate([pikachuAppearedEvent]),
      );
    });

    it('returns the next aggregate if prev aggregate has been provided', async () => {
      pushEventGroupMock.mockResolvedValue({
        eventGroup: [
          { event: pikachuCaughtEvent },
          { event: charizardLeveledUpEvent },
        ],
      });

      const eventGroup = [
        new GroupedEvent({
          event: pikachuCaughtEvent,
          prevAggregate: pokemonsEventStore.buildAggregate([
            pikachuAppearedEvent,
          ]),
          eventStore: pokemonsEventStore,
          eventStorageAdapter: eventStorageAdapterMock,
        }),
        new GroupedEvent({
          event: charizardLeveledUpEvent,
          eventStorageAdapter: eventStorageAdapterMock,
        }),
      ] as const;

      const response = await EventStore.pushEventGroup(...eventGroup);

      expect(response.eventGroup[0].nextAggregate).toStrictEqual(
        pokemonsEventStore.buildAggregate([
          pikachuAppearedEvent,
          pikachuCaughtEvent,
        ]),
      );
    });
  });

  describe('validate (pushEvent)', () => {
    type AppearedDetail = EventDetail<'POKEMON_APPEARED', { name: string; level: number }>;

    const pokemonAppearedWithParser = new EventType<
      'POKEMON_APPEARED',
      { name: string; level: number }
    >({
      type: 'POKEMON_APPEARED',
      parseEventDetail: candidate => {
        const payload = candidate.payload as
          | { name: string; level: number }
          | undefined;
        if (payload != null && typeof payload.name === 'string') {
          return {
            isValid: true as const,
            parsedEventDetail: candidate as AppearedDetail,
          };
        }
        return {
          isValid: false as const,
          parsingErrors: [new Error('Invalid payload')] as [Error, ...Error[]],
        };
      },
    });

    const pokemonCaughtNoParser = new EventType({ type: 'POKEMON_CAUGHT' });

    const pokemonLeveledUpNoParser = new EventType({
      type: 'POKEMON_LEVELED_UP',
    });

    const validatingEventStore = new EventStore({
      eventStoreId: 'VALIDATING_POKEMONS',
      eventTypes: [
        pokemonAppearedWithParser,
        pokemonCaughtNoParser,
        pokemonLeveledUpNoParser,
      ],
      reducer: pokemonsReducer,
      eventStorageAdapter: eventStorageAdapterMock,
    });

    beforeEach(() => {
      pushEventMock.mockReset();
    });

    it('validates a valid event with validate=true', async () => {
      pushEventMock.mockResolvedValue({ event: pikachuAppearedEvent });

      const response = await validatingEventStore.pushEvent(
        pikachuAppearedEvent,
        { validate: true },
      );

      expect(pushEventMock).toHaveBeenCalledTimes(1);
      expect(response.event).toStrictEqual(pikachuAppearedEvent);
    });

    it('rejects an invalid event with validate=true', async () => {
      const invalidEvent = {
        ...pikachuAppearedEvent,
        payload: { name: 123 },
      };

      await expect(
        validatingEventStore.pushEvent(
          invalidEvent as unknown as PokemonEventDetails,
          { validate: true },
        ),
      ).rejects.toThrow('Invalid payload');

      expect(pushEventMock).not.toHaveBeenCalled();
    });

    it('skips validation entirely with validate=false', async () => {
      const invalidEvent = {
        ...pikachuAppearedEvent,
        payload: { name: 123 },
      };

      pushEventMock.mockResolvedValue({ event: invalidEvent });

      await validatingEventStore.pushEvent(
        invalidEvent as unknown as PokemonEventDetails,
        { validate: false },
      );

      expect(pushEventMock).toHaveBeenCalledTimes(1);
    });

    it('validates with validate=auto (default) when parser exists', async () => {
      const invalidEvent = {
        ...pikachuAppearedEvent,
        payload: { name: 123 },
      };

      await expect(
        validatingEventStore.pushEvent(
          invalidEvent as unknown as PokemonEventDetails,
        ),
      ).rejects.toThrow('Invalid payload');
    });

    it('silently skips with validate=auto when no parser is defined', async () => {
      pushEventMock.mockResolvedValue({ event: pikachuCaughtEvent });

      const response = await validatingEventStore.pushEvent(
        pikachuCaughtEvent,
      );

      expect(pushEventMock).toHaveBeenCalledTimes(1);
      expect(response.event).toStrictEqual(pikachuCaughtEvent);
    });

    it('throws EventDetailParserNotDefinedError with validate=true when no parser is defined', async () => {
      await expect(
        validatingEventStore.pushEvent(pikachuCaughtEvent, {
          validate: true,
        }),
      ).rejects.toThrow(EventDetailParserNotDefinedError);
    });

    it('throws EventDetailTypeDoesNotExistError with validate=true for unknown event type', async () => {
      const unknownEvent = {
        ...pikachuAppearedEvent,
        type: 'UNKNOWN_TYPE',
      };

      await expect(
        validatingEventStore.pushEvent(
          unknownEvent as unknown as PokemonEventDetails,
          { validate: true },
        ),
      ).rejects.toThrow(EventDetailTypeDoesNotExistError);
    });

    it('silently skips with validate=auto for unknown event type', async () => {
      const unknownEvent = {
        ...pikachuAppearedEvent,
        type: 'UNKNOWN_TYPE',
      };

      pushEventMock.mockResolvedValue({ event: unknownEvent });

      await validatingEventStore.pushEvent(
        unknownEvent as unknown as PokemonEventDetails,
      );

      expect(pushEventMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('validate (groupEvent)', () => {
    beforeEach(() => {
      groupEventMock.mockImplementation(
        (event: OptionalTimestamp<EventDetail>) =>
          new GroupedEvent({
            event,
            eventStorageAdapter: eventStorageAdapterMock,
          }),
      );
    });

    it('passes validate option through to GroupedEvent', () => {
      const groupedEvent = pokemonsEventStore.groupEvent(
        pikachuLeveledUpEvent,
        { validate: true },
      );

      expect(groupedEvent.validate).toStrictEqual(true);
    });

    it('does not set validate when not provided', () => {
      const groupedEvent =
        pokemonsEventStore.groupEvent(pikachuLeveledUpEvent);

      expect(groupedEvent.validate).toBeUndefined();
    });
  });

  describe('validate (pushEventGroup)', () => {
    type AppearedDetail = EventDetail<'POKEMON_APPEARED', { name: string; level: number }>;

    const pokemonAppearedWithParser = new EventType<
      'POKEMON_APPEARED',
      { name: string; level: number }
    >({
      type: 'POKEMON_APPEARED',
      parseEventDetail: candidate => {
        const payload = candidate.payload as
          | { name: string; level: number }
          | undefined;
        if (payload != null && typeof payload.name === 'string') {
          return {
            isValid: true as const,
            parsedEventDetail: candidate as AppearedDetail,
          };
        }
        return {
          isValid: false as const,
          parsingErrors: [new Error('Invalid payload')] as [Error, ...Error[]],
        };
      },
    });

    const pokemonCaughtNoParser = new EventType({ type: 'POKEMON_CAUGHT' });

    const pokemonLeveledUpNoParser = new EventType({
      type: 'POKEMON_LEVELED_UP',
    });

    const validatingEventStore = new EventStore({
      eventStoreId: 'VALIDATING_POKEMONS',
      eventTypes: [
        pokemonAppearedWithParser,
        pokemonCaughtNoParser,
        pokemonLeveledUpNoParser,
      ],
      reducer: pokemonsReducer,
      eventStorageAdapter: eventStorageAdapterMock,
    });

    beforeEach(() => {
      pushEventGroupMock.mockReset();
    });

    it('rejects grouped event with invalid payload when validate is set', async () => {
      const invalidEvent = {
        ...pikachuAppearedEvent,
        payload: { name: 123 },
      };

      const groupedEvent1 = new GroupedEvent({
        event: invalidEvent,
        eventStore: validatingEventStore,
        eventStorageAdapter: eventStorageAdapterMock,
      });
      groupedEvent1.validate = true;

      const groupedEvent2 = new GroupedEvent({
        event: pikachuCaughtEvent,
        eventStorageAdapter: eventStorageAdapterMock,
      });

      await expect(
        EventStore.pushEventGroup(groupedEvent1, groupedEvent2),
      ).rejects.toThrow('Invalid payload');

      expect(pushEventGroupMock).not.toHaveBeenCalled();
    });

    it('throws when validate=true but no eventStore is assigned', async () => {
      const groupedEvent1 = new GroupedEvent({
        event: pikachuAppearedEvent,
        eventStorageAdapter: eventStorageAdapterMock,
      });
      groupedEvent1.validate = true;

      const groupedEvent2 = new GroupedEvent({
        event: pikachuCaughtEvent,
        eventStorageAdapter: eventStorageAdapterMock,
      });

      await expect(
        EventStore.pushEventGroup(groupedEvent1, groupedEvent2),
      ).rejects.toThrow(
        'Cannot validate grouped event: no eventStore is assigned',
      );

      expect(pushEventGroupMock).not.toHaveBeenCalled();
    });

    it('allows grouped event with validate=false even if payload is invalid', async () => {
      const invalidEvent = {
        ...pikachuAppearedEvent,
        payload: { name: 123 },
      };

      pushEventGroupMock.mockResolvedValue({
        eventGroup: [
          { event: invalidEvent },
          { event: pikachuCaughtEvent },
        ],
      });

      const groupedEvent1 = new GroupedEvent({
        event: invalidEvent,
        eventStore: validatingEventStore,
        eventStorageAdapter: eventStorageAdapterMock,
      });
      groupedEvent1.validate = false;

      const groupedEvent2 = new GroupedEvent({
        event: pikachuCaughtEvent,
        eventStorageAdapter: eventStorageAdapterMock,
      });

      await EventStore.pushEventGroup(groupedEvent1, groupedEvent2);

      expect(pushEventGroupMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('listAggregateIds', () => {
    it('lists aggregateIds correctly', async () => {
      const limitMock = 10;
      const pageTokenMock = 'pageTokenMock';
      const initialEventAfterMock = '2021-01-01T00:00:00.000Z';
      const initialEventBeforeMock = '2022-01-01T00:00:00.000Z';
      const reverseMock = true;

      const response = await pokemonsEventStore.listAggregateIds({
        limit: limitMock,
        pageToken: pageTokenMock,
        initialEventAfter: initialEventAfterMock,
        initialEventBefore: initialEventBeforeMock,
        reverse: reverseMock,
      });

      expect(listAggregateIdsMock).toHaveBeenCalledTimes(1);
      expect(listAggregateIdsMock).toHaveBeenCalledWith(
        { eventStoreId: pokemonsEventStore.eventStoreId },
        {
          limit: limitMock,
          pageToken: pageTokenMock,
          initialEventAfter: initialEventAfterMock,
          initialEventBefore: initialEventBeforeMock,
          reverse: reverseMock,
        },
      );

      expect(response).toStrictEqual({ aggregateIds: [pikachuId] });
    });
  });
});
