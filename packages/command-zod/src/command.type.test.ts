/* eslint-disable max-lines */
import { Command, tuple } from '@hamstore/core';
import { A } from 'ts-toolbelt';
import { z } from 'zod';

import { ZodCommand } from './command';
import {
  counterEventStore,
  createCounter,
  incrementCounter,
  incrementCounterA,
  incrementCounterANoOutput,
  incrementCounterNoOutput,
  inputSchema,
  outputSchema,
} from './command.fixtures.test';

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

// --- CLASS ---

const assertZodCommandExtendsCommand: A.Extends<ZodCommand, Command> = 1;
assertZodCommandExtendsCommand;

const assertCreateCounterExtendsZodCommand: A.Extends<
  typeof createCounter,
  ZodCommand
> = 1;
assertCreateCounterExtendsZodCommand;

const assertCreateCounterExtendsCommand: A.Extends<
  typeof createCounter,
  Command
> = 1;
assertCreateCounterExtendsCommand;

const assertIncrementCounterExtendsZodCommand: A.Extends<
  typeof incrementCounter,
  ZodCommand
> = 1;
assertIncrementCounterExtendsZodCommand;

const assertIncrementCounterExtendsCommand: A.Extends<
  typeof incrementCounter,
  Command
> = 1;
assertIncrementCounterExtendsCommand;

const assertIncrementCounterNoOutputExtendsZodCommand: A.Extends<
  typeof incrementCounterNoOutput,
  ZodCommand
> = 1;
assertIncrementCounterNoOutputExtendsZodCommand;

const assertIncrementCounterNoOutputExtendsCommand: A.Extends<
  typeof incrementCounterNoOutput,
  Command
> = 1;
assertIncrementCounterNoOutputExtendsCommand;

const assertIncrementCounterAExtendsZodCommand: A.Extends<
  typeof incrementCounterA,
  ZodCommand
> = 1;
assertIncrementCounterAExtendsZodCommand;

const assertIncrementCounterAExtendsCommand: A.Extends<
  typeof incrementCounterA,
  Command
> = 1;
assertIncrementCounterAExtendsCommand;

const assertIncrementCounterANoOutputExtendsZodCommand: A.Extends<
  typeof incrementCounterANoOutput,
  ZodCommand
> = 1;
assertIncrementCounterANoOutputExtendsZodCommand;

const assertIncrementCounterANoOutputExtendsCommand: A.Extends<
  typeof incrementCounterANoOutput,
  Command
> = 1;
assertIncrementCounterANoOutputExtendsCommand;

// --- SCHEMAS ---

const assertIncrementCounterInputSchema: A.Equals<
  typeof incrementCounter.inputSchema,
  /**
   * @debt type "Find a way to remove undefined"
   */
  typeof inputSchema | undefined
> = 1;
assertIncrementCounterInputSchema;

const assertIncrementCounterOutputSchema: A.Equals<
  typeof incrementCounter.outputSchema,
  /**
   * @debt type "Find a way to remove undefined"
   */
  typeof outputSchema | undefined
> = 1;
assertIncrementCounterOutputSchema;

const assertIncrementCounterNoOutputInputSchema: A.Equals<
  typeof incrementCounterNoOutput.inputSchema,
  /**
   * @debt type "Find a way to remove undefined"
   */
  typeof inputSchema | undefined
> = 1;
assertIncrementCounterNoOutputInputSchema;

const assertIncrementCounterASchemaOutputSchema: A.Equals<
  typeof incrementCounterA.outputSchema,
  /**
   * @debt type "Find a way to remove undefined"
   */
  typeof outputSchema | undefined
> = 1;
assertIncrementCounterASchemaOutputSchema;

// --- HANDLER ---

const assertCreateCounterHandler: A.Equals<
  typeof createCounter.handler,
  (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: any,
    requiredEventStores: [typeof counterEventStore],
    context: { generateUuid: () => string },
  ) => Promise<Input>
> = 1;
assertCreateCounterHandler;

const assertIncrementCounterHandler: A.Equals<
  typeof incrementCounter.handler,
  (
    input: Input,
    requiredEventStores: [typeof counterEventStore],
  ) => Promise<Output>
> = 1;
assertIncrementCounterHandler;

const assertIncrementCounterNoOutputHandler: A.Equals<
  typeof incrementCounterNoOutput.handler,
  (
    input: Input,
    requiredEventStores: [typeof counterEventStore],
  ) => Promise<void>
> = 1;
assertIncrementCounterNoOutputHandler;

const assertIncrementCounterAHandler: A.Equals<
  typeof incrementCounterA.handler,
  (
    /**
     * @debt type "input should be typed as unknown"
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: any,
    requiredEventStores: [typeof counterEventStore],
  ) => Promise<Output>
> = 1;
assertIncrementCounterAHandler;

const assertIncrementCounterANoOutputHandler: A.Equals<
  typeof incrementCounterANoOutput.handler,
  (
    /**
     * @debt type "input should be typed as unknown"
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: any,
    requiredEventStores: [typeof counterEventStore],
  ) => Promise<void>
> = 1;
assertIncrementCounterANoOutputHandler;

// --- castore-dev/castore#194 — handler must not silently override schemas ---
//
// Without protection, TypeScript infers `INPUT` / `OUTPUT` from the handler's
// parameter and return type, silently agreeing with whatever the handler does
// and defeating the purpose of `inputSchema` / `outputSchema`.
//
// `INPUT` is guarded by wrapping the handler's `input` parameter in
// `NoInfer<>`. `OUTPUT` is guarded by an `extends`-constraint on the generic
// (`OUTPUT extends OUTPUT_SCHEMA extends ZodType ? inferZodType<…> : unknown`),
// which still allows handler-driven inference when no `outputSchema` is
// provided — so the common "trust the handler" pattern keeps working.
//
// The two `@ts-expect-error` directives below fail to compile only if both
// guards are in place.
//
// See https://github.com/castore-dev/castore/issues/194

const stringSchema = z.string();
const numberSchema = z.number();

// outputSchema declares the output as string, but handler returns a number.
new ZodCommand({
  commandId: 'OUTPUT_MISMATCH',
  requiredEventStores: tuple(counterEventStore),
  inputSchema: stringSchema,
  outputSchema: stringSchema,
  // @ts-expect-error — handler return type does not match outputSchema
  handler: async () => 42,
});

// inputSchema yields string, handler annotates input as number.
new ZodCommand({
  commandId: 'INPUT_MISMATCH',
  requiredEventStores: tuple(counterEventStore),
  inputSchema: stringSchema,
  // @ts-expect-error — handler input type does not match inputSchema
  handler: async (input: number) => {
    void input;
  },
});

// Sanity: matching types still type-check.
new ZodCommand({
  commandId: 'OK',
  requiredEventStores: tuple(counterEventStore),
  inputSchema: stringSchema,
  outputSchema: numberSchema,
  handler: async input => {
    void input;
    return 7;
  },
});

// Without an outputSchema, OUTPUT must still be inferred from the handler's
// return type so callers see the actual handler shape (the common
// "trust the handler" pattern). Asserts the no-schema fixture is not
// regressed back to `Promise<any>` by an over-eager NoInfer.
const cmdWithInferredOutput = new ZodCommand({
  commandId: 'INFERRED_OUTPUT',
  requiredEventStores: tuple(counterEventStore),
  inputSchema: stringSchema,
  handler: async input => {
    void input;
    return { foo: 'bar' as const };
  },
});

const assertInferredOutputHandler: A.Equals<
  Awaited<ReturnType<typeof cmdWithInferredOutput.handler>>,
  { foo: 'bar' }
> = 1;
assertInferredOutputHandler;
