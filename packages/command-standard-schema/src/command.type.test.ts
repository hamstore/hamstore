import { Command, tuple } from '@hamstore/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { A } from 'ts-toolbelt';

import { StandardSchemaCommand } from './command';
import {
  counterEventStore,
  createMockSchema,
  incrementCounter,
  incrementCounterNoOutput,
} from './command.fixtures.test';

// --- CLASS ---

const assertStandardSchemaCommandExtendsCommand: A.Extends<
  StandardSchemaCommand,
  Command
> = 1;
assertStandardSchemaCommandExtendsCommand;

const assertIncrementCounterExtendsStandardSchemaCommand: A.Extends<
  typeof incrementCounter,
  StandardSchemaCommand
> = 1;
assertIncrementCounterExtendsStandardSchemaCommand;

const assertIncrementCounterExtendsCommand: A.Extends<
  typeof incrementCounter,
  Command
> = 1;
assertIncrementCounterExtendsCommand;

const assertIncrementCounterNoOutputExtendsStandardSchemaCommand: A.Extends<
  typeof incrementCounterNoOutput,
  StandardSchemaCommand
> = 1;
assertIncrementCounterNoOutputExtendsStandardSchemaCommand;

// --- castore-dev/castore#194 — handler must not silently override schemas ---
//
// Without protection, TypeScript infers `HANDLER_INPUT` / `OUTPUT` from the
// handler's parameter and return type, silently agreeing with whatever the
// handler does and defeating the purpose of `inputSchema` / `outputSchema`.
//
// `HANDLER_INPUT` is guarded by wrapping the handler's `input` parameter in
// `NoInfer<>`. `OUTPUT` is guarded by an `extends`-constraint on the generic
// (`OUTPUT extends OUTPUT_SCHEMA extends StandardSchemaV1 ? InferOutput<…>
// : unknown`), which still allows handler-driven inference when no
// `outputSchema` is provided — so the common "trust the handler" pattern
// keeps working.
//
// The two `@ts-expect-error` directives below fail to compile only if both
// guards are in place.
//
// See https://github.com/castore-dev/castore/issues/194

const stringSchema: StandardSchemaV1<string, string> = createMockSchema<
  string,
  string
>(value =>
  typeof value === 'string'
    ? { value }
    : { issues: [{ message: 'Expected string' }] },
);

const numberSchema: StandardSchemaV1<number, number> = createMockSchema<
  number,
  number
>(value =>
  typeof value === 'number'
    ? { value }
    : { issues: [{ message: 'Expected number' }] },
);

// outputSchema declares the output as `string`, but the handler returns a
// `number`. With `NoInfer<OUTPUT>` on the handler, the mismatch is caught.
new StandardSchemaCommand({
  commandId: 'OUTPUT_MISMATCH',
  requiredEventStores: tuple(counterEventStore),
  inputSchema: stringSchema,
  outputSchema: stringSchema,
  // @ts-expect-error — handler return type does not match outputSchema
  handler: async () => 42,
});

// inputSchema's parsed output is `string`, but the handler annotates the
// input as `number`. With `NoInfer<HANDLER_INPUT>`, the mismatch is caught.
new StandardSchemaCommand({
  commandId: 'INPUT_MISMATCH',
  requiredEventStores: tuple(counterEventStore),
  inputSchema: stringSchema,
  // @ts-expect-error — handler input type does not match inputSchema's output
  handler: async (commandInput: number) => {
    void commandInput;
  },
});

// Sanity: matching types still type-check.
new StandardSchemaCommand({
  commandId: 'OK',
  requiredEventStores: tuple(counterEventStore),
  inputSchema: stringSchema,
  outputSchema: numberSchema,
  handler: async commandInput => {
    void commandInput;
    return 7;
  },
});

// Without an outputSchema, OUTPUT must still be inferred from the handler's
// return type so callers see the actual handler shape (the common
// "trust the handler" pattern). Asserts the no-schema path is not
// regressed back to `Promise<any>` by an over-eager NoInfer.
const cmdWithInferredOutput = new StandardSchemaCommand({
  commandId: 'INFERRED_OUTPUT',
  requiredEventStores: tuple(counterEventStore),
  inputSchema: stringSchema,
  handler: async commandInput => {
    void commandInput;
    return { foo: 'bar' as const };
  },
});

const assertInferredOutputHandler: A.Equals<
  Awaited<ReturnType<typeof cmdWithInferredOutput.handler>>,
  { foo: 'bar' }
> = 1;
assertInferredOutputHandler;
