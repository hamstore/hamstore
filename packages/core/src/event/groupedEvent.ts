import type { Aggregate } from '~/aggregate';
import type {
  EventStorageAdapter,
  EventStoreContext,
} from '~/eventStorageAdapter';
import type { AnyEventStore } from '~/eventStore/generics';
import type { ValidateEventDetail } from '~/eventStore/types';

import type { EventDetail, OptionalTimestamp } from './eventDetail';

export class GroupedEvent<
  EVENT_DETAILS extends EventDetail = EventDetail,
  AGGREGATE extends Aggregate = Aggregate,
> {
  _types?: {
    details: EVENT_DETAILS;
    aggregate: AGGREGATE;
  };
  event: OptionalTimestamp<EVENT_DETAILS>;
  context?: EventStoreContext;
  prevAggregate?: AGGREGATE;

  eventStorageAdapter: EventStorageAdapter;
  eventStore?: AnyEventStore;
  validate?: ValidateEventDetail;

  constructor({
    event,
    context,
    prevAggregate,
    eventStorageAdapter,
    eventStore,
  }: {
    event: OptionalTimestamp<EVENT_DETAILS>;
    context?: EventStoreContext;
    prevAggregate?: AGGREGATE;
    eventStore?: AnyEventStore;
    eventStorageAdapter: EventStorageAdapter;
  }) {
    this.event = event;
    if (context !== undefined) {
      this.context = context;
    }
    if (prevAggregate !== undefined) {
      this.prevAggregate = prevAggregate;
    }

    this.eventStorageAdapter = eventStorageAdapter;
    if (eventStore !== undefined) {
      this.eventStore = eventStore;
    }
  }
}
