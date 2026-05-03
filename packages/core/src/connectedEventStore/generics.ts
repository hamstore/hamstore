import type { Aggregate } from '~/aggregate';
import type { EventDetail } from '~/event/eventDetail';
import type { EventType } from '~/event/eventType';
import type { Reducer } from '~/eventStore';

import type { ConnectedEventStore } from './connectedEventStore';

/**
 * Variant of `ConnectedEventStore` that accepts both `requirePrevAggregate=true`
 * and `requirePrevAggregate=false` event stores. Mirrors `AnyEventStore` and is
 * used as the constraint for `publishPushedEvent` so it can be called with a
 * connected store in either mode.
 *
 * Kept in a dedicated module so importing it does not create a cycle with
 * `connectedEventStore/types.ts`. `publishPushedEvent.ts` is already excluded
 * from the dependency-cruiser circular check, which is why it is the only
 * file that consumes this alias.
 */
export type AnyConnectedEventStore = ConnectedEventStore<
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
