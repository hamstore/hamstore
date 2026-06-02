import type { Aggregate } from '~/aggregate';
import type { EventDetail } from '~/event/eventDetail';
import type { EventType } from '~/event/eventType';

import type { EventStore } from './eventStore';
import type { Reducer } from './types';

/**
 * Variant of `EventStore` that accepts both `requirePrevAggregate=true` and
 * `requirePrevAggregate=false` event stores. Used as the constraint for
 * messaging types so they can accept event stores in either mode.
 *
 * Plain `EventStore` (with all defaults) is `EventStore<..., false>`, which is
 * a subtype of `AnyEventStore`, so existing references remain valid.
 *
 * The contravariant slots (`$EVENT_DETAILS`, `$AGGREGATE`) are typed as `any`
 * to keep this an upper bound for arbitrarily-specific event stores, matching
 * the behavior of bare `EventStore` (which resolves these slots via
 * `$Contravariant<X, X>` → `any`).
 */
export type AnyEventStore = EventStore<
  string,
  EventType[],
  EventDetail,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  Reducer<Aggregate, EventDetail>,
  Aggregate,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  boolean
>;

export type EventStoreId<EVENT_STORE extends AnyEventStore> =
  EVENT_STORE['eventStoreId'];

export type EventStoreEventTypes<EVENT_STORE extends AnyEventStore> =
  EVENT_STORE['eventTypes'];

export type EventStoreEventDetails<EVENT_STORE extends AnyEventStore> =
  NonNullable<EVENT_STORE['_types']>['details'];

export type EventStoreReducer<EVENT_STORE extends AnyEventStore> =
  EVENT_STORE['reducer'];

export type EventStoreAggregate<EVENT_STORE extends AnyEventStore> =
  NonNullable<EVENT_STORE['_types']>['aggregate'];
