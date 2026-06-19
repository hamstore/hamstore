import type { Aggregate } from '~/aggregate';
import type {
  EventStorageAdapter,
  EventStoreContext,
} from '~/eventStorageAdapter';
import type { EventStore } from '~/eventStore/eventStore';
import type { ValidateEventDetail } from '~/eventStore/types';
import type { SeedSnapshot } from '~/snapshot';

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
  /**
   * The snapshot that seeded `prevAggregate`, threaded to the write so the
   * snapshot policy can evaluate spacing for this aggregate when the group is
   * committed. Set by `EventStore.groupEvent` / an `AggregateHandle`. See
   * {@link SeedSnapshot}.
   */
  seedSnapshot?: SeedSnapshot<AGGREGATE>;

  eventStorageAdapter: EventStorageAdapter;
  eventStore?: EventStore;
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
    eventStore?: EventStore;
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
