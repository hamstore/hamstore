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
  compileSnapshotPolicy,
  UndefinedSnapshotStorageAdapterError,
} from '~/snapshot';
import type {
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
  EventsAndAggregateGetter,
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
  getEventsAndAggregate: EventsAndAggregateGetter<EVENT_DETAILS, AGGREGATE>;
  getExistingEventsAndAggregate: EventsAndAggregateGetter<
    EVENT_DETAILS,
    AGGREGATE,
    true
  >;
  simulateAggregate: AggregateSimulator<$EVENT_DETAILS, AGGREGATE>;
  eventStorageAdapter?: EventStorageAdapter;
  getEventStorageAdapter: () => EventStorageAdapter;

  snapshotStorageAdapter?: SnapshotStorageAdapter;
  snapshotConfig?: SnapshotConfig<$AGGREGATE>;
  getSnapshotStorageAdapter: () => SnapshotStorageAdapter;

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
     * Fire-and-forget snapshot save when configured. Intentionally void; any
     * error inside `maybePersistSnapshot` is swallowed there.
     */
    const tryPersistSnapshot = (
      aggregate: AGGREGATE | undefined,
      previousSnapshot: Snapshot<AGGREGATE> | undefined,
      newEventCount: number,
    ): void => {
      if (
        aggregate === undefined ||
        this.snapshotConfig === undefined ||
        this.snapshotStorageAdapter === undefined
      ) {
        return;
      }

      void maybePersistSnapshot({
        aggregate,
        previousSnapshot,
        newEventCount,
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
     * configured. Returns both the aggregate and the events read since the
     * snapshot (so the caller can choose to expose them via
     * `getEventsAndAggregate`).
     */
    const rebuildAggregate = async (
      aggregateId: string,
      maxVersion: number | undefined,
    ): Promise<{
      aggregate: AGGREGATE | undefined;
      events: EVENT_DETAILS[];
      lastEvent: EVENT_DETAILS | undefined;
      seedSnapshot: Snapshot<AGGREGATE> | undefined;
    }> => {
      const seedSnapshot = await loadSeedSnapshot(aggregateId, maxVersion);

      const eventsOptions: EventsQueryOptions = {};
      if (maxVersion !== undefined) {
        eventsOptions.maxVersion = maxVersion;
      }
      if (seedSnapshot !== undefined) {
        eventsOptions.minVersion = seedSnapshot.aggregate.version + 1;
      }

      const { events } = await this.getEvents(
        aggregateId,
        Object.keys(eventsOptions).length > 0 ? eventsOptions : undefined,
      );

      const aggregate = applyEventsOnSeed(events, seedSnapshot);
      const lastEvent = events[events.length - 1];

      tryPersistSnapshot(aggregate, seedSnapshot, events.length);

      return { aggregate, events, lastEvent, seedSnapshot };
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
        const { snapshot: rawSnapshot } =
          await this.snapshotStorageAdapter.getLatestSnapshot(
            aggregateId,
            { eventStoreId: this.eventStoreId },
            maxVersion !== undefined
              ? { aggregateMaxVersion: maxVersion }
              : {},
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

    /**
     * Decide whether to save a snapshot, save it, and prune older snapshots
     * according to the configured pruning policy. Always called in a
     * "fire-and-forget" fashion by the read path, so all errors are caught
     * here and never propagate.
     */
    const shouldPersistNewSnapshot = (args: {
      aggregate: AGGREGATE;
      previousSnapshot: Snapshot<AGGREGATE> | undefined;
      newEventCount: number;
      config: SnapshotConfig<$AGGREGATE>;
    }): boolean => {
      if (
        args.aggregate.version <= 0 ||
        args.previousSnapshot?.aggregate.version === args.aggregate.version
      ) {
        return false;
      }

      return compileSnapshotPolicy(args.config.policy)({
        aggregate: args.aggregate as unknown as $AGGREGATE,
        previousSnapshot: args.previousSnapshot as unknown as
          | Snapshot<$AGGREGATE>
          | undefined,
        newEventCount: args.newEventCount,
        now: new Date(),
      });
    };

    const maybePersistSnapshot = async (args: {
      aggregate: AGGREGATE;
      previousSnapshot: Snapshot<AGGREGATE> | undefined;
      newEventCount: number;
    }): Promise<void> => {
      try {
        const config = this.snapshotConfig;
        const adapter = this.snapshotStorageAdapter;
        if (config === undefined || adapter === undefined) {
          return;
        }

        if (!shouldPersistNewSnapshot({ ...args, config })) {
          return;
        }

        const newSnapshot: Snapshot<AGGREGATE> = {
          aggregate: args.aggregate,
          reducerVersion: config.currentReducerVersion,
          eventStoreId: this.eventStoreId,
          savedAt: new Date().toISOString(),
        };

        await adapter.putSnapshot(newSnapshot, {
          eventStoreId: this.eventStoreId,
        });

        await pruneSnapshotsAfterSave({
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
    };

    const resolveKeepCount = (): number | undefined => {
      if (this.snapshotConfig === undefined) {
        return undefined;
      }
      const pruning = this.snapshotConfig.pruning ?? {
        strategy: 'DELETE_PREVIOUS' as const,
      };

      if (pruning.strategy === 'NONE') {
        return undefined;
      }

      const keepCount =
        pruning.strategy === 'DELETE_PREVIOUS' ? 1 : pruning.n;

      return keepCount < 1 ? undefined : keepCount;
    };

    const pruneSnapshotsAfterSave = async (args: {
      aggregateId: string;
      newSnapshot: Snapshot<AGGREGATE>;
    }): Promise<void> => {
      const keepCount = resolveKeepCount();
      if (
        keepCount === undefined ||
        this.snapshotConfig === undefined ||
        this.snapshotStorageAdapter === undefined
      ) {
        return;
      }

      const adapter = this.snapshotStorageAdapter;
      const ctx = { eventStoreId: this.eventStoreId };
      const reducerVersion = this.snapshotConfig.currentReducerVersion;

      let pageToken: string | undefined = undefined;
      let kept = 0;

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
          if (kept < keepCount) {
            kept += 1;
            continue;
          }
          await adapter.deleteSnapshot(key, ctx);
        }

        pageToken = nextPageToken;
      } while (pageToken !== undefined);
    };

    this.getAggregate = async (aggregateId, { maxVersion } = {}) => {
      const { aggregate } = await rebuildAggregate(aggregateId, maxVersion);

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

    this.getEventsAndAggregate = async (
      aggregateId,
      { maxVersion, fromVersion } = {},
    ) => {
      const {
        aggregate,
        events: allEvents,
      } = await rebuildAggregate(aggregateId, maxVersion);

      const events =
        fromVersion !== undefined && fromVersion > 1
          ? allEvents.filter(event => event.version >= fromVersion)
          : allEvents;
      const lastEvent = events[events.length - 1];

      return { aggregate, events, lastEvent };
    };

    this.getExistingEventsAndAggregate = async (aggregateId, options) => {
      const { aggregate, events, lastEvent } =
        await this.getEventsAndAggregate(aggregateId, options);

      if (aggregate === undefined) {
        throw new AggregateNotFoundError({
          aggregateId,
          eventStoreId: this.eventStoreId,
        });
      }

      return { aggregate, events, lastEvent };
    };

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
}
