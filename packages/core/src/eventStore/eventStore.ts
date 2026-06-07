/* eslint-disable max-lines */
import type { Aggregate } from '~/aggregate';
import type { EventDetail } from '~/event/eventDetail';
import type { EventType, EventTypeDetails } from '~/event/eventType';
import type { GroupedEvent } from '~/event/groupedEvent';
import type { EventStorageAdapter } from '~/eventStorageAdapter';
import type { $Contravariant } from '~/utils';

import { AggregateHandle } from './aggregateHandle';
import { AggregateNotFoundError } from './errors/aggregateNotFound';
import { UndefinedEventStorageAdapterError } from './errors/undefinedEventStorageAdapter';
import { pushEventGroup } from './pushEventGroup';
import { resolveEventValidation } from './resolveEventValidation';
import type {
  AggregateIdsLister,
  EventPusher,
  OnEventPushed,
  EventGroupPusher,
  EventsGetter,
  EventGrouper,
  SideEffectsSimulator,
  AggregateGetter,
  AggregateAndEventsGetter,
  AggregateSimulator,
  GetAggregateOptions,
  Reducer,
} from './types';

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
> {
  /**
   * Commit a group of events across one or more aggregates atomically — either
   * all of them are pushed, or none are (see
   * [Event Groups](https://hamstore.github.io/hamstore/docs/event-sourcing/joining-data)).
   */
  // Re-assignment of the `this`-free {@link pushEventGroup}, so the
  // `AggregateHandle` factories can share it without a runtime import cycle.
  static pushEventGroup: EventGroupPusher = pushEventGroup;

  _types?: {
    details: EVENT_DETAILS;
    aggregate: AGGREGATE;
  };
  eventStoreId: EVENT_STORE_ID;
  eventTypes: EVENT_TYPES;
  reducer: REDUCER;
  simulateSideEffect: SideEffectsSimulator<EVENT_DETAILS, $EVENT_DETAILS>;

  getEvents: EventsGetter<EVENT_DETAILS>;
  pushEvent: EventPusher<EVENT_DETAILS, $EVENT_DETAILS, AGGREGATE, $AGGREGATE>;
  onEventPushed?: OnEventPushed<$EVENT_DETAILS, $AGGREGATE>;
  groupEvent: EventGrouper<
    EVENT_DETAILS,
    $EVENT_DETAILS,
    AGGREGATE,
    $AGGREGATE
  >;
  listAggregateIds: AggregateIdsLister;

  buildAggregate: (
    events: $EVENT_DETAILS[],
    aggregate?: $AGGREGATE,
  ) => AGGREGATE | undefined;

  getAggregate: AggregateGetter<AGGREGATE>;
  getExistingAggregate: AggregateGetter<AGGREGATE, true>;
  getAggregateAndEvents: AggregateAndEventsGetter<EVENT_DETAILS, AGGREGATE>;
  getExistingAggregateAndEvents: AggregateAndEventsGetter<
    EVENT_DETAILS,
    AGGREGATE,
    true
  >;
  simulateAggregate: AggregateSimulator<$EVENT_DETAILS, AGGREGATE>;
  eventStorageAdapter?: EventStorageAdapter;
  getEventStorageAdapter: () => EventStorageAdapter;

  /**
   * Read an aggregate and wrap it in an immutable, version-pinned
   * {@link AggregateHandle} that auto-fills `aggregateId`/`version`/
   * `prevAggregate` on every push. Open a fresh handle per command attempt
   * (a handle held across an optimistic-concurrency retry is stale).
   *
   * For the unusual case where you already hold an aggregate (replay,
   * projection, simulation) and want to skip the read, use the static
   * {@link AggregateHandle.from} — it is deliberately not an instance method, as
   * a pre-loaded aggregate is stale on retry and so does not belong in commands.
   */
  openAggregate(
    aggregateId: string,
    options?: GetAggregateOptions,
  ): Promise<AggregateHandle<this>> {
    return AggregateHandle.open(this, aggregateId, options);
  }

  /** Like {@link openAggregate}, but throws if the aggregate does not exist. */
  openExistingAggregate(
    aggregateId: string,
    options?: GetAggregateOptions,
  ): Promise<AggregateHandle<this>> {
    return AggregateHandle.openExisting(this, aggregateId, options);
  }

  /**
   * Open a handle for an aggregate that does not exist yet (first event at
   * version 1). Does not read storage — use when the aggregate is known to be
   * new (first-event / bulk-import paths).
   */
  openNewAggregate(aggregateId: string): AggregateHandle<this> {
    return AggregateHandle.forNew(this, aggregateId);
  }

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
  }: {
    eventStoreId: EVENT_STORE_ID;
    eventTypes: EVENT_TYPES;
    reducer: REDUCER;
    simulateSideEffect?: SideEffectsSimulator<EVENT_DETAILS, $EVENT_DETAILS>;
    onEventPushed?: OnEventPushed<$EVENT_DETAILS, $AGGREGATE>;
    eventStorageAdapter?: EventStorageAdapter;
  }) {
    this.eventStoreId = eventStoreId;
    this.eventTypes = eventTypes;
    this.reducer = reducer;
    this.simulateSideEffect = simulateSideEffect;
    this.onEventPushed = onEventPushed;
    this.eventStorageAdapter = eventStorageAdapter;

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

    this.pushEvent = async (
      eventDetail,
      { prevAggregate, force = false, validate = 'auto' } = {},
    ) => {
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

    this.groupEvent = (eventDetail, { prevAggregate, validate } = {}) => {
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

    this.listAggregateIds = options =>
      this.getEventStorageAdapter().listAggregateIds(
        { eventStoreId: this.eventStoreId },
        options,
      );

    this.buildAggregate = (eventDetails, aggregate) =>
      eventDetails.reduce(this.reducer, aggregate) as AGGREGATE | undefined;

    /**
     * Internal helper that loads events for an aggregate and reduces them.
     * Used by both `getAggregate` (which discards events) and
     * `getAggregateAndEvents` (which returns them).
     */
    const rebuildAggregate = async (
      aggregateId: string,
      maxVersion?: number,
    ): Promise<{
      aggregate: AGGREGATE | undefined;
      events: EVENT_DETAILS[];
      lastEvent: EVENT_DETAILS | undefined;
    }> => {
      const { events } = await this.getEvents(
        aggregateId,
        maxVersion !== undefined ? { maxVersion } : undefined,
      );

      const aggregate = this.buildAggregate(
        events as unknown as $EVENT_DETAILS[],
        undefined,
      );

      const lastEvent = events[events.length - 1];

      return { aggregate, events, lastEvent };
    };

    this.getAggregate = async (aggregateId, { maxVersion } = {}) => {
      const { aggregate } = await rebuildAggregate(aggregateId, maxVersion);

      return { aggregate };
    };

    this.getExistingAggregate = async (aggregateId, options) => {
      const { aggregate } = await this.getAggregate(aggregateId, options);

      if (aggregate === undefined) {
        throw new AggregateNotFoundError({
          aggregateId,
          eventStoreId: this.eventStoreId,
        });
      }

      return { aggregate };
    };

    this.getAggregateAndEvents = async (
      aggregateId,
      { maxVersion, fromVersion } = {},
    ) => {
      const {
        aggregate,
        events: allEvents,
      } = await rebuildAggregate(aggregateId, maxVersion);

      const events =
        fromVersion !== undefined && fromVersion > 1
          ? allEvents.filter(event => event.version >= fromVersion)
          : allEvents;
      const lastEvent = events[events.length - 1];

      return { aggregate, events, lastEvent };
    };

    this.getExistingAggregateAndEvents = async (aggregateId, options) => {
      const { aggregate, events, lastEvent } =
        await this.getAggregateAndEvents(aggregateId, options);

      if (aggregate === undefined || lastEvent === undefined) {
        throw new AggregateNotFoundError({
          aggregateId,
          eventStoreId: this.eventStoreId,
        });
      }

      return { aggregate, events, lastEvent };
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
