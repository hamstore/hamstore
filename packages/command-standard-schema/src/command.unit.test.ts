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
    'validate',
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

  describe('validate option', () => {
    it('throws on invalid input by default (validate=true)', async () => {
      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        handler: vi.fn().mockResolvedValue(undefined),
      });

      await expect(
        command.handler({ notCounterId: 123 } as never, requiredEventStores),
      ).rejects.toThrow('Input validation failed');
    });

    it('skips validation with validate=false', async () => {
      const handlerMock = vi.fn().mockResolvedValue(undefined);

      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        validate: false,
        handler: handlerMock,
      });

      await command.handler(
        { notCounterId: 123 } as never,
        requiredEventStores,
      );

      expect(handlerMock).toHaveBeenCalledTimes(1);
      expect(handlerMock).toHaveBeenCalledWith(
        { notCounterId: 123 },
        requiredEventStores,
      );
    });

    it('logs warning with validate=warn', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const handlerMock = vi.fn().mockResolvedValue(undefined);

      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        validate: 'warn',
        handler: handlerMock,
      });

      await command.handler(
        { notCounterId: 123 } as never,
        requiredEventStores,
      );

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Input validation failed'),
      );
      expect(handlerMock).toHaveBeenCalledTimes(1);
      expect(handlerMock).toHaveBeenCalledWith(
        { notCounterId: 123 },
        requiredEventStores,
      );

      warnSpy.mockRestore();
    });

    it('calls callback with validate=callback', async () => {
      const callbackMock = vi.fn();
      const handlerMock = vi.fn().mockResolvedValue(undefined);

      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        validate: callbackMock,
        handler: handlerMock,
      });

      await command.handler(
        { notCounterId: 123 } as never,
        requiredEventStores,
      );

      expect(callbackMock).toHaveBeenCalledTimes(1);
      expect(callbackMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Input validation failed'),
        }),
      );
      expect(handlerMock).toHaveBeenCalledTimes(1);
    });

    it('supports object form with separate input/output options', async () => {
      const handlerMock = vi.fn().mockResolvedValue({ nextCount: 'invalid' });

      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        outputSchema,
        validate: { input: false, output: true },
        handler: handlerMock,
      });

      await expect(
        command.handler({ notCounterId: 123 } as never, requiredEventStores),
      ).rejects.toThrow('Output validation failed');

      expect(handlerMock).toHaveBeenCalledTimes(1);
    });

    it('defaults to true for unspecified keys in object form', async () => {
      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        validate: { output: false },
        handler: vi.fn().mockResolvedValue(undefined),
      });

      await expect(
        command.handler({ notCounterId: 123 } as never, requiredEventStores),
      ).rejects.toThrow('Input validation failed');
    });

    it('stores validate on instance', () => {
      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        validate: 'warn',
        handler: vi.fn().mockResolvedValue(undefined),
      });

      expect(command.validate).toStrictEqual('warn');
    });

    it('does not set validate when not provided', () => {
      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        handler: vi.fn().mockResolvedValue(undefined),
      });

      expect(command.validate).toBeUndefined();
    });

    it('skips output validation with shorthand validate=true and no outputSchema', async () => {
      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        validate: true,
        handler: async () => ({ anything: 'goes' }),
      });

      const result = await command.handler(
        { counterId: 'abc' },
        requiredEventStores,
      );

      expect(result).toStrictEqual({ anything: 'goes' });
    });

    it('validates output with validate=auto when outputSchema exists', async () => {
      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        outputSchema,
        validate: { input: true, output: 'auto' },
        handler: async () => ({ nextCount: 'invalid' }) as never,
      });

      await expect(
        command.handler({ counterId: 'abc' }, requiredEventStores),
      ).rejects.toThrow('Output validation failed');
    });

    it('skips output validation with validate=auto when no outputSchema', async () => {
      const command = new StandardSchemaCommand({
        commandId: 'TEST_COMMAND',
        requiredEventStores,
        inputSchema,
        validate: { input: true, output: 'auto' },
        handler: async () => ({ anything: 'goes' }),
      });

      const result = await command.handler(
        { counterId: 'abc' },
        requiredEventStores,
      );

      expect(result).toStrictEqual({ anything: 'goes' });
    });

    it('throws in constructor when validate.output is true but no outputSchema', () => {
      expect(
        () =>
          new StandardSchemaCommand({
            commandId: 'TEST_COMMAND',
            requiredEventStores,
            inputSchema,
            validate: { output: true },
            handler: vi.fn().mockResolvedValue(undefined),
          }),
      ).toThrow('validate.output is set but no outputSchema was provided');
    });

    it('throws in constructor when validate.output is warn but no outputSchema', () => {
      expect(
        () =>
          new StandardSchemaCommand({
            commandId: 'TEST_COMMAND',
            requiredEventStores,
            inputSchema,
            validate: { output: 'warn' },
            handler: vi.fn().mockResolvedValue(undefined),
          }),
      ).toThrow('validate.output is set but no outputSchema was provided');
    });

    it('does not throw when validate.output is false without outputSchema', () => {
      expect(
        () =>
          new StandardSchemaCommand({
            commandId: 'TEST_COMMAND',
            requiredEventStores,
            inputSchema,
            validate: { output: false },
            handler: vi.fn().mockResolvedValue(undefined),
          }),
      ).not.toThrow();
    });

    it('does not throw when validate.output is auto without outputSchema', () => {
      expect(
        () =>
          new StandardSchemaCommand({
            commandId: 'TEST_COMMAND',
            requiredEventStores,
            inputSchema,
            validate: { output: 'auto' },
            handler: vi.fn().mockResolvedValue(undefined),
          }),
      ).not.toThrow();
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
