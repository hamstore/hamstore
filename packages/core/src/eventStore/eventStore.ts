/* eslint-disable max-lines */
import type { Aggregate } from '~/aggregate';
import type { EventDetail } from '~/event/eventDetail';
import type { EventType, EventTypeDetails } from '~/event/eventType';
import type { GroupedEvent } from '~/event/groupedEvent';
import type {
  EventsQueryOptions,
  EventStorageAdapter,
} from '~/eventStorageAdapter';
import {
  presentSeedSnapshot,
  absentSeedSnapshot,
  UndefinedSnapshotStorageAdapterError,
} from '~/snapshot';
import type {
  SeedSnapshot,
  Snapshot,
  SnapshotConfig,
  SnapshotStorageAdapter,
} from '~/snapshot';
import type { $Contravariant } from '~/utils';

import { AggregateHandle } from './aggregateHandle';
import {
  resolveSnapshotSaveContext,
  runSnapshotSave,
} from './snapshotSave';
import type {
  AggregateOpener,
  ExistingAggregateOpener,
  NewAggregateOpener,
} from './aggregateHandle';
import { AggregateNotFoundError } from './errors/aggregateNotFound';
import { UndefinedEventStorageAdapterError } from './errors/undefinedEventStorageAdapter';
import { pushEventGroup } from './pushEventGroup';
import { resolveEventValidation } from './resolveEventValidation';
import type {
  AggregateIdsLister,
  EventPusher,
  OnEventPushed,
  EventGroupPusher,
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
  /**
   * Commit a group of events across one or more aggregates atomically — either
   * all of them are pushed, or none are (see
   * [Event Groups](https://hamstore.github.io/hamstore/docs/event-sourcing/joining-data)).
   */
  // Re-assignment of the `this`-free {@link pushEventGroup}, so the
  // `AggregateHandle` factories can share it without a runtime import cycle.
  static pushEventGroup: EventGroupPusher = pushEventGroup;

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
   * Snapshot policy / pruning / reducer-version config. When set together with
   * a `snapshotStorageAdapter`, writes opportunistically save snapshots (see
   * {@link EventStore._dispatchSnapshotSave}); reads transparently seed from
   * the latest applicable snapshot.
   */
  snapshotConfig?: SnapshotConfig<$AGGREGATE>;

  /**
   * Read an aggregate and wrap it in an immutable, version-pinned
   * {@link AggregateHandle} that auto-fills `aggregateId`/`version`/
   * `prevAggregate` on every push. Open a fresh handle per command attempt
   * (a handle held across an optimistic-concurrency retry is stale).
   *
   * For the unusual case where you already hold an aggregate (replay,
   * projection, simulation) and want to skip the read, use the static
   * {@link AggregateHandle.from} — it is deliberately not an instance method, as
   * a pre-loaded aggregate is stale on retry and so does not belong in commands.
   */
  openAggregate: AggregateOpener<this>;

  /** Like {@link openAggregate}, but throws if the aggregate does not exist. */
  openExistingAggregate: ExistingAggregateOpener<this>;

  /**
   * Open a handle for an aggregate that does not exist yet (first event at
   * version 1). Does not read storage — use when the aggregate is known to be
   * new (first-event / bulk-import paths).
   */
  openNewAggregate: NewAggregateOpener<this>;

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

    // Derive the next aggregate only when it is already in hand: the caller
    // supplied `prevAggregate`, or this is the very first event (version 1).
    // Otherwise return `undefined` — we never rebuild history just to snapshot.
    const deriveNextAggregate = (
      prevAggregate: Aggregate | undefined,
      event: { version: number },
    ): AGGREGATE | undefined =>
      prevAggregate !== undefined || event.version === 1
        ? (this.reducer(
            prevAggregate,
            event as unknown as $EVENT_DETAILS,
          ) as AGGREGATE)
        : undefined;

    this.pushEvent = async (
      eventDetail,
      { prevAggregate, seedSnapshot, force = false, validate = 'auto' } = {},
    ) => {
      await resolveEventValidation(
        this.eventTypes,
        eventDetail as EventDetail,
        validate,
      );

      const { event } = (await this.getEventStorageAdapter().pushEvent(
        eventDetail,
        {
          eventStoreId: this.eventStoreId,
          force,
        },
      )) as { event: $EVENT_DETAILS };

      const nextAggregate = deriveNextAggregate(prevAggregate, event);

      const response = {
        event: event as unknown as EVENT_DETAILS,
        ...(nextAggregate !== undefined ? { nextAggregate } : {}),
      };

      if (this.onEventPushed !== undefined) {
        await this.onEventPushed(
          response as unknown as {
            event: $EVENT_DETAILS;
            nextAggregate?: $AGGREGATE;
          },
        );
      }

      // Opportunistic snapshot save: only when the aggregate is already in
      // hand (caller passed `prevAggregate`, or this was version 1). Never
      // rebuilds history to snapshot. `seedSnapshot` (when supplied) lets the
      // policy evaluate spacing relative to the snapshot that seeded the read.
      if (nextAggregate !== undefined) {
        await this._dispatchSnapshotSave({
          aggregate: nextAggregate as unknown as $AGGREGATE,
          seedSnapshot: seedSnapshot as
            | SeedSnapshot<$AGGREGATE>
            | undefined,
          newEventCount: 1,
        });
      }

      return response;
    };

    this.groupEvent = (
      eventDetail,
      { prevAggregate, seedSnapshot, validate } = {},
    ) => {
      const groupedEvent = this.getEventStorageAdapter().groupEvent(
        eventDetail,
      ) as GroupedEvent<EVENT_DETAILS, AGGREGATE>;

      if (validate !== undefined) {
        groupedEvent.validate = validate;
      }

      groupedEvent.eventStore = this;
      groupedEvent.context = { eventStoreId: this.eventStoreId };

      if (prevAggregate !== undefined) {
        groupedEvent.prevAggregate = prevAggregate as unknown as AGGREGATE;
      }

      if (seedSnapshot !== undefined) {
        groupedEvent.seedSnapshot = seedSnapshot as SeedSnapshot<AGGREGATE>;
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

      const { snapshot } = await this.snapshotStorageAdapter.getLatestSnapshot(
        aggregateId,
        { eventStoreId: this.eventStoreId },
        maxVersion !== undefined ? { aggregateMaxVersion: maxVersion } : {},
      );

      if (snapshot === undefined) {
        return undefined;
      }
      if (maxVersion !== undefined && snapshot.aggregate.version > maxVersion) {
        return undefined;
      }

      return snapshot;
    };

    /**
     * Look up the latest applicable snapshot to seed an aggregate read.
     * Returns `undefined` if no snapshot is available, the snapshot is from a
     * different reducer version (and migration didn't yield one for the
     * current reducer), or the storage adapter errors. Errors during snapshot
     * lookup are logged and treated as "no snapshot" so reads stay resilient.
     *
     * This is a read-only seed lookup — it NEVER writes. Snapshot *saving*
     * happens exclusively on the write path (`pushEvent` / `pushEventGroup`).
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

    const buildEventsQueryOptions = (
      maxVersion: number | undefined,
      fetchMin: number,
    ): EventsQueryOptions | undefined => {
      const options: EventsQueryOptions = {};
      if (maxVersion !== undefined) {
        options.maxVersion = maxVersion;
      }
      if (fetchMin > 1) {
        options.minVersion = fetchMin;
      }

      return Object.keys(options).length > 0 ? options : undefined;
    };

    /**
     * Internal: rebuilds an aggregate, transparently seeding from snapshot
     * storage if configured. Returns the aggregate, the events read (so the
     * caller can choose to expose them via `getAggregateAndEvents`) and the
     * raw seed snapshot used (so the caller can surface it as a
     * {@link SeedSnapshot} or back-fill earlier events).
     *
     * `eventsMinVersion` lets the caller widen the events fetch beyond what
     * the aggregate strictly needs:
     *   - omitted: fetch only what's required to build the aggregate (events
     *     with `version > snapshot.version`, or all events when no snapshot
     *     applies). The returned `events` array is exactly that minimal set.
     *   - set to `N`: fetch from `min(aggregateMin, N)` so the returned
     *     `events` array can include everything from `N` onward. The
     *     aggregate is still built by replaying only events with
     *     `version > snapshot.version` on top of the seed.
     */
    const rebuildAggregate = async (
      aggregateId: string,
      {
        maxVersion,
        eventsMinVersion,
      }: {
        maxVersion?: number;
        eventsMinVersion?: number;
      } = {},
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

      const { events: fetched } = await this.getEvents(
        aggregateId,
        buildEventsQueryOptions(maxVersion, fetchMin),
      );

      const aggregateEvents =
        seedSnapshot === undefined
          ? fetched
          : fetched.filter(e => e.version > seedSnapshot.aggregate.version);

      const aggregate = applyEventsOnSeed(aggregateEvents, seedSnapshot);
      const lastEvent = fetched[fetched.length - 1];

      return { aggregate, events: fetched, lastEvent, seedSnapshot };
    };

    const toSeedSnapshot = (
      seedSnapshot: Snapshot<AGGREGATE> | undefined,
    ): SeedSnapshot<AGGREGATE> =>
      seedSnapshot !== undefined
        ? presentSeedSnapshot(seedSnapshot)
        : (absentSeedSnapshot as SeedSnapshot<AGGREGATE>);

    this.getAggregate = async (aggregateId, { maxVersion } = {}) => {
      const { aggregate, seedSnapshot } = await rebuildAggregate(aggregateId, {
        maxVersion,
      });

      return { aggregate, seedSnapshot: toSeedSnapshot(seedSnapshot) };
    };

    this.getExistingAggregate = async (aggregateId, options) => {
      const { aggregate, seedSnapshot } = await this.getAggregate(
        aggregateId,
        options,
      );

      if (aggregate === undefined) {
        throw new AggregateNotFoundError({
          aggregateId,
          eventStoreId: this.eventStoreId,
        });
      }

      return { aggregate, seedSnapshot };
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
     * applicable snapshot is used regardless of its version; the fetch range
     * is `min(snapshot.version + 1, fromVersion) .. maxVersion` so a single
     * fetch covers both the events needed to bring the aggregate up to date
     * and the events the caller wants returned.
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
     * that use no event-filtering option.
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
        return getAggregateAndEventsLastN(aggregateId, options.lastN, maxVersion);
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

    this.getAggregateAndEvents = getAggregateAndEventsImpl as AggregateAndEventsGetter<
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

    this.openAggregate = (aggregateId, options) =>
      AggregateHandle.open(this, aggregateId, options);

    this.openExistingAggregate = (aggregateId, options) =>
      AggregateHandle.openExisting(this, aggregateId, options);

    this.openNewAggregate = aggregateId =>
      AggregateHandle.forNew(this, aggregateId);
  }

  /**
   * Opportunistically save (and prune) a snapshot for a just-committed write.
   *
   * Called from `pushEvent` and the static `pushEventGroup` once the next
   * aggregate is in hand. No-op unless both a `snapshotStorageAdapter` and a
   * `snapshotConfig` are present. By default the work is **awaited** as part
   * of the push, so a snapshot can never be lost on platforms that freeze the
   * event loop after the response flushes (e.g. AWS Lambda). When the consumer
   * provides `snapshotConfig.scheduleBackgroundWork`, ownership of the work
   * transfers to that hook and it is not awaited here.
   *
   * Public (no `private` keyword) so `pushEventGroup` can reach it across
   * instances and `ConnectedEventStore` can delegate to it; TS `private`/`#`
   * members are nominal and would break cross-package structural typing.
   * Treat it as internal.
   */
  async _dispatchSnapshotSave(args: {
    aggregate: $AGGREGATE;
    seedSnapshot: SeedSnapshot<$AGGREGATE> | undefined;
    newEventCount: number;
  }): Promise<void> {
    // The CUSTOM policy predicate is contravariant in the aggregate; widening
    // `$AGGREGATE` to `Aggregate` here is sound because it is only ever
    // invoked with real aggregates produced by this store.
    const ctx = resolveSnapshotSaveContext({
      eventStoreId: this.eventStoreId,
      snapshotStorageAdapter: this.snapshotStorageAdapter,
      snapshotConfig: this.snapshotConfig as SnapshotConfig | undefined,
    });
    if (ctx === undefined) {
      return;
    }

    const work = (): Promise<void> => runSnapshotSave(ctx, args);

    const schedule = this.snapshotConfig?.scheduleBackgroundWork;
    if (schedule !== undefined) {
      schedule(work);

      return;
    }

    await work();
  }
}
