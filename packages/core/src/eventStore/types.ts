import type { Aggregate } from '~/aggregate';
import type { EventDetail, OptionalTimestamp } from '~/event/eventDetail';
import type { GroupedEvent } from '~/event/groupedEvent';
import type {
  EventsQueryOptions,
  ListAggregateIdsOptions,
  ListAggregateIdsOutput,
} from '~/eventStorageAdapter';
import type { $Contravariant } from '~/utils';

export type Reducer<
  AGGREGATE extends Aggregate = Aggregate,
  EVENT_DETAIL extends EventDetail = EventDetail,
  $EVENT_DETAIL = $Contravariant<EVENT_DETAIL, EventDetail>,
  $AGGREGATE = $Contravariant<AGGREGATE, Aggregate>,
> = (aggregate: $AGGREGATE, event: $EVENT_DETAIL) => AGGREGATE;

export type SideEffectsSimulator<
  EVENT_DETAIL extends EventDetail,
  $EVENT_DETAIL = $Contravariant<EVENT_DETAIL, EventDetail>,
> = (
  indexedEvents: Record<string, Omit<$EVENT_DETAIL, 'version'>>,
  event: $EVENT_DETAIL,
) => Record<string, Omit<EVENT_DETAIL, 'version'>>;

export type EventsGetter<EVENT_DETAIL extends EventDetail> = (
  aggregateId: string,
  options?: EventsQueryOptions,
) => Promise<{ events: EVENT_DETAIL[] }>;

export type EventPusher<
  EVENT_DETAILS extends EventDetail,
  $EVENT_DETAILS extends EventDetail,
  AGGREGATE extends Aggregate,
  $AGGREGATE extends Aggregate,
> = (
  event: $EVENT_DETAILS extends EventDetail
    ? OptionalTimestamp<$EVENT_DETAILS>
    : $EVENT_DETAILS,
  options?: { prevAggregate?: $AGGREGATE; force?: boolean },
) => Promise<{ event: EVENT_DETAILS; nextAggregate?: AGGREGATE }>;

export type AggregateIdsLister = (
  listAggregateOptions?: ListAggregateIdsOptions,
) => Promise<ListAggregateIdsOutput>;

export type EventGrouper<
  EVENT_DETAILS extends EventDetail,
  $EVENT_DETAILS,
  AGGREGATE extends Aggregate,
  $AGGREGATE,
> = (
  event: $EVENT_DETAILS extends EventDetail
    ? OptionalTimestamp<$EVENT_DETAILS>
    : $EVENT_DETAILS,
  options?: { prevAggregate?: $AGGREGATE },
) => GroupedEvent<EVENT_DETAILS, AGGREGATE>;

export type EventGroupPusher = <
  GROUPED_EVENTS extends [GroupedEvent, ...GroupedEvent[]] = [
    GroupedEvent,
    ...GroupedEvent[],
  ],
  OPTIONS_OR_GROUPED_EVENTS_HEAD extends GroupedEvent | { force?: boolean } =
    GroupedEvent,
>(
  optionsOrGroupedEventsHead: OPTIONS_OR_GROUPED_EVENTS_HEAD,
  ...groupedEvents: GROUPED_EVENTS
) => Promise<{
  eventGroup: OPTIONS_OR_GROUPED_EVENTS_HEAD extends GroupedEvent
    ? EventGroupPusherResponse<
        [OPTIONS_OR_GROUPED_EVENTS_HEAD, ...GROUPED_EVENTS]
      >
    : EventGroupPusherResponse<GROUPED_EVENTS>;
}>;

export type EventGroupPusherResponse<GROUPED_EVENTS extends GroupedEvent[]> =
  number extends GROUPED_EVENTS['length']
    ? { event: EventDetail; nextAggregate?: Aggregate }[]
    : GROUPED_EVENTS extends [
          infer HEAD_GROUPED_EVENT,
          ...infer TAIL_GROUPED_EVENTS,
        ]
      ? HEAD_GROUPED_EVENT extends GroupedEvent
        ? TAIL_GROUPED_EVENTS extends GroupedEvent[]
          ? [
              {
                event: NonNullable<HEAD_GROUPED_EVENT['_types']>['details'];
                nextAggregate?: NonNullable<
                  HEAD_GROUPED_EVENT['_types']
                >['aggregate'];
              },
              ...EventGroupPusherResponse<TAIL_GROUPED_EVENTS>,
            ]
          : never
        : never
      : [];

export type OnEventPushed<$EVENT_DETAILS, $AGGREGATE> = (props: {
  event: $EVENT_DETAILS;
  nextAggregate?: $AGGREGATE;
}) => Promise<void>;

export type GetAggregateOptions = {
  maxVersion?: number;
};

export type GetEventsAndAggregateOptions = {
  maxVersion?: number;
  /**
   * Lowest event version that MUST appear in the returned `events` array.
   * Defaults to `1` (i.e. the full event history).
   *
   * Used to support incremental projections / "events since checkpoint"
   * patterns: a caller that has already processed events up to version
   * `V` can ask for `fromVersion: V + 1` and receive only the new events,
   * alongside the up-to-date aggregate.
   *
   * When the EventStore has snapshots configured, `fromVersion` also
   * bounds which snapshot may seed the aggregate: only snapshots whose
   * `aggregate.version < fromVersion` are eligible. Otherwise the full
   * history is read.
   */
  fromVersion?: number;
};

/**
 * `getAggregate` returns the rebuilt aggregate only.
 *
 * The previous shape (which also included `events` and `lastEvent`) is
 * available via `getEventsAndAggregate` / `getExistingEventsAndAggregate` for
 * callers that need the underlying events. See the v3-to-v4 migration guide.
 */
export type AggregateGetter<
  AGGREGATE extends Aggregate,
  SHOULD_EXIST extends boolean = false,
> = (
  aggregateId: string,
  options?: GetAggregateOptions,
) => Promise<{
  aggregate: SHOULD_EXIST extends true ? AGGREGATE : AGGREGATE | undefined;
}>;

/**
 * Full-history aggregate getter — returns the rebuilt aggregate plus the
 * events that produced it. This replaces the legacy `getAggregate` return
 * shape.
 *
 * By default (`fromVersion` unset / `1`), `events` is the complete event
 * history of the aggregate up to `maxVersion`. With `fromVersion: X`, only
 * events with `version >= X` are returned (the aggregate still reflects the
 * entire history up to `maxVersion`).
 */
export type EventsAndAggregateGetter<
  EVENT_DETAIL extends EventDetail,
  AGGREGATE extends Aggregate,
  SHOULD_EXIST extends boolean = false,
> = (
  aggregateId: string,
  options?: GetEventsAndAggregateOptions,
) => Promise<{
  aggregate: SHOULD_EXIST extends true ? AGGREGATE : AGGREGATE | undefined;
  events: EVENT_DETAIL[];
  lastEvent: SHOULD_EXIST extends true
    ? EVENT_DETAIL
    : EVENT_DETAIL | undefined;
}>;

export type SimulationOptions = { simulationDate?: string };

export type AggregateSimulator<$EVENT_DETAIL, AGGREGATE extends Aggregate> = (
  events: $EVENT_DETAIL[],
  options?: SimulationOptions,
) => AGGREGATE | undefined;
