/* eslint-disable max-lines */
import type { Aggregate } from '~/aggregate';
import type { EventDetail } from '~/event/eventDetail';
import type { EventType, EventTypeDetails } from '~/event/eventType';
import { GroupedEvent } from '~/event/groupedEvent';
import type { EventStorageAdapter } from '~/eventStorageAdapter';
import type { $Contravariant } from '~/utils';

import { AggregateNotFoundError } from './errors/aggregateNotFound';
import { EventDetailParserNotDefinedError } from './errors/eventDetailParserNotDefined';
import { EventDetailTypeDoesNotExistError } from './errors/eventDetailTypeDoesNotExist';
import { MissingPrevAggregateError } from './errors/missingPrevAggregate';
import { UndefinedEventStorageAdapterError } from './errors/undefinedEventStorageAdapter';
import type {
  AggregateIdsLister,
  EventPusher,
  OnEventPushed,
  EventGroupPusher,
  EventGroupPusherResponse,
  EventsGetter,
  EventGrouper,
  SideEffectsSimulator,
  AggregateGetter,
  AggregateSimulator,
  Reducer,
  ValidateEventDetail,
} from './types';

const resolveEventValidation = async (
  candidateEventTypes: EventType[],
  eventDetail: EventDetail,
  validate: ValidateEventDetail,
): Promise<void> => {
  if (validate === false) {
    return;
  }

  const eventType = candidateEventTypes.find(
    ({ type }) => type === eventDetail.type,
  );

  if (eventType === undefined) {
    if (validate === true) {
      throw new EventDetailTypeDoesNotExistError({
        type: eventDetail.type,
        allowedTypes: candidateEventTypes.map(({ type }) => type),
      });
    }
    return;
  }

  if (eventType.parseEventDetail === undefined) {
    if (validate === true) {
      throw new EventDetailParserNotDefinedError(eventDetail.type);
    }
    return;
  }

  const result = await eventType.parseEventDetail(eventDetail);

  if (!result.isValid) {
    const messages = result.parsingErrors.map(e => e.message);
    throw new Error(messages.join('; '));
  }
};

export class EventStore<
  EVENT_STORE_ID extends string = string,
  EVENT_TYPES extends EventType[] = EventType[],
  EVENT_DETAILS extends EventDetail = EventTypeDetails<EVENT_TYPES>,
  // cf https://devblogs.microsoft.com/typescript/announcing-typescript-4-7-rc/#optional-variance-annotations-for-type-parameters
  // EventStore is contravariant on its fns args: We have to type them as "any" so that EventStore implementations still extends the EventStore type
  $EVENT_DETAILS extends EventDetail = $Contravariant<
    EVENT_DETAILS,
    EventDetail
  >,
  REDUCER extends Reducer<Aggregate, $EVENT_DETAILS> = Reducer<
    Aggregate,
    $EVENT_DETAILS
  >,
  AGGREGATE extends Aggregate = ReturnType<REDUCER>,
  $AGGREGATE extends Aggregate = $Contravariant<AGGREGATE, Aggregate>,
  REQUIRES_PREV_AGGREGATE extends boolean = false,
> {
  static pushEventGroup: EventGroupPusher = async <
    GROUPED_EVENTS extends [GroupedEvent, ...GroupedEvent[]],
    OPTIONS_OR_GROUPED_EVENTS_HEAD extends GroupedEvent | { force?: boolean } =
      GroupedEvent,
  >(
    optionsOrGroupedEvent: OPTIONS_OR_GROUPED_EVENTS_HEAD,
    ..._groupedEvents: GROUPED_EVENTS
  ) => {
    const groupedEvents = (
      optionsOrGroupedEvent instanceof GroupedEvent
        ? [optionsOrGroupedEvent, ..._groupedEvents]
        : _groupedEvents
    ) as [GroupedEvent, ...GroupedEvent[]];

    const options = (
      optionsOrGroupedEvent instanceof GroupedEvent ? {} : optionsOrGroupedEvent
    ) as { force?: boolean };

    const [groupedEventsHead] = groupedEvents;

    // Validate all grouped events that have validation configured
    await Promise.all(
      groupedEvents.map(async groupedEvent => {
        const validate = groupedEvent.validate ?? 'auto';
        if (validate === false) {
          return;
        }
        if (groupedEvent.eventStore === undefined) {
          if (validate === true) {
            throw new Error(
              'Cannot validate grouped event: no eventStore is assigned. Use eventStore.groupEvent() to create grouped events with validation.',
            );
          }
          return;
        }

        await resolveEventValidation(
          groupedEvent.eventStore.eventTypes,
          groupedEvent.event as EventDetail,
          validate,
        );
      }),
    );

    const { eventGroup: eventGroupWithoutAggregates } =
      await groupedEventsHead.eventStorageAdapter.pushEventGroup(
        options,
        ...groupedEvents,
      );

    const eventGroupWithAggregates = eventGroupWithoutAggregates.map(
      ({ event }, eventIndex) => {
        const groupedEvent = groupedEvents[eventIndex];

        let nextAggregate: Aggregate | undefined = undefined;
        const prevAggregate = groupedEvent?.prevAggregate;

        if (
          (prevAggregate !== undefined || event.version === 1) &&
          groupedEvent?.eventStore !== undefined
        ) {
          nextAggregate = groupedEvent.eventStore.reducer(prevAggregate, event);
        }

        return {
          event,
          ...(nextAggregate !== undefined ? { nextAggregate } : {}),
        };
      },
    );

    await Promise.all(
      groupedEvents.map((groupedEvent, eventIndex) => {
        const eventStore = groupedEvent.eventStore;
        const pushEventResponse = eventGroupWithAggregates[eventIndex];

        return pushEventResponse !== undefined &&
          eventStore?.onEventPushed !== undefined
          ? eventStore.onEventPushed(pushEventResponse)
          : null;
      }),
    );

    return { eventGroup: eventGroupWithAggregates } as {
      eventGroup: OPTIONS_OR_GROUPED_EVENTS_HEAD extends GroupedEvent
        ? EventGroupPusherResponse<
            [OPTIONS_OR_GROUPED_EVENTS_HEAD, ...GROUPED_EVENTS]
          >
        : EventGroupPusherResponse<GROUPED_EVENTS>;
    };
  };

  _types?: {
    details: EVENT_DETAILS;
    aggregate: AGGREGATE;
  };
  eventStoreId: EVENT_STORE_ID;
  eventTypes: EVENT_TYPES;
  reducer: REDUCER;
  simulateSideEffect: SideEffectsSimulator<EVENT_DETAILS, $EVENT_DETAILS>;

  getEvents: EventsGetter<EVENT_DETAILS>;
  pushEvent: EventPusher<
    EVENT_DETAILS,
    $EVENT_DETAILS,
    AGGREGATE,
    $AGGREGATE,
    REQUIRES_PREV_AGGREGATE
  >;
  onEventPushed?: OnEventPushed<$EVENT_DETAILS, $AGGREGATE>;
  groupEvent: EventGrouper<
    EVENT_DETAILS,
    $EVENT_DETAILS,
    AGGREGATE,
    $AGGREGATE,
    REQUIRES_PREV_AGGREGATE
  >;
  /**
   * When `true`, `pushEvent` and `groupEvent` require a non-undefined
   * `prevAggregate` to be passed (enforced both by the type system and at
   * runtime). Useful when the event store is connected to a state-carrying
   * message bus that expects every published event to carry the resulting
   * aggregate.
   */
  requirePrevAggregate: REQUIRES_PREV_AGGREGATE;
  listAggregateIds: AggregateIdsLister;

  buildAggregate: (
    events: $EVENT_DETAILS[],
    aggregate?: $AGGREGATE,
  ) => AGGREGATE | undefined;

  getAggregate: AggregateGetter<EVENT_DETAILS, AGGREGATE>;
  getExistingAggregate: AggregateGetter<EVENT_DETAILS, AGGREGATE, true>;
  simulateAggregate: AggregateSimulator<$EVENT_DETAILS, AGGREGATE>;
  eventStorageAdapter?: EventStorageAdapter;
  getEventStorageAdapter: () => EventStorageAdapter;

  constructor({
    eventStoreId,
    eventTypes,
    reducer,
    simulateSideEffect = (indexedEvents, event) => ({
      ...indexedEvents,
      [event.version]: event,
    }),
    onEventPushed,
    eventStorageAdapter,
    requirePrevAggregate = false as REQUIRES_PREV_AGGREGATE,
  }: {
    eventStoreId: EVENT_STORE_ID;
    eventTypes: EVENT_TYPES;
    reducer: REDUCER;
    simulateSideEffect?: SideEffectsSimulator<EVENT_DETAILS, $EVENT_DETAILS>;
    onEventPushed?: OnEventPushed<$EVENT_DETAILS, $AGGREGATE>;
    eventStorageAdapter?: EventStorageAdapter;
    requirePrevAggregate?: REQUIRES_PREV_AGGREGATE;
  }) {
    this.eventStoreId = eventStoreId;
    this.eventTypes = eventTypes;
    this.reducer = reducer;
    this.simulateSideEffect = simulateSideEffect;
    this.onEventPushed = onEventPushed;
    this.eventStorageAdapter = eventStorageAdapter;
    this.requirePrevAggregate = requirePrevAggregate;

    this.getEventStorageAdapter = () => {
      if (this.eventStorageAdapter === undefined) {
        throw new UndefinedEventStorageAdapterError({
          eventStoreId: this.eventStoreId,
        });
      }

      return this.eventStorageAdapter;
    };

    this.getEvents = (aggregateId, queryOptions) =>
      this.getEventStorageAdapter().getEvents(
        aggregateId,
        { eventStoreId: this.eventStoreId },
        queryOptions,
        /**
         * @debt feature "For the moment we just cast, we could implement validation + type guards at EventType level"
         */
      ) as Promise<{ events: EVENT_DETAILS[] }>;

    const assertPrevAggregateProvided = (
      eventDetail: { version?: number },
      prevAggregate: unknown,
    ): void => {
      // Initial events (version === 1) can compute `nextAggregate` without a
      // `prevAggregate`, so they are exempt from the strict-mode check.
      if (
        this.requirePrevAggregate &&
        prevAggregate === undefined &&
        eventDetail.version !== 1
      ) {
        throw new MissingPrevAggregateError({
          eventStoreId: this.eventStoreId,
        });
      }
    };

    type LoosePushEvent = (
      ...args: Parameters<
        EventPusher<EVENT_DETAILS, $EVENT_DETAILS, AGGREGATE, $AGGREGATE>
      >
    ) => Promise<{ event: EVENT_DETAILS; nextAggregate?: AGGREGATE }>;

    const pushEvent: LoosePushEvent = async (
      eventDetail,
      { prevAggregate, force = false, validate = 'auto' } = {},
    ) => {
      assertPrevAggregateProvided(eventDetail, prevAggregate);

      await resolveEventValidation(
        this.eventTypes,
        eventDetail as EventDetail,
        validate,
      );

      const { event } = (await this.getEventStorageAdapter().pushEvent(
        eventDetail,
        {
          eventStoreId: this.eventStoreId,
          force,
        },
      )) as { event: $EVENT_DETAILS };

      let nextAggregate: AGGREGATE | undefined = undefined;
      if (prevAggregate !== undefined || event.version === 1) {
        nextAggregate = this.reducer(prevAggregate, event) as AGGREGATE;
      }

      const response = {
        event: event as unknown as EVENT_DETAILS,
        ...(nextAggregate !== undefined ? { nextAggregate } : {}),
      };

      if (this.onEventPushed !== undefined) {
        await this.onEventPushed(
          response as unknown as {
            event: $EVENT_DETAILS;
            nextAggregate?: $AGGREGATE;
          },
        );
      }

      return response;
    };
    this.pushEvent = pushEvent as typeof this.pushEvent;

    type LooseGroupEvent = (
      ...args: Parameters<
        EventGrouper<EVENT_DETAILS, $EVENT_DETAILS, AGGREGATE, $AGGREGATE>
      >
    ) => GroupedEvent<EVENT_DETAILS, AGGREGATE>;

    const groupEvent: LooseGroupEvent = (
      eventDetail,
      { prevAggregate, validate } = {},
    ) => {
      assertPrevAggregateProvided(eventDetail, prevAggregate);

      const groupedEvent = this.getEventStorageAdapter().groupEvent(
        eventDetail,
      ) as GroupedEvent<EVENT_DETAILS, AGGREGATE>;

      if (validate !== undefined) {
        groupedEvent.validate = validate;
      }

      groupedEvent.eventStore = this;
      groupedEvent.context = { eventStoreId: this.eventStoreId };

      if (prevAggregate !== undefined) {
        groupedEvent.prevAggregate = prevAggregate as unknown as AGGREGATE;
      }

      return groupedEvent;
    };
    this.groupEvent = groupEvent as typeof this.groupEvent;

    this.listAggregateIds = options =>
      this.getEventStorageAdapter().listAggregateIds(
        { eventStoreId: this.eventStoreId },
        options,
      );

    this.buildAggregate = (eventDetails, aggregate) =>
      eventDetails.reduce(this.reducer, aggregate) as AGGREGATE | undefined;

    this.getAggregate = async (aggregateId, { maxVersion } = {}) => {
      const { events } = await this.getEvents(aggregateId, { maxVersion });

      const aggregate = this.buildAggregate(
        events as unknown as $EVENT_DETAILS[],
        undefined,
      );

      const lastEvent = events[events.length - 1];

      return { aggregate, events, lastEvent };
    };

    this.getExistingAggregate = async (aggregateId, options) => {
      const { aggregate, lastEvent, ...restAggregate } =
        await this.getAggregate(aggregateId, options);

      if (aggregate === undefined || lastEvent === undefined) {
        throw new AggregateNotFoundError({
          aggregateId,
          eventStoreId: this.eventStoreId,
        });
      }

      return { aggregate, lastEvent, ...restAggregate };
    };

    this.simulateAggregate = (events, { simulationDate } = {}) => {
      let eventsWithSideEffects = Object.values(
        events.reduce(
          this.simulateSideEffect as unknown as (
            indexedEvents: Record<string, Omit<$EVENT_DETAILS, 'version'>>,
            event: $EVENT_DETAILS,
          ) => Record<string, Omit<$EVENT_DETAILS, 'version'>>,
          {} as Record<string, $EVENT_DETAILS>,
        ),
      );

      if (simulationDate !== undefined) {
        eventsWithSideEffects = eventsWithSideEffects.filter(
          ({ timestamp }) => timestamp <= simulationDate,
        );
      }

      const sortedEventsWithSideEffects = eventsWithSideEffects
        .sort(({ timestamp: timestampA }, { timestamp: timestampB }) =>
          timestampA < timestampB ? -1 : 1,
        )
        .map((event, index) => ({
          ...event,
          version: index + 1,
        })) as $EVENT_DETAILS[];

      return this.buildAggregate(sortedEventsWithSideEffects);
    };
  }
}
