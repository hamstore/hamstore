/* eslint-disable max-lines */
import type { Aggregate } from '~/aggregate';
import type { EventDetail } from '~/event/eventDetail';
import type { EventType, EventTypeDetails } from '~/event/eventType';
import { GroupedEvent } from '~/event/groupedEvent';
import type {
  EventsQueryOptions,
  EventStorageAdapter,
} from '~/eventStorageAdapter';
import {
  compilePruningPolicy,
  compileSnapshotPolicy,
  compileWritePathSnapshotPolicy,
  UndefinedSnapshotStorageAdapterError,
} from '~/snapshot';
import type {
  ShouldKeepSnapshot,
  ShouldSaveSnapshot,
  Snapshot,
  SnapshotConfig,
  SnapshotStorageAdapter,
} from '~/snapshot';
import type { $Contravariant } from '~/utils';

import { AggregateNotFoundError } from './errors/aggregateNotFound';
import { UndefinedEventStorageAdapterError } from './errors/undefinedEventStorageAdapter';
import type {
  AggregateIdsLister,
  EventPusher,
  OnEventPushed,
  EventGroupPusher,
  EventGroupPusherResponse,
  EventsGetter,
  EventGrouper,
  SideEffectsSimulator,
  AggregateGetter,
  AggregateAndEventsGetter,
  GetAggregateAndEventsOptions,
  AggregateSimulator,
  Reducer,
} from './types';

export class EventStore<
  EVENT_STORE_ID extends string = string,
  EVENT_TYPES extends EventType[] = EventType[],
  EVENT_DETAILS extends EventDetail = EventTypeDetails<EVENT_TYPES>,
  // cf https://devblogs.microsoft.com/typescript/announcing-typescript-4-7-rc/#optional-variance-annotations-for-type-parameters
  // EventStore is contravariant on its fns args: We have to type them as "any" so that EventStore implementations still extends the EventStore type
  $EVENT_DETAILS extends EventDetail = $Contravariant<
    EVENT_DETAILS,
    EventDetail
  >,
  REDUCER extends Reducer<Aggregate, $EVENT_DETAILS> = Reducer<
    Aggregate,
    $EVENT_DETAILS
  >,
  AGGREGATE extends Aggregate = ReturnType<REDUCER>,
  $AGGREGATE extends Aggregate = $Contravariant<AGGREGATE, Aggregate>,
> {
  static pushEventGroup: EventGroupPusher = async <
    GROUPED_EVENTS extends [GroupedEvent, ...GroupedEvent[]],
    OPTIONS_OR_GROUPED_EVENTS_HEAD extends GroupedEvent | { force?: boolean } =
      GroupedEvent,
  >(
    optionsOrGroupedEvent: OPTIONS_OR_GROUPED_EVENTS_HEAD,
    ..._groupedEvents: GROUPED_EVENTS
  ) => {
    const groupedEvents = (
      optionsOrGroupedEvent instanceof GroupedEvent
        ? [optionsOrGroupedEvent, ..._groupedEvents]
        : _groupedEvents
    ) as [GroupedEvent, ...GroupedEvent[]];

    const options = (
      optionsOrGroupedEvent instanceof GroupedEvent ? {} : optionsOrGroupedEvent
    ) as { force?: boolean };

    const [groupedEventsHead] = groupedEvents;

    const { eventGroup: eventGroupWithoutAggregates } =
      await groupedEventsHead.eventStorageAdapter.pushEventGroup(
        options,
        ...groupedEvents,
      );

    const eventGroupWithAggregates = eventGroupWithoutAggregates.map(
      ({ event }, eventIndex) => {
        const groupedEvent = groupedEvents[eventIndex];

        let nextAggregate: Aggregate | undefined = undefined;
        const prevAggregate = groupedEvent?.prevAggregate;

        if (
          (prevAggregate !== undefined || event.version === 1) &&
          groupedEvent?.eventStore !== undefined
        ) {
          nextAggregate = groupedEvent.eventStore.reducer(prevAggregate, event);
        }

        return {
          event,
          ...(nextAggregate !== undefined ? { nextAggregate } : {}),
        };
      },
    );

    for (let eventIndex = 0; eventIndex < groupedEvents.length; eventIndex++) {
      const eventStore = groupedEvents[eventIndex]?.eventStore;
      const pushed = eventGroupWithAggregates[eventIndex];
      const nextAggregate = pushed?.nextAggregate;
      if (eventStore !== undefined && nextAggregate !== undefined) {
        eventStore._tryPersistSnapshot({
          aggregate: nextAggregate,
          previousSnapshot: undefined,
          newEventCount: 1,
          source: 'write',
        });
      }
    }

    await Promise.all(
      groupedEvents.map((groupedEvent, eventIndex) => {
        const eventStore = groupedEvent.eventStore;
        const pushEventResponse = eventGroupWithAggregates[eventIndex];

        return pushEventResponse !== undefined &&
          eventStore?.onEventPushed !== undefined
          ? eventStore.onEventPushed(pushEventResponse)
          : null;
      }),
    );

    return { eventGroup: eventGroupWithAggregates } as {
      eventGroup: OPTIONS_OR_GROUPED_EVENTS_HEAD extends GroupedEvent
        ? EventGroupPusherResponse<
            [OPTIONS_OR_GROUPED_EVENTS_HEAD, ...GROUPED_EVENTS]
          >
        : EventGroupPusherResponse<GROUPED_EVENTS>;
    };
  };

  _types?: {
    details: EVENT_DETAILS;
    aggregate: AGGREGATE;
  };
  eventStoreId: EVENT_STORE_ID;
  eventTypes: EVENT_TYPES;
  reducer: REDUCER;
  simulateSideEffect: SideEffectsSimulator<EVENT_DETAILS, $EVENT_DETAILS>;

  getEvents: EventsGetter<EVENT_DETAILS>;
  pushEvent: EventPusher<EVENT_DETAILS, $EVENT_DETAILS, AGGREGATE, $AGGREGATE>;
  onEventPushed?: OnEventPushed<$EVENT_DETAILS, $AGGREGATE>;
  groupEvent: EventGrouper<
    EVENT_DETAILS,
    $EVENT_DETAILS,
    AGGREGATE,
    $AGGREGATE
  >;
  listAggregateIds: AggregateIdsLister;

  buildAggregate: (
    events: $EVENT_DETAILS[],
    aggregate?: $AGGREGATE,
  ) => AGGREGATE | undefined;

  getAggregate: AggregateGetter<AGGREGATE>;
  getExistingAggregate: AggregateGetter<AGGREGATE, true>;
  getAggregateAndEvents: AggregateAndEventsGetter<EVENT_DETAILS, AGGREGATE>;
  getExistingAggregateAndEvents: AggregateAndEventsGetter<
    EVENT_DETAILS,
    AGGREGATE,
    true
  >;
  simulateAggregate: AggregateSimulator<$EVENT_DETAILS, AGGREGATE>;
  eventStorageAdapter?: EventStorageAdapter;
  getEventStorageAdapter: () => EventStorageAdapter;

  snapshotStorageAdapter?: SnapshotStorageAdapter;
  getSnapshotStorageAdapter: () => SnapshotStorageAdapter;

  /**
   * Backing field for the `snapshotConfig` getter/setter. Underscored as a
   * convention (no `private` keyword to avoid TS structural-compatibility
   * issues across duplicated package copies). Should be considered internal.
   */
  _snapshotConfig?: SnapshotConfig<$AGGREGATE>;
  /**
   * Cached read-path predicate: `compileSnapshotPolicy(policy)`. Used inside
   * `getAggregate` / `getAggregateAndEvents` where the previous snapshot is
   * in scope. Invalidated on config writes.
   */
  _compiledShouldSaveSnapshot?: ShouldSaveSnapshot<$AGGREGATE>;
  /**
   * Cached write-path predicate:
   * `compileWritePathSnapshotPolicy(policy)`. Used after a successful
   * `pushEvent` / `pushEventGroup` where there is no previous snapshot in
   * scope. Time-based strategies degrade to `() => false`. Invalidated on
   * config writes.
   */
  _compiledShouldSaveSnapshotOnWrite?: ShouldSaveSnapshot<$AGGREGATE>;
  /** Cached `compilePruningPolicy(pruning)`; invalidated on config writes. */
  _compiledShouldKeepSnapshot?: ShouldKeepSnapshot;

  get snapshotConfig(): SnapshotConfig<$AGGREGATE> | undefined {
    return this._snapshotConfig;
  }

  set snapshotConfig(config: SnapshotConfig<$AGGREGATE> | undefined) {
    this._snapshotConfig = config;
    this._compiledShouldSaveSnapshot =
      config === undefined
        ? undefined
        : compileSnapshotPolicy(config.policy);
    this._compiledShouldSaveSnapshotOnWrite =
      config === undefined
        ? undefined
        : compileWritePathSnapshotPolicy(config.policy);
    const pruning = config?.pruning;
    this._compiledShouldKeepSnapshot =
      pruning === undefined || pruning.strategy === 'NONE'
        ? undefined
        : compilePruningPolicy(pruning);
  }

  constructor({
    eventStoreId,
    eventTypes,
    reducer,
    simulateSideEffect = (indexedEvents, event) => ({
      ...indexedEvents,
      [event.version]: event,
    }),
    onEventPushed,
    eventStorageAdapter,
    snapshotStorageAdapter,
    snapshotConfig,
  }: {
    eventStoreId: EVENT_STORE_ID;
    eventTypes: EVENT_TYPES;
    reducer: REDUCER;
    simulateSideEffect?: SideEffectsSimulator<EVENT_DETAILS, $EVENT_DETAILS>;
    onEventPushed?: OnEventPushed<$EVENT_DETAILS, $AGGREGATE>;
    eventStorageAdapter?: EventStorageAdapter;
    snapshotStorageAdapter?: SnapshotStorageAdapter;
    snapshotConfig?: SnapshotConfig<$AGGREGATE>;
  }) {
    this.eventStoreId = eventStoreId;
    this.eventTypes = eventTypes;
    this.reducer = reducer;
    this.simulateSideEffect = simulateSideEffect;
    this.onEventPushed = onEventPushed;
    this.eventStorageAdapter = eventStorageAdapter;
    this.snapshotStorageAdapter = snapshotStorageAdapter;
    this.snapshotConfig = snapshotConfig;

    this.getEventStorageAdapter = () => {
      if (this.eventStorageAdapter === undefined) {
        throw new UndefinedEventStorageAdapterError({
          eventStoreId: this.eventStoreId,
        });
      }

      return this.eventStorageAdapter;
    };

    this.getSnapshotStorageAdapter = () => {
      if (this.snapshotStorageAdapter === undefined) {
        throw new UndefinedSnapshotStorageAdapterError({
          eventStoreId: this.eventStoreId,
        });
      }

      return this.snapshotStorageAdapter;
    };

    this.getEvents = (aggregateId, queryOptions) =>
      this.getEventStorageAdapter().getEvents(
        aggregateId,
        { eventStoreId: this.eventStoreId },
        queryOptions,
        /**
         * @debt feature "For the moment we just cast, we could implement validation + type guards at EventType level"
         */
      ) as Promise<{ events: EVENT_DETAILS[] }>;

    this.pushEvent = async (
      eventDetail,
      { prevAggregate, force = false } = {},
    ) => {
      const { event } = (await this.getEventStorageAdapter().pushEvent(
        eventDetail,
        {
          eventStoreId: this.eventStoreId,
          force,
        },
      )) as { event: $EVENT_DETAILS };

      let nextAggregate: AGGREGATE | undefined = undefined;
      if (prevAggregate !== undefined || event.version === 1) {
        nextAggregate = this.reducer(prevAggregate, event) as AGGREGATE;
      }

      const response = {
        event: event as unknown as EVENT_DETAILS,
        ...(nextAggregate !== undefined ? { nextAggregate } : {}),
      };

      if (nextAggregate !== undefined) {
        this._tryPersistSnapshot({
          aggregate: nextAggregate as unknown as $AGGREGATE,
          previousSnapshot: undefined,
          newEventCount: 1,
          source: 'write',
        });
      }

      if (this.onEventPushed !== undefined) {
        await this.onEventPushed(
          response as unknown as {
            event: $EVENT_DETAILS;
            nextAggregate?: $AGGREGATE;
          },
        );
      }

      return response;
    };

    this.groupEvent = (eventDetail, { prevAggregate } = {}) => {
      const groupedEvent = this.getEventStorageAdapter().groupEvent(
        eventDetail,
      ) as GroupedEvent<EVENT_DETAILS, AGGREGATE>;

      groupedEvent.eventStore = this;
      groupedEvent.context = { eventStoreId: this.eventStoreId };

      if (prevAggregate !== undefined) {
        groupedEvent.prevAggregate = prevAggregate as unknown as AGGREGATE;
      }

      return groupedEvent;
    };

    this.listAggregateIds = options =>
      this.getEventStorageAdapter().listAggregateIds(
        { eventStoreId: this.eventStoreId },
        options,
      );

    this.buildAggregate = (eventDetails, aggregate) =>
      eventDetails.reduce(this.reducer, aggregate) as AGGREGATE | undefined;

    /**
     * Apply newly-loaded events on top of a seed snapshot (if any) and return
     * the resulting aggregate. Falls back to the seed when the events stream
     * is empty.
     */
    const applyEventsOnSeed = (
      events: EVENT_DETAILS[],
      seedSnapshot: Snapshot<AGGREGATE> | undefined,
    ): AGGREGATE | undefined => {
      const seedAggregate = seedSnapshot?.aggregate as $AGGREGATE | undefined;

      const aggregate = this.buildAggregate(
        events as unknown as $EVENT_DETAILS[],
        seedAggregate,
      );

      if (aggregate === undefined && seedAggregate !== undefined) {
        return seedAggregate as unknown as AGGREGATE;
      }

      return aggregate;
    };

    /**
     * Read-path snapshot save shim. Delegates to the instance method so the
     * write-path code (in `pushEvent` and the static `pushEventGroup`) can
     * share the same logic.
     */
    const tryPersistSnapshot = (
      aggregate: AGGREGATE | undefined,
      previousSnapshot: Snapshot<AGGREGATE> | undefined,
      newEventCount: number,
    ): void => {
      if (aggregate === undefined) {
        return;
      }

      this._tryPersistSnapshot({
        aggregate: aggregate as unknown as $AGGREGATE,
        previousSnapshot: previousSnapshot as unknown as
          | Snapshot<$AGGREGATE>
          | undefined,
        newEventCount,
        source: 'read',
      });
    };

    /**
     * If the loaded snapshot already matches the current reducer version,
     * return it unchanged. Otherwise call the configured migrator and return
     * the migrated snapshot if it now matches; else `undefined`.
     */
    const reconcileSnapshotReducerVersion = async (
      snapshot: Snapshot<AGGREGATE>,
      config: SnapshotConfig<$AGGREGATE>,
    ): Promise<Snapshot<AGGREGATE> | undefined> => {
      if (snapshot.reducerVersion === config.currentReducerVersion) {
        return snapshot;
      }

      const migrator = config.migrateSnapshotReducerVersion;
      if (migrator === undefined) {
        return undefined;
      }

      const migrated = await migrator(
        snapshot as unknown as Snapshot<$AGGREGATE>,
      );
      if (
        migrated === undefined ||
        migrated.reducerVersion !== config.currentReducerVersion
      ) {
        return undefined;
      }

      return migrated as unknown as Snapshot<AGGREGATE>;
    };

    /**
     * Internal: rebuilds an aggregate, transparently using snapshot storage if
     * configured. Returns both the aggregate and the events read (so the
     * caller can choose to expose them via `getAggregateAndEvents`).
     *
     * `eventsMinVersion` lets the caller widen the events fetch beyond what
     * the aggregate strictly needs:
     *   - omitted: fetch only what's required to build the aggregate
     *     (events with `version > snapshot.version`, or all events when no
     *     snapshot is applicable). The returned `events` array is exactly
     *     that minimal set.
     *   - set to `N`: fetch from `min(aggregateMin, N)` so the returned
     *     `events` array can include everything from `N` onward. The
     *     aggregate is still built by replaying only events with
     *     `version > snapshot.version` on top of the seed; events below the
     *     seed's version are kept in the returned array but not replayed.
     *
     * The snapshot picker is unconstrained except by `maxVersion`. This lets
     * `fromVersion` benefit from a snapshot whose version is *above*
     * `fromVersion`: instead of falling back to "no snapshot" and replaying
     * the whole history, we seed from the high snapshot and only fetch the
     * gap of events the caller asked for.
     */
    const rebuildAggregate = async (
      aggregateId: string,
      {
        maxVersion,
        eventsMinVersion,
      }: {
        maxVersion?: number;
        eventsMinVersion?: number;
      },
    ): Promise<{
      aggregate: AGGREGATE | undefined;
      events: EVENT_DETAILS[];
      lastEvent: EVENT_DETAILS | undefined;
      seedSnapshot: Snapshot<AGGREGATE> | undefined;
    }> => {
      const seedSnapshot = await loadSeedSnapshot(aggregateId, maxVersion);

      const aggregateMin =
        seedSnapshot !== undefined ? seedSnapshot.aggregate.version + 1 : 1;
      const fetchMin =
        eventsMinVersion !== undefined && eventsMinVersion < aggregateMin
          ? eventsMinVersion
          : aggregateMin;

      const eventsOptions: EventsQueryOptions = {};
      if (maxVersion !== undefined) {
        eventsOptions.maxVersion = maxVersion;
      }
      if (fetchMin > 1) {
        eventsOptions.minVersion = fetchMin;
      }

      const { events: fetched } = await this.getEvents(
        aggregateId,
        Object.keys(eventsOptions).length > 0 ? eventsOptions : undefined,
      );

      const aggregateEvents =
        seedSnapshot === undefined
          ? fetched
          : fetched.filter(e => e.version > seedSnapshot.aggregate.version);

      const aggregate = applyEventsOnSeed(aggregateEvents, seedSnapshot);
      const lastEvent = fetched[fetched.length - 1];

      tryPersistSnapshot(aggregate, seedSnapshot, aggregateEvents.length);

      return { aggregate, events: fetched, lastEvent, seedSnapshot };
    };

    /**
     * Fetch the latest snapshot from the storage adapter and re-validate the
     * version bound. The defense-in-depth filter ensures a misbehaving
     * adapter that ignores `aggregateMaxVersion` cannot seed past the bound.
     */
    const fetchSnapshotWithinBound = async (
      aggregateId: string,
      maxVersion: number | undefined,
    ): Promise<Snapshot<Aggregate> | undefined> => {
      if (this.snapshotStorageAdapter === undefined) {
        return undefined;
      }

      const { snapshot } =
        await this.snapshotStorageAdapter.getLatestSnapshot(
          aggregateId,
          { eventStoreId: this.eventStoreId },
          maxVersion !== undefined
            ? { aggregateMaxVersion: maxVersion }
            : {},
        );

      if (snapshot === undefined) {
        return undefined;
      }
      if (
        maxVersion !== undefined &&
        snapshot.aggregate.version > maxVersion
      ) {
        return undefined;
      }
      return snapshot;
    };

    /**
     * Look up the latest applicable snapshot for the given aggregate. Returns
     * `undefined` if no snapshot is available, the snapshot is from a
     * different reducer version (and migration didn't yield one for the
     * current reducer), or the storage adapter errors. Errors during snapshot
     * lookup are logged and treated as "no snapshot" so reads remain
     * resilient.
     */
    const loadSeedSnapshot = async (
      aggregateId: string,
      maxVersion: number | undefined,
    ): Promise<Snapshot<AGGREGATE> | undefined> => {
      if (
        this.snapshotConfig === undefined ||
        this.snapshotStorageAdapter === undefined
      ) {
        return undefined;
      }

      try {
        const rawSnapshot = await fetchSnapshotWithinBound(
          aggregateId,
          maxVersion,
        );
        if (rawSnapshot === undefined) {
          return undefined;
        }

        return await reconcileSnapshotReducerVersion(
          rawSnapshot as Snapshot<AGGREGATE>,
          this.snapshotConfig,
        );
      } catch (error) {
        this.snapshotConfig.onSnapshotError?.({
          phase: 'read',
          aggregateId,
          eventStoreId: this.eventStoreId,
          error,
        });

        return undefined;
      }
    };

    this.getAggregate = async (aggregateId, { maxVersion } = {}) => {
      const { aggregate } = await rebuildAggregate(aggregateId, { maxVersion });

      return { aggregate };
    };

    this.getExistingAggregate = async (aggregateId, options) => {
      const { aggregate } = await this.getAggregate(aggregateId, options);

      if (aggregate === undefined) {
        throw new AggregateNotFoundError({
          aggregateId,
          eventStoreId: this.eventStoreId,
        });
      }

      return { aggregate };
    };

    /**
     * Mode: `lastN`. Use whichever snapshot is latest (subject to maxVersion),
     * then if the tail we read isn't enough to satisfy `lastN`, do a second
     * read for the missing earlier events. Aggregate always reflects full
     * history.
     */
    const getAggregateAndEventsLastN = async (
      aggregateId: string,
      lastN: number,
      maxVersion: number | undefined,
    ): Promise<{
      aggregate: AGGREGATE | undefined;
      events: EVENT_DETAILS[];
      lastEvent: EVENT_DETAILS | undefined;
    }> => {
      if (lastN <= 0) {
        const { aggregate } = await rebuildAggregate(aggregateId, {
          maxVersion,
        });
        return { aggregate, events: [], lastEvent: undefined };
      }

      const rebuilt = await rebuildAggregate(aggregateId, { maxVersion });
      const builtAggregate = rebuilt.aggregate;
      if (builtAggregate === undefined) {
        return { aggregate: undefined, events: [], lastEvent: undefined };
      }

      const desiredFloor = Math.max(1, builtAggregate.version - lastN + 1);
      const tailEvents = rebuilt.events;
      const seed = rebuilt.seedSnapshot;

      // Tail already covers from desiredFloor when no snapshot was used or
      // when the snapshot is at or below the desired floor.
      if (seed === undefined || seed.aggregate.version + 1 <= desiredFloor) {
        const trimmed = tailEvents.filter(e => e.version >= desiredFloor);
        return {
          aggregate: builtAggregate,
          events: trimmed,
          lastEvent: trimmed[trimmed.length - 1],
        };
      }

      // Snapshot covered events past the desired floor — backfill them.
      const { events: earlierEvents } = await this.getEvents(aggregateId, {
        minVersion: desiredFloor,
        maxVersion: seed.aggregate.version,
      });
      const combined = [...earlierEvents, ...tailEvents];
      return {
        aggregate: builtAggregate,
        events: combined,
        lastEvent: combined[combined.length - 1],
      };
    };

    /**
     * Mode: `fromVersion` (default `1`, i.e. full history). The latest
     * applicable snapshot is used regardless of its version; the fetch
     * range is `min(snapshot.version + 1, fromVersion) .. maxVersion` so
     * a single fetch covers both the events needed to bring the aggregate
     * up to date and the events the caller wants returned.
     */
    const getAggregateAndEventsFromVersion = async (
      aggregateId: string,
      fromVersion: number | undefined,
      maxVersion: number | undefined,
    ): Promise<{
      aggregate: AGGREGATE | undefined;
      events: EVENT_DETAILS[];
      lastEvent: EVENT_DETAILS | undefined;
    }> => {
      const effectiveFromVersion = Math.max(fromVersion ?? 1, 1);

      const rebuilt = await rebuildAggregate(aggregateId, {
        maxVersion,
        eventsMinVersion: effectiveFromVersion,
      });

      const events =
        effectiveFromVersion > 1
          ? rebuilt.events.filter(e => e.version >= effectiveFromVersion)
          : rebuilt.events;

      return {
        aggregate: rebuilt.aggregate,
        events,
        lastEvent: events[events.length - 1],
      };
    };

    /**
     * Internal implementation with a uniform "lastEvent may be undefined"
     * return type. The public `getAggregateAndEvents` signature narrows
     * `lastEvent` to `EVENT_DETAIL` for `getExistingAggregateAndEvents` calls
     * that use no event-filtering option (default reads always materialise the
     * full history, so the events array is non-empty for an existing
     * aggregate). The cast on assignment bridges the two views.
     */
    const getAggregateAndEventsImpl = async (
      aggregateId: string,
      options: GetAggregateAndEventsOptions = {},
    ): Promise<{
      aggregate: AGGREGATE | undefined;
      events: EVENT_DETAILS[];
      lastEvent: EVENT_DETAILS | undefined;
    }> => {
      const { maxVersion } = options;

      if ('lastN' in options && options.lastN !== undefined) {
        return getAggregateAndEventsLastN(
          aggregateId,
          options.lastN,
          maxVersion,
        );
      }

      if (
        'fromLatestSnapshot' in options &&
        options.fromLatestSnapshot === true
      ) {
        // Use the latest snapshot for seeding (no version constraint); the
        // events returned are exactly those read on top of it. Falls back to
        // the full history when no snapshot is applicable.
        const rebuilt = await rebuildAggregate(aggregateId, { maxVersion });
        return {
          aggregate: rebuilt.aggregate,
          events: rebuilt.events,
          lastEvent: rebuilt.events[rebuilt.events.length - 1],
        };
      }

      const fromVersion =
        'fromVersion' in options ? options.fromVersion : undefined;
      return getAggregateAndEventsFromVersion(
        aggregateId,
        fromVersion,
        maxVersion,
      );
    };

    this.getAggregateAndEvents =
      getAggregateAndEventsImpl as AggregateAndEventsGetter<
        EVENT_DETAILS,
        AGGREGATE
      >;

    this.getExistingAggregateAndEvents = (async (aggregateId, options) => {
      const { aggregate, events, lastEvent } = await getAggregateAndEventsImpl(
        aggregateId,
        options,
      );

      if (aggregate === undefined) {
        throw new AggregateNotFoundError({
          aggregateId,
          eventStoreId: this.eventStoreId,
        });
      }

      return { aggregate, events, lastEvent };
    }) as AggregateAndEventsGetter<EVENT_DETAILS, AGGREGATE, true>;

    this.simulateAggregate = (events, { simulationDate } = {}) => {
      let eventsWithSideEffects = Object.values(
        events.reduce(
          this.simulateSideEffect as unknown as (
            indexedEvents: Record<string, Omit<$EVENT_DETAILS, 'version'>>,
            event: $EVENT_DETAILS,
          ) => Record<string, Omit<$EVENT_DETAILS, 'version'>>,
          {} as Record<string, $EVENT_DETAILS>,
        ),
      );

      if (simulationDate !== undefined) {
        eventsWithSideEffects = eventsWithSideEffects.filter(
          ({ timestamp }) => timestamp <= simulationDate,
        );
      }

      const sortedEventsWithSideEffects = eventsWithSideEffects
        .sort(({ timestamp: timestampA }, { timestamp: timestampB }) =>
          timestampA < timestampB ? -1 : 1,
        )
        .map((event, index) => ({
          ...event,
          version: index + 1,
        })) as $EVENT_DETAILS[];

      return this.buildAggregate(sortedEventsWithSideEffects);
    };
  }

  /**
   * Internal helper used by both the read path
   * (`getAggregate`/`getAggregateAndEvents`) and the write path
   * (`pushEvent`/`pushEventGroup`) to fire-and-forget a snapshot save.
   *
   * Decides based on `snapshotConfig.saveOn` (default `'write'`) whether
   * `source` is allowed to save, then evaluates the appropriate compiled
   * predicate (read-path uses the previous-snapshot-aware variant;
   * write-path uses the stateless variant).
   *
   * Always returns synchronously; the underlying save/prune work runs in a
   * detached promise so callers never block on it. All errors are caught
   * inside `_persistSnapshotIfPolicy` and routed through `onSnapshotError`.
   *
   * Underscored (no `private` keyword) for the same reason as
   * `_snapshotConfig` — TS structural-compatibility across duplicated
   * package copies. Should be considered internal.
   */
  _tryPersistSnapshot(args: {
    aggregate: $AGGREGATE;
    previousSnapshot: Snapshot<$AGGREGATE> | undefined;
    newEventCount: number;
    source: 'read' | 'write';
  }): void {
    if (!this._snapshotSaveAllowed(args.source)) {
      return;
    }

    void this._persistSnapshotIfPolicy(args);
  }

  /**
   * Returns `true` if the EventStore is configured for snapshot saves and
   * the configured `saveOn` permits saves from the given source.
   */
  _snapshotSaveAllowed(source: 'read' | 'write'): boolean {
    const config = this.snapshotConfig;
    if (config === undefined || this.snapshotStorageAdapter === undefined) {
      return false;
    }
    const saveOn = config.saveOn ?? 'write';

    return source === 'read'
      ? saveOn === 'read' || saveOn === 'both'
      : saveOn === 'write' || saveOn === 'both';
  }

  /**
   * Async portion of `_tryPersistSnapshot`. Evaluates the appropriate
   * compiled predicate, persists the snapshot, then prunes. All errors are
   * caught here and routed through `onSnapshotError`.
   */
  async _persistSnapshotIfPolicy(args: {
    aggregate: $AGGREGATE;
    previousSnapshot: Snapshot<$AGGREGATE> | undefined;
    newEventCount: number;
    source: 'read' | 'write';
  }): Promise<void> {
    try {
      const newSnapshot = this._buildSnapshotIfPolicyFires(args);
      if (newSnapshot === undefined) {
        return;
      }
      const adapter = this.snapshotStorageAdapter;
      if (adapter === undefined) {
        return;
      }

      await adapter.putSnapshot(newSnapshot as unknown as Snapshot, {
        eventStoreId: this.eventStoreId,
      });

      await this._pruneSnapshotsAfterSave({
        aggregateId: args.aggregate.aggregateId,
        newSnapshot,
      });
    } catch (error) {
      this.snapshotConfig?.onSnapshotError?.({
        phase: 'save',
        aggregateId: args.aggregate.aggregateId,
        eventStoreId: this.eventStoreId,
        error,
      });
    }
  }

  /**
   * Returns the new `Snapshot` to persist, or `undefined` if the configured
   * policy does not fire for the given args.
   */
  _buildSnapshotIfPolicyFires(args: {
    aggregate: $AGGREGATE;
    previousSnapshot: Snapshot<$AGGREGATE> | undefined;
    newEventCount: number;
    source: 'read' | 'write';
  }): Snapshot<$AGGREGATE> | undefined {
    const config = this.snapshotConfig;
    if (config === undefined || !this._snapshotPolicyFires(args)) {
      return undefined;
    }

    return {
      aggregate: args.aggregate,
      reducerVersion: config.currentReducerVersion,
      eventStoreId: this.eventStoreId,
      savedAt: new Date().toISOString(),
    };
  }

  _snapshotPolicyFires(args: {
    aggregate: $AGGREGATE;
    previousSnapshot: Snapshot<$AGGREGATE> | undefined;
    newEventCount: number;
    source: 'read' | 'write';
  }): boolean {
    if (args.aggregate.version <= 0) {
      return false;
    }
    if (
      args.source === 'read' &&
      args.previousSnapshot?.aggregate.version === args.aggregate.version
    ) {
      return false;
    }

    const predicate =
      args.source === 'read'
        ? this._compiledShouldSaveSnapshot
        : this._compiledShouldSaveSnapshotOnWrite;
    if (predicate === undefined) {
      return false;
    }

    return predicate({
      aggregate: args.aggregate,
      previousSnapshot: args.previousSnapshot,
      newEventCount: args.newEventCount,
      now: new Date(),
    });
  }

  async _pruneSnapshotsAfterSave(args: {
    aggregateId: string;
    newSnapshot: Snapshot<$AGGREGATE>;
  }): Promise<void> {
    if (
      this.snapshotConfig === undefined ||
      this.snapshotStorageAdapter === undefined
    ) {
      return;
    }
    const shouldKeep = this._compiledShouldKeepSnapshot;
    if (shouldKeep === undefined) {
      return;
    }

    const adapter = this.snapshotStorageAdapter;
    const ctx = { eventStoreId: this.eventStoreId };
    const reducerVersion = this.snapshotConfig.currentReducerVersion;
    const now = new Date(args.newSnapshot.savedAt);

    let pageToken: string | undefined = undefined;
    let position = 0;

    do {
      const { snapshotKeys, nextPageToken } = await adapter.listSnapshots(
        ctx,
        {
          aggregateId: args.aggregateId,
          reducerVersion,
          reverse: true,
          maxVersion: args.newSnapshot.aggregate.version,
          pageToken,
        },
      );

      for (const key of snapshotKeys) {
        const ageMs = now.getTime() - new Date(key.savedAt).getTime();
        if (shouldKeep({ key, position, ageMs, now })) {
          position += 1;
          continue;
        }
        await adapter.deleteSnapshot(key, ctx);
        position += 1;
      }

      pageToken = nextPageToken;
    } while (pageToken !== undefined);
  }
}
