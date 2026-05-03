/* eslint-disable max-lines */
import {
  EventStore,
  EventType,
  EventTypeDetail,
  EventStorageAdapter,
  tuple,
} from '@hamstore/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { vi } from 'vitest';

import { StandardSchemaCommand } from './command';

// Mock Standard Schema factory

export const createMockSchema = <I, O = I>(
  validateFn: (
    value: unknown,
  ) => StandardSchemaV1.Result<O> | Promise<StandardSchemaV1.Result<O>>,
): StandardSchemaV1<I, O> =>
  ({
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: validateFn,
    },
  }) as StandardSchemaV1<I, O>;

// Event store fixtures

export const pushEventMock = vi.fn();
export const pushEventGroupMock = vi.fn();
export const groupEvent = vi.fn();
export const getEventsMock = vi.fn();
export const listAggregateIdsMock = vi.fn();

export const eventStorageAdapterMock: EventStorageAdapter = {
  pushEvent: pushEventMock,
  pushEventGroup: pushEventGroupMock,
  groupEvent: groupEvent,
  getEvents: getEventsMock,
  listAggregateIds: listAggregateIdsMock,
};

export const counterCreatedEvent = new EventType<'COUNTER_CREATED'>({
  type: 'COUNTER_CREATED',
});
export const counterIncrementedEvent = new EventType<'COUNTER_INCREMENTED'>({
  type: 'COUNTER_INCREMENTED',
});
export const counterDeletedEvent = new EventType<'COUNTER_DELETED'>({
  type: 'COUNTER_DELETED',
});
export type CounterEventsDetails =
  | EventTypeDetail<typeof counterCreatedEvent>
  | EventTypeDetail<typeof counterIncrementedEvent>
  | EventTypeDetail<typeof counterDeletedEvent>;

export type CounterAggregate = {
  aggregateId: string;
  version: number;
  count: number;
  status: string;
};

export const counterIdMock = 'counterId';
export const counterEventsMocks: [CounterEventsDetails, CounterEventsDetails] =
  [
    {
      aggregateId: counterIdMock,
      version: 1,
      type: 'COUNTER_CREATED',
      timestamp: '2022',
    },
    {
      aggregateId: counterIdMock,
      version: 2,
      type: 'COUNTER_INCREMENTED',
      timestamp: '2023',
    },
  ];

export const countersReducer = (
  counterAggregate: CounterAggregate,
  event: CounterEventsDetails,
): CounterAggregate => {
  const { version, aggregateId } = event;
  switch (event.type) {
    case 'COUNTER_CREATED':
      return { aggregateId, version: event.version, count: 0, status: 'LIVE' };
    case 'COUNTER_INCREMENTED':
      return {
        ...counterAggregate,
        version,
        count: counterAggregate.count + 1,
      };
    case 'COUNTER_DELETED':
      return { ...counterAggregate, version, status: 'DELETED' };
    default: {
      return { ...counterAggregate, version };
    }
  }
};

export const counterEventStore = new EventStore({
  eventStoreId: 'Counters',
  eventTypes: [
    counterCreatedEvent,
    counterIncrementedEvent,
    counterDeletedEvent,
  ],
  reducer: countersReducer,
  eventStorageAdapter: eventStorageAdapterMock,
});

// Schemas

export const inputSchema = createMockSchema<
  { counterId: string },
  { counterId: string }
>(value => {
  const obj = value as Record<string, unknown>;
  if (typeof obj?.counterId === 'string') {
    return { value: obj as { counterId: string } };
  }

  return {
    issues: [{ message: 'Expected object with counterId: string' }],
  };
});

export const outputSchema = createMockSchema<
  { nextCount: number },
  { nextCount: number }
>(value => {
  const obj = value as Record<string, unknown>;
  if (typeof obj?.nextCount === 'number') {
    return { value: obj as { nextCount: number } };
  }

  return {
    issues: [{ message: 'Expected object with nextCount: number' }],
  };
});

export const requiredEventStores = tuple(counterEventStore);

// Command variants
// Note: StandardSchemaCommand requires inputSchema, so there are only 2
// construction variants (with output, without output) instead of 4.

export const incrementCounter = new StandardSchemaCommand({
  commandId: 'INCREMENT_COUNTER',
  requiredEventStores,
  inputSchema,
  outputSchema,
  handler: async (input, eventStores) => {
    const { counterId } = input;
    const [countersStore] = eventStores;

    const { aggregate } = await countersStore.getExistingAggregate(counterId);
    const { count, version } = aggregate;

    await countersStore.pushEvent({
      aggregateId: counterId,
      version: version + 1,
      type: 'COUNTER_INCREMENTED',
    });

    return { nextCount: count + 1 };
  },
});

export const incrementCounterNoOutput = new StandardSchemaCommand({
  commandId: 'INCREMENT_COUNTER_NO_OUTPUT',
  requiredEventStores: tuple(counterEventStore),
  inputSchema,
  handler: async (input, eventStores) => {
    const { counterId } = input;
    const [countersStore] = eventStores;

    const { aggregate } = await countersStore.getExistingAggregate(counterId);
    const { version } = aggregate;

    await countersStore.pushEvent({
      aggregateId: counterId,
      type: 'COUNTER_INCREMENTED',
      version: version + 1,
    });
  },
});
