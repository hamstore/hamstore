/* eslint-disable max-lines */
import type { EventDetail } from '~/event/eventDetail';
import type { GroupedEvent } from '~/event/groupedEvent';

import { AggregateNotFoundError } from './errors/aggregateNotFound';
import type { EventStore } from './eventStore';
import type { EventStoreAggregate, EventStoreEventDetails } from './generics';
import { pushEventGroup } from './pushEventGroup';
import type {
  EventGroupPusher,
  GetAggregateOptions,
  ValidateEventDetail,
} from './types';

/**
 * Event input accepted by an {@link AggregateHandle}. `aggregateId` and
 * `version` are owned by the handle and cannot be set here — reach for the
 * low-level {@link EventStore.pushEvent} if you need explicit control over
 * them. `timestamp` stays optional as everywhere else. Distributes over
 * event-detail unions so the `type`/`payload` correlation is preserved.
 */
export type AggregateHandleEventInput<ES extends EventStore> =
  EventStoreEventDetails<ES> extends infer EVENT_DETAIL
    ? EVENT_DETAIL extends EventDetail
      ? Omit<EVENT_DETAIL, 'aggregateId' | 'version' | 'timestamp'> & {
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
 * A **non-empty** list of inputs for the chained handle methods
 * ({@link AggregateHandle.pushEvents} / {@link AggregateHandle.groupEvents}).
 * Typed as a non-empty tuple so an empty call is a compile error; combined with
 * a `const` type parameter at the call site, this lets the result mirror the
 * input's length (a fixed-size tuple the caller can spread straight into
 * {@link EventStore.pushEventGroup}).
 */
export type AggregateHandleEventInputs<ES extends EventStore> = readonly [
  AggregateHandleEventInputOrFn<ES>,
  ...AggregateHandleEventInputOrFn<ES>[],
];

/**
 * Concrete (non-generic) view of {@link EventGroupPusher} that accepts a
 * dynamic array. The generic signature can't be called with a spread of a
 * runtime-length array (TS2556), so {@link AggregateHandle} stores the group
 * pusher narrowed to this for the commit.
 *
 * Storing the narrowed type (rather than `EventGroupPusher`) is also what keeps
 * `AggregateHandle` — and therefore `EventStore` — structurally comparable
 * across two copies of `@hamstore/core` (e.g. under `preserveSymlinks`): the
 * full `EventGroupPusher` carries a `GroupedEvent | { force? }` union in a
 * contravariant position whose comparison recurses through
 * `GroupedEvent.eventStore` back into `EventStore` and trips a spurious
 * incompatibility. `never[]` params avoid that recursion entirely.
 */
type CommitGroupedEvents = (
  ...groupedEvents: never[]
) => Promise<{ eventGroup: { event: EventDetail }[] }>;

/**
 * An immutable, version-pinned write handle for a single aggregate.
 *
 * Obtained from {@link EventStore.openAggregate} / `openExistingAggregate` (or,
 * without a read, `openNewAggregate` for a brand-new one). For the unusual case
 * of an aggregate you already hold, use the static {@link AggregateHandle.from}
 * — there is deliberately no instance method for it. `aggregate` always reflects
 * the read it was opened with — the handle never rolls itself forward. Version,
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

  // `store`/`commitGroup` are deliberately public (like `GroupedEvent`'s
  // fields): TS `private`/`#` members are nominal, which would make two copies
  // of `@hamstore/core` produce mutually-incompatible `AggregateHandle` (and
  // thus `EventStore`) types. Treat them as internal.
  /** @internal */
  readonly store: ES;
  /** @internal */
  readonly commitGroup: CommitGroupedEvents;

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
    this.commitGroup = commitGroup as unknown as CommitGroupedEvents;
    this.aggregateId = aggregateId;
    this.aggregate = aggregate;
    this.nextVersion = (aggregate?.version ?? 0) + 1;
  }

  /**
   * Read an aggregate from `store` (via its lean `getAggregate`) and wrap it in
   * a handle. This is the primitive that `EventStore.openAggregate` delegates
   * to — a class that `implements EventStore` (rather than `extends`-ing it)
   * can reuse it to implement `openAggregate` in one line:
   *
   * ```ts
   * openAggregate(id: string, options?: GetAggregateOptions) {
   *   return AggregateHandle.open(this, id, options);
   * }
   * ```
   *
   * Passing the store is what makes the handle's reads and its commit route
   * through it (so e.g. a `ConnectedEventStore` keeps publishing).
   */
  static async open<ES extends EventStore>(
    store: ES,
    aggregateId: string,
    options?: GetAggregateOptions,
  ): Promise<AggregateHandle<ES>> {
    const { aggregate } = await store.getAggregate(aggregateId, options);

    return new AggregateHandle({
      store,
      commitGroup: pushEventGroup,
      aggregateId,
      aggregate: aggregate as EventStoreAggregate<ES>,
    });
  }

  /**
   * Like {@link AggregateHandle.open}, but throws {@link AggregateNotFoundError}
   * if the aggregate does not exist. Backs `openExistingAggregate`.
   */
  static async openExisting<ES extends EventStore>(
    store: ES,
    aggregateId: string,
    options?: GetAggregateOptions,
  ): Promise<AggregateHandle<ES>> {
    const handle = await AggregateHandle.open(store, aggregateId, options);

    if (handle.aggregate === undefined) {
      throw new AggregateNotFoundError({
        aggregateId,
        eventStoreId: store.eventStoreId,
      });
    }

    return handle;
  }

  /**
   * Synchronously open a handle for an aggregate that does not exist yet (no
   * I/O) — pins `nextVersion = 1`. Backs `openNewAggregate`; useful for
   * first-event / bulk-import paths where the read can be skipped because the
   * aggregate is known to be new.
   */
  static forNew<ES extends EventStore>(
    store: ES,
    aggregateId: string,
  ): AggregateHandle<ES> {
    return new AggregateHandle({
      store,
      commitGroup: pushEventGroup,
      aggregateId,
    });
  }

  /**
   * Synchronously wrap an aggregate you already hold (no I/O) — the
   * `aggregateId` and pinned version are taken from the aggregate itself. Useful
   * for replay / "I already read it" paths (e.g. from `getAggregateAndEvents`, a
   * projection, or a simulation). This is the **least common** factory and
   * deliberately has no `EventStore` instance method: reserve it for non-command
   * flows — in a command, read the aggregate inside the command (via
   * {@link AggregateHandle.open} / {@link AggregateHandle.openExisting}) so each
   * optimistic-concurrency retry re-reads fresh state.
   */
  static from<ES extends EventStore>(
    store: ES,
    aggregate: EventStoreAggregate<ES>,
  ): AggregateHandle<ES> {
    return new AggregateHandle({
      store,
      commitGroup: pushEventGroup,
      aggregateId: aggregate.aggregateId,
      aggregate,
    });
  }

  /** @internal */
  fill(
    input: AggregateHandleEventInput<ES>,
    version: number,
  ): Parameters<ES['groupEvent']>[0] {
    const { aggregateId, version: versionOverride } = input as {
      aggregateId?: string;
      version?: number;
    };
    if (aggregateId !== undefined || versionOverride !== undefined) {
      throw new Error(
        'AggregateHandle: `aggregateId` / `version` cannot be set on handle pushes — the handle owns them. Use the low-level `eventStore.pushEvent(...)` if you need explicit control.',
      );
    }

    return {
      ...(input as object),
      aggregateId: this.aggregateId,
      version,
    } as Parameters<ES['groupEvent']>[0];
  }

  /**
   * Fold a list of inputs into grouped events, walking a *local* aggregate copy
   * forward between steps. Pure with respect to the handle.
   */
  chain(
    inputs: readonly AggregateHandleEventInputOrFn<ES>[],
    options?: { validate?: ValidateEventDetail },
  ): { grouped: GroupedEvent[]; nextAggregate: EventStoreAggregate<ES> } {
    if (inputs.length === 0) {
      throw new Error(
        'AggregateHandle: cannot push/group an empty list of events. Pass at least one event input.',
      );
    }

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

  /**
   * Build chained grouped events for MULTIPLE events on this aggregate. The
   * result mirrors the input's length (a fixed-size tuple), so it can be spread
   * straight into `EventStore.pushEventGroup`.
   */
  groupEvents<const Inputs extends AggregateHandleEventInputs<ES>>(
    inputs: Inputs,
    options?: { validate?: ValidateEventDetail },
  ): { -readonly [K in keyof Inputs]: ReturnType<ES['groupEvent']> } {
    return this.chain(inputs, options).grouped as unknown as {
      -readonly [K in keyof Inputs]: ReturnType<ES['groupEvent']>;
    };
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

  /**
   * Push MULTIPLE events on this aggregate atomically and commit them. The
   * returned `events` mirrors the input's length (a fixed-size tuple).
   */
  async pushEvents<const Inputs extends AggregateHandleEventInputs<ES>>(
    inputs: Inputs,
    options: { validate?: ValidateEventDetail } = {},
  ): Promise<{
    events: { -readonly [K in keyof Inputs]: EventStoreEventDetails<ES> };
    nextAggregate: EventStoreAggregate<ES>;
  }> {
    const { grouped } = this.chain(inputs, options);

    const { eventGroup } = await this.commitGroup(...(grouped as never[]));
    const events = eventGroup.map(({ event }) => event);

    // Rebuild `nextAggregate` from the *committed* events (which carry the
    // adapter-assigned `timestamp` etc.) rather than the pre-commit local fold,
    // so it matches what was actually persisted.
    const nextAggregate = this.store.buildAggregate(
      events as never,
      this.aggregate as never,
    ) as EventStoreAggregate<ES>;

    return {
      events: events as unknown as {
        -readonly [K in keyof Inputs]: EventStoreEventDetails<ES>;
      },
      nextAggregate,
    };
  }
}
