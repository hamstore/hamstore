import { isEventCarryingMessage } from './isEventCarryingMessage';

import type { Message, StateCarryingMessage } from '../message';

export const isStateCarryingMessage = (message: Message): message is StateCarryingMessage =>
  isEventCarryingMessage(message) && 'aggregate' in message;
