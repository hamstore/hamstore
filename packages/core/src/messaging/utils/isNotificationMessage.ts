import { isEventCarryingMessage } from './isEventCarryingMessage';

import type { Message, NotificationMessage } from '../message';

export const isNotificationMessage = (
  message: Message,
): message is NotificationMessage =>
  isEventCarryingMessage(message) && !('aggregate' in message);
