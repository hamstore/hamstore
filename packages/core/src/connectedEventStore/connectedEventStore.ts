/* eslint-disable max-lines */
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
  AggregateAndEventsGetter,
  EventsGetter,
  EventStore,
  OnEventPushed,
  Reducer,
  SideEffectsSimulator,
} from '~/eventStore';
import type { EventStoreMessageChannel } from '~/messaging';
import type {
  Snapshot,
  SnapshotConfig,
  SnapshotStorageAdapter,
} from '~/snapshot';
import type { $Contravariant } from '~/utils';

import { publishPushedEvent } from './publishPushedEvent';

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
  MESSAGE_CHANNEL extends Pick<
    EventStoreMessageChannel<
      EventStore<
        EVENT_STORE_ID,
        EVENT_TYPES,
        EVENT_DETAIL,
        $EVENT_DETAIL,
        REDUCER,
        AGGREGATE,
        $AGGREGATE
      >
    >,
    'publishMessage'
  > = Pick<
    EventStoreMessageChannel<
      EventStore<
        EVENT_STORE_ID,
        EVENT_TYPES,
        EVENT_DETAIL,
        $EVENT_DETAIL,
        REDUCER,
        AGGREGATE,
        $AGGREGATE
      >
    >,
    'publishMessage'
  >,
> implements EventStore<
  EVENT_STORE_ID,
  EVENT_TYPES,
  EVENT_DETAIL,
  $EVENT_DETAIL,
  REDUCER,
  AGGREGATE,
  $AGGREGATE
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
  pushEvent: EventPusher<EVENT_DETAIL, $EVENT_DETAIL, AGGREGATE, $AGGREGATE>;
  groupEvent: EventGrouper<EVENT_DETAIL, $EVENT_DETAIL, AGGREGATE, $AGGREGATE>;
  listAggregateIds: AggregateIdsLister;
  buildAggregate: (
    events: $EVENT_DETAIL[],
    aggregate?: $AGGREGATE,
  ) => AGGREGATE | undefined;
  getAggregate: AggregateGetter<AGGREGATE>;
  getExistingAggregate: AggregateGetter<AGGREGATE, true>;
  getAggregateAndEvents: AggregateAndEventsGetter<EVENT_DETAIL, AGGREGATE>;
  getExistingAggregateAndEvents: AggregateAndEventsGetter<
    EVENT_DETAIL,
    AGGREGATE,
    true
  >;
  simulateAggregate: AggregateSimulator<$EVENT_DETAIL, AGGREGATE>;
  getEventStorageAdapter: () => EventStorageAdapter;
  getSnapshotStorageAdapter: () => SnapshotStorageAdapter;

  eventStore: EventStore<
    EVENT_STORE_ID,
    EVENT_TYPES,
    EVENT_DETAIL,
    $EVENT_DETAIL,
    REDUCER,
    AGGREGATE,
    $AGGREGATE
  >;
  messageChannel: MESSAGE_CHANNEL;

  constructor(
    eventStore: EventStore<
      EVENT_STORE_ID,
      EVENT_TYPES,
      EVENT_DETAIL,
      $EVENT_DETAIL,
      REDUCER,
      AGGREGATE,
      $AGGREGATE
    >,
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
    this.getAggregateAndEvents = eventStore.getAggregateAndEvents;
    this.getExistingAggregateAndEvents =
      eventStore.getExistingAggregateAndEvents;
    this.simulateAggregate = eventStore.simulateAggregate;
    this.getEventStorageAdapter = eventStore.getEventStorageAdapter;
    this.getSnapshotStorageAdapter = eventStore.getSnapshotStorageAdapter;

    this.groupEvent = (...args) => {
      const groupedEvent = eventStore.groupEvent(...args);
      groupedEvent.eventStore = this;

      return groupedEvent;
    };

    this.pushEvent = async (eventInput, options = {}) => {
      const response = await this.eventStore.pushEvent(eventInput, options);

      await publishPushedEvent(this, response);

      return response;
    };

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
        this,
        props as unknown as { event: EVENT_DETAIL; nextAggregate?: AGGREGATE },
      );
    };
  }

  set snapshotStorageAdapter(
    snapshotStorageAdapter: SnapshotStorageAdapter | undefined,
  ) {
    this.eventStore.snapshotStorageAdapter = snapshotStorageAdapter;
  }

  get snapshotStorageAdapter(): SnapshotStorageAdapter | undefined {
    return this.eventStore.snapshotStorageAdapter;
  }

  set snapshotConfig(snapshotConfig: SnapshotConfig<$AGGREGATE> | undefined) {
    this.eventStore.snapshotConfig = snapshotConfig;
  }

  get snapshotConfig(): SnapshotConfig<$AGGREGATE> | undefined {
    return this.eventStore.snapshotConfig;
  }

  _tryPersistSnapshot(args: {
    aggregate: $AGGREGATE;
    previousSnapshot: Snapshot<$AGGREGATE> | undefined;
    newEventCount: number;
    source: 'read' | 'write';
  }): void {
    this.eventStore._tryPersistSnapshot(args);
  }

  _snapshotSaveAllowed(source: 'read' | 'write'): boolean {
    return this.eventStore._snapshotSaveAllowed(source);
  }

  async _persistSnapshotIfPolicy(args: {
    aggregate: $AGGREGATE;
    previousSnapshot: Snapshot<$AGGREGATE> | undefined;
    newEventCount: number;
    source: 'read' | 'write';
  }): Promise<void> {
    await this.eventStore._persistSnapshotIfPolicy(args);
  }

  _buildSnapshotIfPolicyFires(args: {
    aggregate: $AGGREGATE;
    previousSnapshot: Snapshot<$AGGREGATE> | undefined;
    newEventCount: number;
    source: 'read' | 'write';
  }): Snapshot<$AGGREGATE> | undefined {
    return this.eventStore._buildSnapshotIfPolicyFires(args);
  }

  _snapshotPolicyFires(args: {
    aggregate: $AGGREGATE;
    previousSnapshot: Snapshot<$AGGREGATE> | undefined;
    newEventCount: number;
    source: 'read' | 'write';
  }): boolean {
    return this.eventStore._snapshotPolicyFires(args);
  }

  async _pruneSnapshotsAfterSave(args: {
    aggregateId: string;
    newSnapshot: Snapshot<$AGGREGATE>;
  }): Promise<void> {
    await this.eventStore._pruneSnapshotsAfterSave(args);
  }
}
