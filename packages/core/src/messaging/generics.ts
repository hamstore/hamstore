import type {
  AnyEventStore,
  EventStoreId,
  EventStoreEventDetails,
  EventStoreAggregate,
} from '~/eventStore';

import type {
  AggregateExistsMessage,
  NotificationMessage,
  StateCarryingMessage,
} from './message';

export type EventStoreAggregateExistsMessage<EVENT_STORES extends AnyEventStore> =
  EVENT_STORES extends infer EVENT_STORE
    ? EVENT_STORE extends AnyEventStore
      ? AggregateExistsMessage<EventStoreId<EVENT_STORE>>
      : never
    : never;

export type EventStoreNotificationMessage<EVENT_STORES extends AnyEventStore> =
  EVENT_STORES extends infer EVENT_STORE
    ? EVENT_STORE extends AnyEventStore
      ? NotificationMessage<
          EventStoreId<EVENT_STORE>,
          EventStoreEventDetails<EVENT_STORE>
        >
      : never
    : never;

export type EventStoreStateCarryingMessage<EVENT_STORES extends AnyEventStore> =
  EVENT_STORES extends infer EVENT_STORE
    ? EVENT_STORE extends AnyEventStore
      ? StateCarryingMessage<
          EventStoreId<EVENT_STORE>,
          EventStoreEventDetails<EVENT_STORE>,
          EventStoreAggregate<EVENT_STORE>
        >
      : never
    : never;
