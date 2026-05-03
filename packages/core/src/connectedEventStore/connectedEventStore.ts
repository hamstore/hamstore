import type { Aggregate } from '~/aggregate';
import type { EventDetail } from '~/event/eventDetail';
import type { EventType, EventTypeDetails } from '~/event/eventType';
import type { EventStorageAdapter } from '~/eventStorageAdapter';
import type {
  AggregateGetter,
  AggregateIdsLister,
  AggregateSimulator,
  EventGrouper,
  EventPusher,
  EventsGetter,
  OnEventPushed,
  Reducer,
  SideEffectsSimulator,
} from '~/eventStore';
import type { $Contravariant } from '~/utils';

import { publishPushedEvent } from './publishPushedEvent';
import type {
  ConnectedMessageChannel,
  InnerEventStore,
  LooseGroupEvent,
  LoosePushEvent,
} from './types';

export class ConnectedEventStore<
  EVENT_STORE_ID extends string = string,
  EVENT_TYPES extends EventType[] = EventType[],
  EVENT_DETAIL extends EventDetail = EventTypeDetails<EVENT_TYPES>,
  $EVENT_DETAIL extends EventDetail = $Contravariant<EVENT_DETAIL, EventDetail>,
  REDUCER extends Reducer<Aggregate, $EVENT_DETAIL> = Reducer<
    Aggregate,
    $EVENT_DETAIL
  >,
  AGGREGATE extends Aggregate = ReturnType<REDUCER>,
  $AGGREGATE extends Aggregate = $Contravariant<AGGREGATE, Aggregate>,
  REQUIRES_PREV_AGGREGATE extends boolean = false,
  MESSAGE_CHANNEL extends ConnectedMessageChannel<
    EVENT_STORE_ID,
    EVENT_TYPES,
    EVENT_DETAIL,
    $EVENT_DETAIL,
    REDUCER,
    AGGREGATE,
    $AGGREGATE,
    REQUIRES_PREV_AGGREGATE
  > = ConnectedMessageChannel<
    EVENT_STORE_ID,
    EVENT_TYPES,
    EVENT_DETAIL,
    $EVENT_DETAIL,
    REDUCER,
    AGGREGATE,
    $AGGREGATE,
    REQUIRES_PREV_AGGREGATE
  >,
> implements InnerEventStore<
  EVENT_STORE_ID,
  EVENT_TYPES,
  EVENT_DETAIL,
  $EVENT_DETAIL,
  REDUCER,
  AGGREGATE,
  $AGGREGATE,
  REQUIRES_PREV_AGGREGATE
> {
  _types?: {
    details: EVENT_DETAIL;
    aggregate: AGGREGATE;
  };
  eventStoreId: EVENT_STORE_ID;
  eventTypes: EVENT_TYPES;
  reducer: REDUCER;
  simulateSideEffect: SideEffectsSimulator<EVENT_DETAIL, $EVENT_DETAIL>;
  getEvents: EventsGetter<EVENT_DETAIL>;
  pushEvent: EventPusher<
    EVENT_DETAIL,
    $EVENT_DETAIL,
    AGGREGATE,
    $AGGREGATE,
    REQUIRES_PREV_AGGREGATE
  >;
  groupEvent: EventGrouper<
    EVENT_DETAIL,
    $EVENT_DETAIL,
    AGGREGATE,
    $AGGREGATE,
    REQUIRES_PREV_AGGREGATE
  >;
  requirePrevAggregate: REQUIRES_PREV_AGGREGATE;
  listAggregateIds: AggregateIdsLister;
  buildAggregate: (
    events: $EVENT_DETAIL[],
    aggregate?: $AGGREGATE,
  ) => AGGREGATE | undefined;
  getAggregate: AggregateGetter<EVENT_DETAIL, AGGREGATE>;
  getExistingAggregate: AggregateGetter<EVENT_DETAIL, AGGREGATE, true>;
  simulateAggregate: AggregateSimulator<$EVENT_DETAIL, AGGREGATE>;
  getEventStorageAdapter: () => EventStorageAdapter;

  eventStore: InnerEventStore<
    EVENT_STORE_ID,
    EVENT_TYPES,
    EVENT_DETAIL,
    $EVENT_DETAIL,
    REDUCER,
    AGGREGATE,
    $AGGREGATE,
    REQUIRES_PREV_AGGREGATE
  >;
  messageChannel: MESSAGE_CHANNEL;

  constructor(
    eventStore: typeof this.eventStore,
    messageChannel: MESSAGE_CHANNEL,
  ) {
    this.eventStoreId = eventStore.eventStoreId;
    this.eventTypes = eventStore.eventTypes;
    this.reducer = eventStore.reducer;
    this.simulateSideEffect = eventStore.simulateSideEffect;
    this.getEvents = eventStore.getEvents;
    this.listAggregateIds = eventStore.listAggregateIds;
    this.buildAggregate = eventStore.buildAggregate;
    this.getAggregate = eventStore.getAggregate;
    this.getExistingAggregate = eventStore.getExistingAggregate;
    this.simulateAggregate = eventStore.simulateAggregate;
    this.getEventStorageAdapter = eventStore.getEventStorageAdapter;
    this.requirePrevAggregate = eventStore.requirePrevAggregate;

    type LooseGE = LooseGroupEvent<
      EVENT_DETAIL,
      $EVENT_DETAIL,
      AGGREGATE,
      $AGGREGATE
    >;
    const groupEvent: LooseGE = (...args) => {
      const groupedEvent = (eventStore.groupEvent as LooseGE)(...args);
      groupedEvent.eventStore = this;

      return groupedEvent;
    };
    this.groupEvent = groupEvent as typeof this.groupEvent;

    type LoosePE = LoosePushEvent<
      EVENT_DETAIL,
      $EVENT_DETAIL,
      AGGREGATE,
      $AGGREGATE
    >;
    const pushEvent: LoosePE = async (eventInput, options = {}) => {
      const response = await (this.eventStore.pushEvent as LoosePE)(
        eventInput,
        options,
      );
      await publishPushedEvent(this as unknown as ConnectedEventStore, response);

      return response;
    };
    this.pushEvent = pushEvent as typeof this.pushEvent;

    this.eventStore = eventStore;
    this.messageChannel = messageChannel;
  }

  set eventStorageAdapter(
    eventStorageAdapter: EventStorageAdapter | undefined,
  ) {
    this.eventStore.eventStorageAdapter = eventStorageAdapter;
  }

  get eventStorageAdapter(): EventStorageAdapter | undefined {
    return this.eventStore.eventStorageAdapter;
  }

  set onEventPushed(
    onEventPushed: OnEventPushed<$EVENT_DETAIL, $AGGREGATE> | undefined,
  ) {
    this.eventStore.onEventPushed = onEventPushed;
  }

  get onEventPushed(): OnEventPushed<$EVENT_DETAIL, $AGGREGATE> {
    return async props => {
      if (this.eventStore.onEventPushed !== undefined) {
        await this.eventStore.onEventPushed(props);
      }

      await publishPushedEvent(
        this as unknown as ConnectedEventStore,
        props as unknown as { event: EVENT_DETAIL; nextAggregate?: AGGREGATE },
      );
    };
  }
}
