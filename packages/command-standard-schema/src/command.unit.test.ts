/* eslint-disable max-lines */
import {
  EventStore,
  EventType,
  EventStorageAdapter,
  tuple,
} from '@hamstore/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { vi } from 'vitest';

import { StandardSchemaCommand } from './command';

// Mock Standard Schema helpers

const createMockSchema = <I, O = I>(
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

const pushEventMock = vi.fn();
const pushEventGroupMock = vi.fn();
const groupEventMock = vi.fn();
const getEventsMock = vi.fn();
const listAggregateIdsMock = vi.fn();

const eventStorageAdapterMock: EventStorageAdapter = {
  pushEvent: pushEventMock,
  pushEventGroup: pushEventGroupMock,
  groupEvent: groupEventMock,
  getEvents: getEventsMock,
  listAggregateIds: listAggregateIdsMock,
};

const counterCreatedEvent = new EventType<'COUNTER_CREATED'>({
  type: 'COUNTER_CREATED',
});
const counterIncrementedEvent = new EventType<'COUNTER_INCREMENTED'>({
  type: 'COUNTER_INCREMENTED',
});

type CounterAggregate = {
  aggregateId: string;
  version: number;
  count: number;
};

const counterEventStore = new EventStore({
  eventStoreId: 'Counters',
  eventTypes: [counterCreatedEvent, counterIncrementedEvent],
  reducer: (aggregate: CounterAggregate, event): CounterAggregate => {
    const { aggregateId, version } = event;
    if (event.type === 'COUNTER_INCREMENTED') {
      return {
        aggregateId,
        version,
        count: (aggregate?.count ?? 0) + 1,
      };
    }

    return aggregate ?? { aggregateId, version, count: 0 };
  },
  eventStorageAdapter: eventStorageAdapterMock,
});

// Schemas

const inputSchema = createMockSchema<
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

const outputSchema = createMockSchema<
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

describe('StandardSchemaCommand implementation', () => {
  const requiredEventStores = tuple(counterEventStore);

  describe('construction', () => {
    it('has correct properties (with input and output schemas)', () => {
      const command = new StandardSchemaCommand({
        commandId: 'INCREMENT_COUNTER',
        requiredEventStores,
        inputSchema,
        outputSchema,
        handler: async () => ({ nextCount: 1 }),
      });

      expect(command.commandId).toBe('INCREMENT_COUNTER');
      expect(command.inputSchema).toBe(inputSchema);
      expect(command.outputSchema).toBe(outputSchema);
    });

    it('has correct properties (input only, no output schema)', () => {
      const command = new StandardSchemaCommand({
        commandId: 'INCREMENT_COUNTER',
        requiredEventStores,
        inputSchema,
        handler: async () => {
          /* no return */
        },
      });

      expect(command.inputSchema).toBe(inputSchema);
      expect(command.outputSchema).toBeUndefined();
    });
  });

  describe('input validation', () => {
    it('validates input before calling handler', async () => {
      const handlerMock = vi.fn().mockResolvedValue(undefined);

      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        handler: handlerMock,
      });

      await command.handler(
        { counterId: 'abc' },
        requiredEventStores,
      );

      expect(handlerMock).toHaveBeenCalledTimes(1);
      expect(handlerMock).toHaveBeenCalledWith(
        { counterId: 'abc' },
        requiredEventStores,
      );
    });

    it('throws on invalid input', async () => {
      const handlerMock = vi.fn().mockResolvedValue(undefined);

      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        handler: handlerMock,
      });

      await expect(
        command.handler({ notCounterId: 123 } as never, requiredEventStores),
      ).rejects.toThrow('Input validation failed');

      expect(handlerMock).not.toHaveBeenCalled();
    });

    it('passes transformed input to handler', async () => {
      const transformingInput = createMockSchema<string, number>(value => {
        if (typeof value === 'string') {
          return { value: value.length };
        }

        return { issues: [{ message: 'Expected string' }] };
      });

      const handlerMock = vi.fn().mockResolvedValue(undefined);

      const command = new StandardSchemaCommand({
        commandId: 'TRANSFORM_COMMAND',
        requiredEventStores,
        inputSchema: transformingInput,
        handler: handlerMock,
      });

      await command.handler('hello' as never, requiredEventStores);

      expect(handlerMock).toHaveBeenCalledWith(5, requiredEventStores);
    });
  });

  describe('output validation', () => {
    it('validates output when outputSchema is provided', async () => {
      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        outputSchema,
        handler: async () => ({ nextCount: 42 }),
      });

      const result = await command.handler(
        { counterId: 'abc' },
        requiredEventStores,
      );

      expect(result).toStrictEqual({ nextCount: 42 });
    });

    it('throws on invalid output when outputSchema is provided', async () => {
      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        outputSchema,
        handler: async () => ({ nextCount: 'not-a-number' }) as never,
      });

      await expect(
        command.handler({ counterId: 'abc' }, requiredEventStores),
      ).rejects.toThrow('Output validation failed');
    });

    it('skips output validation when no outputSchema', async () => {
      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        handler: async () => ({ anything: 'goes' }),
      });

      const result = await command.handler(
        { counterId: 'abc' },
        requiredEventStores,
      );

      expect(result).toStrictEqual({ anything: 'goes' });
    });
  });

  describe('error messages', () => {
    it('includes path info in validation error', async () => {
      const schemaWithPath = createMockSchema<{ nested: string }>(
        () => ({
          issues: [
            {
              message: 'Required',
              path: [{ key: 'nested' }],
            },
          ],
        }),
      );

      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema: schemaWithPath,
        handler: async () => undefined,
      });

      await expect(
        command.handler({} as never, requiredEventStores),
      ).rejects.toThrow('(at nested)');
    });

    it('joins multiple issues with semicolons', async () => {
      const multiIssueSchema = createMockSchema<{ a: string; b: number }>(
        () => ({
          issues: [
            { message: 'a is required' },
            { message: 'b is required' },
          ],
        }),
      );

      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema: multiIssueSchema,
        handler: async () => undefined,
      });

      await expect(
        command.handler({} as never, requiredEventStores),
      ).rejects.toThrow('a is required; b is required');
    });
  });

  describe('async validation', () => {
    it('works with async schema validation', async () => {
      const asyncInput = createMockSchema<{ id: string }>(async value => {
        await new Promise(resolve => setTimeout(resolve, 1));

        return { value: value as { id: string } };
      });

      const command = new StandardSchemaCommand({
        commandId: 'ASYNC_COMMAND',
        requiredEventStores,
        inputSchema: asyncInput,
        handler: async input => ({ received: input.id }),
      });

      const result = await command.handler(
        { id: 'test-123' },
        requiredEventStores,
      );

      expect(result).toStrictEqual({ received: 'test-123' });
    });
  });
});
