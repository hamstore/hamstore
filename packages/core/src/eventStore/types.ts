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

/**
 * The set of overloads of `pushEvent` that statically guarantee a non-undefined
 * `nextAggregate`:
 * - call-site provides a non-undefined `prevAggregate`, OR
 * - call-site uses an event literal with `version: 1` (i.e. an initial event).
 *
 * The third overload preserves the original call signature, so
 * `Parameters<...>` and `ReturnType<...>` resolve to the previous (broader)
 * shapes and existing type assertions keep passing.
 *
 * When `REQUIRES_PREV_AGGREGATE` is `true`, the type collapses to a single
 * signature that requires `prevAggregate` and always returns `nextAggregate`.
 */
export type EventPusher<
  EVENT_DETAILS extends EventDetail,
  $EVENT_DETAILS extends EventDetail,
  AGGREGATE extends Aggregate,
  $AGGREGATE extends Aggregate,
  REQUIRES_PREV_AGGREGATE extends boolean = false,
> = REQUIRES_PREV_AGGREGATE extends true
  ? (
      event: $EVENT_DETAILS extends EventDetail
        ? OptionalTimestamp<$EVENT_DETAILS>
        : $EVENT_DETAILS,
      options: { prevAggregate: $AGGREGATE; force?: boolean },
    ) => Promise<{ event: EVENT_DETAILS; nextAggregate: AGGREGATE }>
  : {
      (
        event: $EVENT_DETAILS extends EventDetail
          ? OptionalTimestamp<$EVENT_DETAILS>
          : $EVENT_DETAILS,
        options: { prevAggregate: $AGGREGATE; force?: boolean },
      ): Promise<{ event: EVENT_DETAILS; nextAggregate: AGGREGATE }>;
      (
        event: ($EVENT_DETAILS extends EventDetail
          ? OptionalTimestamp<$EVENT_DETAILS>
          : $EVENT_DETAILS) & { version: 1 },
        options?: { prevAggregate?: undefined; force?: boolean },
      ): Promise<{ event: EVENT_DETAILS; nextAggregate: AGGREGATE }>;
      (
        event: $EVENT_DETAILS extends EventDetail
          ? OptionalTimestamp<$EVENT_DETAILS>
          : $EVENT_DETAILS,
        options?: { prevAggregate?: $AGGREGATE; force?: boolean },
      ): Promise<{ event: EVENT_DETAILS; nextAggregate?: AGGREGATE }>;
    };

export type AggregateIdsLister = (
  listAggregateOptions?: ListAggregateIdsOptions,
) => Promise<ListAggregateIdsOutput>;

/**
 * Mirror of `EventPusher` for `groupEvent`: when `REQUIRES_PREV_AGGREGATE` is
 * `true`, the call-site MUST pass a non-undefined `prevAggregate`. Default
 * mode keeps the original (optional) signature.
 */
export type EventGrouper<
  EVENT_DETAILS extends EventDetail,
  $EVENT_DETAILS,
  AGGREGATE extends Aggregate,
  $AGGREGATE,
  REQUIRES_PREV_AGGREGATE extends boolean = false,
> = REQUIRES_PREV_AGGREGATE extends true
  ? (
      event: $EVENT_DETAILS extends EventDetail
        ? OptionalTimestamp<$EVENT_DETAILS>
        : $EVENT_DETAILS,
      options: { prevAggregate: $AGGREGATE },
    ) => GroupedEvent<EVENT_DETAILS, AGGREGATE>
  : (
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

export type AggregateGetter<
  EVENT_DETAIL extends EventDetail,
  AGGREGATE extends Aggregate,
  SHOULD_EXIST extends boolean = false,
> = (
  aggregateId: string,
  options?: GetAggregateOptions,
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
