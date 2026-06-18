/* eslint-disable max-lines */
import type { EventDetail } from '~/event/eventDetail';

import type { EventStore } from './eventStore';
import type { EventStoreAggregate, EventStoreEventDetails } from './generics';
import { pushEventGroup } from './pushEventGroup';
import type { GetAggregateOptions, ValidateEventDetail } from './types';

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
 * without mutating the handle). The aggregate is always defined: this form is
 * only valid from the second input onward (see {@link AggregateHandleEventInputs}),
 * by which point at least one event has been folded.
 */
export type AggregateHandleEventInputOrFn<ES extends EventStore> =
  | AggregateHandleEventInput<ES>
  | ((aggregate: EventStoreAggregate<ES>) => AggregateHandleEventInput<ES>);

/**
 * A **non-empty** list of inputs for the chained handle methods
 * ({@link AggregateHandle.pushEvents} / {@link AggregateHandle.groupEvents}).
 * Typed as a non-empty tuple so an empty call is a compile error; combined with
 * a `const` type parameter at the call site, this lets the result mirror the
 * input's length (a fixed-size tuple the caller can spread straight into
 * {@link EventStore.pushEventGroup}).
 *
 * The first input must be a plain input (not a function): the first event has
 * no predecessor in the call to depend on, and pinning it lets every later
 * function input receive a *defined* aggregate.
 */
export type AggregateHandleEventInputs<ES extends EventStore> = readonly [
  AggregateHandleEventInput<ES>,
  ...AggregateHandleEventInputOrFn<ES>[],
];

/**
 * Reads an aggregate and wraps it in an {@link AggregateHandle} — the type of
 * {@link EventStore.openAggregate} / `openExistingAggregate`. Generic over the
 * store so the handle preserves the concrete store type (the polymorphic `this`
 * at the call site), e.g. a `ConnectedEventStore` keeps publishing through it.
 */
export type AggregateOpener<ES extends EventStore> = (
  aggregateId: string,
  options?: GetAggregateOptions,
) => Promise<AggregateHandle<ES>>;

/**
 * Like {@link AggregateOpener}, but the returned handle is statically known to
 * hold a defined `aggregate` (it throws otherwise) — the type of
 * {@link EventStore.openExistingAggregate}. Mirrors how `getExistingAggregate`
 * tightens `getAggregate`.
 */
export type ExistingAggregateOpener<ES extends EventStore> = (
  aggregateId: string,
  options?: GetAggregateOptions,
) => Promise<AggregateHandle<ES, true>>;

/**
 * Synchronously opens a handle for an aggregate that does not exist yet (no
 * read) — the type of {@link EventStore.openNewAggregate}. See
 * {@link AggregateHandle.forNew}.
 */
export type NewAggregateOpener<ES extends EventStore> = (
  aggregateId: string,
) => AggregateHandle<ES>;

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
export class AggregateHandle<
  ES extends EventStore = EventStore,
  // When `true`, `aggregate` is statically known to be defined — the same
  // `SHOULD_EXIST` flag `AggregateGetter` uses for `getExistingAggregate`. Set
  // by `openExisting` / `from`; left `false` (maybe-undefined) by `open` / `forNew`.
  SHOULD_EXIST extends boolean = false,
> {
  readonly aggregateId: string;
  readonly aggregate: SHOULD_EXIST extends true
    ? EventStoreAggregate<ES>
    : EventStoreAggregate<ES> | undefined;
  readonly nextVersion: number;

  // `store` is deliberately public (like `GroupedEvent`'s fields): TS
  // `private`/`#` members are nominal, which would make two copies of
  // `@hamstore/core` produce mutually-incompatible `AggregateHandle` (and thus
  // `EventStore`) types. Treat it as internal.
  /** @internal */
  readonly store: ES;

  constructor({
    store,
    aggregateId,
    aggregate,
  }: {
    store: ES;
    aggregateId: string;
    aggregate: AggregateHandle<ES, SHOULD_EXIST>['aggregate'];
  }) {
    this.store = store;
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
      aggregateId,
      aggregate,
    });
  }

  /**
   * Like {@link AggregateHandle.open}, but throws `AggregateNotFoundError` if
   * the aggregate does not exist. Backs `openExistingAggregate`.
   */
  static async openExisting<ES extends EventStore>(
    store: ES,
    aggregateId: string,
    options?: GetAggregateOptions,
  ): Promise<AggregateHandle<ES, true>> {
    const { aggregate } = await store.getExistingAggregate(aggregateId, options);

    return new AggregateHandle({
      store,
      aggregateId,
      aggregate,
    });
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
      aggregateId,
      aggregate: undefined,
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
  ): AggregateHandle<ES, true> {
    return new AggregateHandle({
      store,
      aggregateId: aggregate.aggregateId,
      aggregate,
    });
  }

  /** @internal */
  fill(
    input: AggregateHandleEventInput<ES>,
    version: number,
    timestamp?: string,
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
      // A `timestamp` on `input` still wins — it spreads after this.
      ...(timestamp !== undefined ? { timestamp } : {}),
      // `input` is a generic distributive conditional type, which TS won't
      // confirm is spreadable (TS2698) even though it always resolves to one.
      ...(input as object),
      aggregateId: this.aggregateId,
      version,
    } as Parameters<ES['groupEvent']>[0];
  }

  /**
   * Fold a list of inputs into grouped events, walking a *local* aggregate copy
   * forward between steps. Pure with respect to the handle.
   *
   * @internal
   */
  chain<const Inputs extends AggregateHandleEventInputs<ES>>(
    inputs: Inputs,
    options?: { validate?: ValidateEventDetail },
  ): { -readonly [K in keyof Inputs]: ReturnType<ES['groupEvent']> } {
    if (inputs.length === 0) {
      throw new Error(
        'AggregateHandle: cannot push/group an empty list of events. Pass at least one event input.',
      );
    }

    // One shared timestamp for the whole group (the events commit atomically).
    // Stamping it on the events — rather than letting the adapter assign one —
    // makes the value folded into each `prevAggregate` exactly what gets
    // persisted and published, so timestamp-reading reducers see no drift.
    const timestamp = new Date().toISOString();

    const { events } = inputs.reduce(
      (acc, input) => {
        const { aggregate: prevAggregate } = acc;
        // A function input runs only after the first (always-plain) input has
        // been folded, so `prevAggregate` is a real built aggregate by then;
        // the `!` asserts that definedness for the function parameter.
        const resolved =
          typeof input === 'function' ? input(prevAggregate!) : input;
        const event = this.fill(resolved, acc.version, timestamp);
        acc.events.push(
          this.store.groupEvent(event, {
            ...options,
            prevAggregate,
          }) as ReturnType<ES['groupEvent']>,
        );
        acc.version += 1;
        acc.aggregate = this.store.buildAggregate(
          [event],
          prevAggregate,
        ) as EventStoreAggregate<ES>;

        return acc;
      },
      {
        events: [] as ReturnType<ES['groupEvent']>[],
        version: this.nextVersion,
        aggregate: this.aggregate as EventStoreAggregate<ES> | undefined,
      },
    );

    return events as {
      -readonly [K in keyof Inputs]: ReturnType<ES['groupEvent']>;
    };
  }

  /** Build ONE grouped event for a cross-aggregate `EventStore.pushEventGroup`. */
  groupEvent(
    input: AggregateHandleEventInput<ES>,
    options?: { validate?: ValidateEventDetail },
  ): ReturnType<ES['groupEvent']> {
    return this.store.groupEvent(this.fill(input, this.nextVersion), {
      ...options,
      prevAggregate: this.aggregate,
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
    return this.chain(inputs, options);
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
   * Push MULTIPLE events on this aggregate atomically and commit them. Returns:
   * - `events` — the committed event details, mirroring the input's length;
   * - `eventGroup` — the raw {@link EventStore.pushEventGroup} result (each
   *   entry pairs the committed `event` with its `nextAggregate`);
   * - `nextAggregate` — the aggregate rebuilt from the committed events, so it
   *   matches what a later `getAggregate` read returns.
   */
  async pushEvents<const Inputs extends AggregateHandleEventInputs<ES>>(
    inputs: Inputs,
    options: { validate?: ValidateEventDetail } = {},
  ): Promise<{
    events: { -readonly [K in keyof Inputs]: EventStoreEventDetails<ES> };
    eventGroup: {
      -readonly [K in keyof Inputs]: {
        event: EventStoreEventDetails<ES>;
        nextAggregate?: EventStoreAggregate<ES>;
      };
    };
    nextAggregate: EventStoreAggregate<ES>;
  }> {
    const grouped = this.chain(inputs, options);

    const { eventGroup } = await pushEventGroup({}, ...grouped);
    const events = eventGroup.map(({ event }) => event);

    // Rebuild `nextAggregate` from the *committed* events (which carry the
    // adapter-assigned `timestamp` etc.) rather than the pre-commit local fold,
    // so it matches what was actually persisted.
    const nextAggregate = this.store.buildAggregate(
      events,
      this.aggregate,
    ) as EventStoreAggregate<ES>;

    return {
      events: events as {
        -readonly [K in keyof Inputs]: EventStoreEventDetails<ES>;
      },
      eventGroup: eventGroup as {
        -readonly [K in keyof Inputs]: {
          event: EventStoreEventDetails<ES>;
          nextAggregate?: EventStoreAggregate<ES>;
        };
      },
      nextAggregate,
    };
  }
}
