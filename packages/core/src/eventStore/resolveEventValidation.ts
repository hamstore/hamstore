import type { EventDetail } from '~/event/eventDetail';
import type { EventType } from '~/event/eventType';

import { EventDetailParserNotDefinedError } from './errors/eventDetailParserNotDefined';
import { EventDetailTypeDoesNotExistError } from './errors/eventDetailTypeDoesNotExist';
import type { ValidateEventDetail } from './types';

export const resolveEventValidation = async (
  candidateEventTypes: EventType[],
  eventDetail: EventDetail,
  validate: ValidateEventDetail,
): Promise<void> => {
  if (validate === false) {
    return;
  }

  const eventType = candidateEventTypes.find(
    ({ type }) => type === eventDetail.type,
  );

  if (eventType === undefined) {
    if (validate === true) {
      throw new EventDetailTypeDoesNotExistError({
        type: eventDetail.type,
        allowedTypes: candidateEventTypes.map(({ type }) => type),
      });
    }
    return;
  }

  if (eventType.parseEventDetail === undefined) {
    if (validate === true) {
      throw new EventDetailParserNotDefinedError(eventDetail.type);
    }
    return;
  }

  const result = await eventType.parseEventDetail(eventDetail);

  if (!result.isValid) {
    const messages = result.parsingErrors.map(e => e.message);
    throw new Error(messages.join('; '));
  }
};
