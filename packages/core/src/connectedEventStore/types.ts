import type { Aggregate } from '~/aggregate';
import type { EventDetail } from '~/event/eventDetail';
import type { GroupedEvent } from '~/event/groupedEvent';
import type {
  EventGrouper,
  EventPusher,
  EventStore,
  Reducer,
} from '~/eventStore';
import type { EventStoreMessageChannel } from '~/messaging';

import type { ConnectedEventStore } from './connectedEventStore';

/**
 * Inner `EventStore` shape used by `ConnectedEventStore` for its
 * `MESSAGE_CHANNEL` constraint, `eventStore` field and constructor parameter.
 * Centralising it here keeps the class declaration compact.
 */
export type InnerEventStore<
  EVENT_STORE_ID extends string,
  EVENT_TYPES extends import('~/event/eventType').EventType[],
  EVENT_DETAIL extends EventDetail,
  $EVENT_DETAIL extends EventDetail,
  REDUCER extends Reducer<Aggregate, $EVENT_DETAIL>,
  AGGREGATE extends Aggregate,
  $AGGREGATE extends Aggregate,
  REQUIRES_PREV_AGGREGATE extends boolean,
> = EventStore<
  EVENT_STORE_ID,
  EVENT_TYPES,
  EVENT_DETAIL,
  $EVENT_DETAIL,
  REDUCER,
  AGGREGATE,
  $AGGREGATE,
  REQUIRES_PREV_AGGREGATE
>;

/**
 * Shape of the `messageChannel` argument expected by `ConnectedEventStore`.
 * It only needs to expose `publishMessage` from the full message-channel
 * surface area.
 */
export type ConnectedMessageChannel<
  EVENT_STORE_ID extends string,
  EVENT_TYPES extends import('~/event/eventType').EventType[],
  EVENT_DETAIL extends EventDetail,
  $EVENT_DETAIL extends EventDetail,
  REDUCER extends Reducer<Aggregate, $EVENT_DETAIL>,
  AGGREGATE extends Aggregate,
  $AGGREGATE extends Aggregate,
  REQUIRES_PREV_AGGREGATE extends boolean,
> = Pick<
  EventStoreMessageChannel<
    InnerEventStore<
      EVENT_STORE_ID,
      EVENT_TYPES,
      EVENT_DETAIL,
      $EVENT_DETAIL,
      REDUCER,
      AGGREGATE,
      $AGGREGATE,
      REQUIRES_PREV_AGGREGATE
    >
  >,
  'publishMessage'
>;

/**
 * Catch-all signature shape used to assign to the (potentially overloaded)
 * `pushEvent` and `groupEvent` properties without TypeScript trying to match
 * implementations against every individual overload.
 */
export type LoosePushEvent<
  E extends EventDetail,
  $E,
  A extends Aggregate,
  $A,
> = (
  ...args: Parameters<EventPusher<E, $E & EventDetail, A, $A & Aggregate>>
) => Promise<{ event: E; nextAggregate?: A }>;

export type LooseGroupEvent<
  E extends EventDetail,
  $E,
  A extends Aggregate,
  $A,
> = (
  ...args: Parameters<EventGrouper<E, $E, A, $A & Aggregate>>
) => GroupedEvent<E, A>;

/**
 * Variant of `ConnectedEventStore` that accepts both `requirePrevAggregate=true`
 * and `requirePrevAggregate=false` event stores. Mirrors `AnyEventStore` and is
 * used as the constraint for `publishPushedEvent` so it can be called with a
 * connected store in either mode.
 */
export type AnyConnectedEventStore = ConnectedEventStore<
  string,
  import('~/event/eventType').EventType[],
  EventDetail,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  Reducer<Aggregate, EventDetail>,
  Aggregate,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  boolean
>;
