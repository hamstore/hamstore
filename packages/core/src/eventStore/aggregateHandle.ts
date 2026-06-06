/* eslint-disable max-lines */
import type { EventDetail } from '~/event/eventDetail';
import type { GroupedEvent } from '~/event/groupedEvent';

import { AggregateNotFoundError } from './errors/aggregateNotFound';
import type { EventStore } from './eventStore';
import type { EventStoreAggregate, EventStoreEventDetails } from './generics';
import type {
  EventGroupPusher,
  GetAggregateOptions,
  ValidateEventDetail,
} from './types';

/**
 * Event input accepted by an {@link AggregateHandle}. `aggregateId` and
 * `version` are auto-filled from the handle (overridable); `timestamp` stays
 * optional as everywhere else. Distributes over event-detail unions so the
 * `type`/`payload` correlation is preserved.
 */
export type AggregateHandleEventInput<ES extends EventStore> =
  EventStoreEventDetails<ES> extends infer EVENT_DETAIL
    ? EVENT_DETAIL extends EventDetail
      ? Omit<EVENT_DETAIL, 'aggregateId' | 'version' | 'timestamp'> & {
          aggregateId?: string;
          version?: number;
          timestamp?: string;
        }
      : never
    : never;

/**
 * Either a ready event input, or a function of the aggregate folded through the
 * preceding events in the same call (lets a later event depend on earlier ones
 * without mutating the handle).
 */
export type AggregateHandleEventInputOrFn<ES extends EventStore> =
  | AggregateHandleEventInput<ES>
  | ((
      aggregate: EventStoreAggregate<ES> | undefined,
    ) => AggregateHandleEventInput<ES>);

/**
 * Concrete (non-generic) view of {@link EventGroupPusher} that accepts a
 * dynamic array. The generic signature can't be called with a spread of a
 * runtime-length array (TS2556), so {@link AggregateHandle.pushEvents} narrows
 * to this for the commit.
 */
type CommitGroupedEvents = (
  ...groupedEvents: GroupedEvent[]
) => Promise<{ eventGroup: { event: EventDetail }[] }>;

/**
 * An immutable, version-pinned write handle for a single aggregate.
 *
 * Obtained from {@link EventStore.openAggregate} / `openExistingAggregate` (or
 * `openAggregateFrom` for replay / first-event). `aggregate` always reflects the
 * read it was opened with — the handle never rolls itself forward. Version,
 * `aggregateId` and `prevAggregate` are auto-filled on every push.
 *
 * The handle pins an expected version, so it never force-pushes: bypassing the
 * optimistic-concurrency check would defeat its purpose. Use the low-level
 * {@link EventStore.pushEvent} with `{ force: true }` for that.
 */
export class AggregateHandle<ES extends EventStore = EventStore> {
  readonly aggregateId: string;
  readonly aggregate: EventStoreAggregate<ES> | undefined;
  readonly nextVersion: number;

  private readonly store: ES;
  private readonly commitGroup: EventGroupPusher;

  constructor({
    store,
    commitGroup,
    aggregateId,
    aggregate,
  }: {
    store: ES;
    commitGroup: EventGroupPusher;
    aggregateId: string;
    aggregate?: EventStoreAggregate<ES>;
  }) {
    this.store = store;
    this.commitGroup = commitGroup;
    this.aggregateId = aggregateId;
    this.aggregate = aggregate;
    this.nextVersion = (aggregate?.version ?? 0) + 1;
  }

  private fill(input: AggregateHandleEventInput<ES>, version: number) {
    return {
      aggregateId: this.aggregateId,
      version,
      ...(input as object),
    } as Parameters<ES['groupEvent']>[0];
  }

  /**
   * Fold a list of inputs into grouped events, walking a *local* aggregate copy
   * forward between steps. Pure with respect to the handle.
   */
  private chain(
    inputs: AggregateHandleEventInputOrFn<ES>[],
    options?: { validate?: ValidateEventDetail },
  ) {
    let running = this.aggregate;
    let version = this.nextVersion;
    const grouped: GroupedEvent[] = [];

    for (const input of inputs) {
      const resolved = typeof input === 'function' ? input(running) : input;
      const event = this.fill(resolved, version);
      grouped.push(
        this.store.groupEvent(event, {
          ...options,
          ...(running === undefined ? {} : { prevAggregate: running }),
        }) as GroupedEvent,
      );
      running = this.store.buildAggregate(
        [{ timestamp: new Date().toISOString(), ...event }] as never,
        running as never,
      ) as EventStoreAggregate<ES>;
      version += 1;
    }

    return { grouped, nextAggregate: running as EventStoreAggregate<ES> };
  }

  /** Build ONE grouped event for a cross-aggregate `EventStore.pushEventGroup`. */
  groupEvent(
    input: AggregateHandleEventInput<ES>,
    options?: { validate?: ValidateEventDetail },
  ): ReturnType<ES['groupEvent']> {
    return this.store.groupEvent(this.fill(input, this.nextVersion), {
      ...options,
      ...(this.aggregate === undefined
        ? {}
        : { prevAggregate: this.aggregate }),
    }) as ReturnType<ES['groupEvent']>;
  }

  /** Build chained grouped events for MULTIPLE events on this aggregate. */
  groupEvents(
    inputs: AggregateHandleEventInputOrFn<ES>[],
    options?: { validate?: ValidateEventDetail },
  ): ReturnType<ES['groupEvent']>[] {
    return this.chain(inputs, options).grouped as ReturnType<
      ES['groupEvent']
    >[];
  }

  /** Push a single event for this aggregate and commit it. */
  async pushEvent(
    input: AggregateHandleEventInput<ES>,
    options: { validate?: ValidateEventDetail } = {},
  ): Promise<{
    event: EventStoreEventDetails<ES>;
    nextAggregate: EventStoreAggregate<ES>;
  }> {
    const { event, nextAggregate } = await this.store.pushEvent(
      this.fill(input, this.nextVersion) as Parameters<ES['pushEvent']>[0],
      { ...options, prevAggregate: this.aggregate } as Parameters<
        ES['pushEvent']
      >[1],
    );

    return {
      event: event as EventStoreEventDetails<ES>,
      nextAggregate: nextAggregate as EventStoreAggregate<ES>,
    };
  }

  /** Push MULTIPLE events on this aggregate atomically and commit them. */
  async pushEvents(
    inputs: AggregateHandleEventInputOrFn<ES>[],
    options: { validate?: ValidateEventDetail } = {},
  ): Promise<{
    events: EventStoreEventDetails<ES>[];
    nextAggregate: EventStoreAggregate<ES>;
  }> {
    const { grouped, nextAggregate } = this.chain(inputs, options);

    const commit = this.commitGroup as unknown as CommitGroupedEvents;
    const { eventGroup } = await commit(...grouped);

    return {
      events: eventGroup.map(
        ({ event }) => event,
      ) as EventStoreEventDetails<ES>[],
      nextAggregate,
    };
  }
}

/**
 * @internal — shared open-operations delegated to by `EventStore` and
 * `ConnectedEventStore` (so each only carries one-line methods and the
 * publish-routing rebind comes for free from passing the right `store`).
 */
export const readHandle = async <ES extends EventStore>(
  store: ES,
  commitGroup: EventGroupPusher,
  aggregateId: string,
  options?: GetAggregateOptions,
): Promise<AggregateHandle<ES>> => {
  const { aggregate } = await store.getAggregate(aggregateId, options);

  return new AggregateHandle({
    store,
    commitGroup,
    aggregateId,
    aggregate: aggregate as EventStoreAggregate<ES>,
  });
};

/** @internal */
export const readExistingHandle = async <ES extends EventStore>(
  store: ES,
  commitGroup: EventGroupPusher,
  aggregateId: string,
  options?: GetAggregateOptions,
): Promise<AggregateHandle<ES>> => {
  const handle = await readHandle(store, commitGroup, aggregateId, options);

  if (handle.aggregate === undefined) {
    throw new AggregateNotFoundError({
      aggregateId,
      eventStoreId: store.eventStoreId,
    });
  }

  return handle;
};

/** @internal */
export const handleFrom = <ES extends EventStore>(
  store: ES,
  commitGroup: EventGroupPusher,
  args: { aggregateId: string; aggregate?: EventStoreAggregate<ES> },
): AggregateHandle<ES> => new AggregateHandle({ store, commitGroup, ...args });
