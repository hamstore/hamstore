import { isEventCarryingMessage } from '@hamstore/core';

import type { Task } from './message';
import type { FilterPattern } from './types';

type ParsedMessage = {
  eventStoreId: string;
  eventType?: string;
};
const parseMessage = (message: Task['message']): ParsedMessage => ({
  eventStoreId: message.eventStoreId,
  eventType: isEventCarryingMessage(message) ? message.event.type : undefined,
});

const messageMatchesStoreIdAndEventType = (
  parsedMessage: ParsedMessage,
  filterPattern: FilterPattern,
) =>
  parsedMessage.eventStoreId === filterPattern.eventStoreId &&
  parsedMessage.eventType === filterPattern.eventType;
export const doesTaskMatchFilterPattern = (
  task: Task,
  filterPattern: FilterPattern,
): boolean => {
  const { message, replay = false } = task;
  const {
    eventStoreId: filterEventStoreId,
    eventType: filterEventType,
    onReplay = false,
  } = filterPattern;

  const parsedMessage = parseMessage(message);

  if (replay && !onReplay) {
    return false;
  }

  if (filterEventStoreId !== undefined && filterEventType !== undefined) {
    return messageMatchesStoreIdAndEventType(parsedMessage, filterPattern);
  }

  if (filterEventStoreId !== undefined) {
    return parsedMessage.eventStoreId === filterEventStoreId;
  }

  return true;
};

export const doesTaskMatchAnyFilterPattern = (
  task: Task,
  filterPatterns: FilterPattern[],
): boolean =>
  filterPatterns.some(filterPattern =>
    doesTaskMatchFilterPattern(task, filterPattern),
  );

export const parseRetryDelayInMs = (retryDelayInMs: number): number => {
  if (typeof retryDelayInMs !== 'number' || retryDelayInMs < 0) {
    throw new Error('Invalid retryDelayInMs, please select a positive number.');
  }

  return Math.round(retryDelayInMs);
};

export const parseRetryAttempts = (retryAttempts: number): number => {
  if (typeof retryAttempts !== 'number' || retryAttempts < 0) {
    throw new Error('Invalid retryAttempts, please select a positive integer.');
  }

  return Math.round(retryAttempts);
};

export const parseBackoffRate = (backoffRate: number): number => {
  if (typeof backoffRate !== 'number' || backoffRate < 0) {
    throw new Error('Invalid backoffRate, please select a positive number.');
  }

  return backoffRate;
};
