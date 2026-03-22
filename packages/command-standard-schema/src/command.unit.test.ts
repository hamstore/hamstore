/* eslint-disable max-lines */
import { vi } from 'vitest';

import {
  counterEventsMocks,
  createMockSchema,
  getEventsMock,
  incrementCounter,
  incrementCounterNoOutput,
  inputSchema,
  outputSchema,
  requiredEventStores,
} from './command.fixtures.test';
import { StandardSchemaCommand } from './command';

getEventsMock.mockResolvedValue({ events: counterEventsMocks });

describe('standardSchemaCommand implementation', () => {
  const expectedProperties = new Set([
    '_types',
    'commandId',
    'requiredEventStores',
    'inputSchema',
    'outputSchema',
    'eventAlreadyExistsRetries',
    'onEventAlreadyExists',
    'handler',
  ]);

  it('has correct properties', () => {
    expect(new Set(Object.keys(incrementCounter))).toStrictEqual(
      expectedProperties,
    );

    expect(
      incrementCounter.requiredEventStores.map(
        ({ eventStoreId }) => eventStoreId,
      ),
    ).toStrictEqual(
      requiredEventStores.map(({ eventStoreId }) => eventStoreId),
    );

    expect(incrementCounter.inputSchema).toStrictEqual(inputSchema);
    expect(incrementCounter.outputSchema).toStrictEqual(outputSchema);
  });

  it('has correct properties (no output)', () => {
    expect(new Set(Object.keys(incrementCounterNoOutput))).toStrictEqual(
      expectedProperties,
    );
    expect(incrementCounterNoOutput.inputSchema).toStrictEqual(inputSchema);
    expect(incrementCounterNoOutput.outputSchema).toBeUndefined();
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
