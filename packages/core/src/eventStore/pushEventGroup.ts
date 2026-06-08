import type { Aggregate } from '~/aggregate';
import type { EventDetail } from '~/event/eventDetail';
import { GroupedEvent } from '~/event/groupedEvent';

import { resolveEventValidation } from './resolveEventValidation';
import type { EventGroupPusher, EventGroupPusherResponse } from './types';

/**
 * Commit a cross-aggregate group of events atomically.
 *
 * Deliberately a free, fully `this`-free operation (it derives the storage
 * adapter from the grouped events themselves and never touches an `EventStore`
 * instance), so it can be shared without a runtime cycle: both
 * `EventStore.pushEventGroup` (a re-assignment of this) and the
 * `AggregateHandle` static factories import it directly.
 */
export const pushEventGroup: EventGroupPusher = async <
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

  // Validate all grouped events that have validation configured
  await Promise.all(
    groupedEvents.map(async groupedEvent => {
      const validate = groupedEvent.validate ?? 'auto';
      if (validate === false) {
        return;
      }
      if (groupedEvent.eventStore === undefined) {
        if (validate === true) {
          throw new Error(
            'Cannot validate grouped event: no eventStore is assigned. Use eventStore.groupEvent() to create grouped events with validation.',
          );
        }
        return;
      }

      await resolveEventValidation(
        groupedEvent.eventStore.eventTypes,
        groupedEvent.event as EventDetail,
        validate,
      );
    }),
  );

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
