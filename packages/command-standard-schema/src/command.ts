import {
  Command,
  EventStore,
  $Contravariant,
  OnEventAlreadyExistsCallback,
} from '@hamstore/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

type InferInput<T extends StandardSchemaV1> = NonNullable<
  T['~standard']['types']
>['input'];

type InferOutput<T extends StandardSchemaV1> = NonNullable<
  T['~standard']['types']
>['output'];

const validateSchema = async (
  schema: StandardSchemaV1,
  value: unknown,
  label: string,
): Promise<unknown> => {
  const result = await schema['~standard'].validate(value);

  if (result.issues !== undefined) {
    const messages = result.issues.map(
      issue =>
        `${issue.message}${issue.path !== undefined ? ` (at ${String(issue.path.map(p => (typeof p === 'object' ? p.key : p)).join('.'))})` : ''}`,
    );

    throw new Error(`${label} validation failed: ${messages.join('; ')}`);
  }

  return result.value;
};

export class StandardSchemaCommand<
  COMMAND_ID extends string = string,
  EVENT_STORES extends EventStore[] = EventStore[],
  $EVENT_STORES extends EventStore[] = $Contravariant<
    EVENT_STORES,
    EventStore[]
  >,
  INPUT_SCHEMA extends StandardSchemaV1 = StandardSchemaV1,
  INPUT = $Contravariant<
    INPUT_SCHEMA,
    StandardSchemaV1,
    InferInput<INPUT_SCHEMA>
  >,
  HANDLER_INPUT = $Contravariant<
    INPUT_SCHEMA,
    StandardSchemaV1,
    InferOutput<INPUT_SCHEMA>
  >,
  OUTPUT_SCHEMA extends StandardSchemaV1 | undefined =
    | StandardSchemaV1
    | undefined,
  OUTPUT = $Contravariant<
    OUTPUT_SCHEMA,
    StandardSchemaV1,
    OUTPUT_SCHEMA extends StandardSchemaV1
      ? InferOutput<OUTPUT_SCHEMA>
      : never
  >,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CONTEXT extends any[] = any[],
> extends Command<
  COMMAND_ID,
  EVENT_STORES,
  $EVENT_STORES,
  INPUT,
  OUTPUT,
  CONTEXT
> {
  inputSchema: INPUT_SCHEMA;
  outputSchema?: OUTPUT_SCHEMA;

  constructor({
    handler,
    inputSchema,
    outputSchema,
    ...args
  }: Omit<
    {
      commandId: COMMAND_ID;
      requiredEventStores: EVENT_STORES;
      eventAlreadyExistsRetries?: number;
      onEventAlreadyExists?: OnEventAlreadyExistsCallback;
      inputSchema: INPUT_SCHEMA;
      outputSchema?: OUTPUT_SCHEMA;
    },
    'handler'
  > & {
    handler: (
      input: HANDLER_INPUT,
      eventStores: $EVENT_STORES,
      ...context: CONTEXT
    ) => Promise<OUTPUT>;
  }) {
    super({
      ...args,
      handler: async (input, eventStores, ...context) => {
        const validatedInput = (await validateSchema(
          inputSchema,
          input,
          'Input',
        )) as HANDLER_INPUT;

        const result = await handler(validatedInput, eventStores, ...context);

        if (outputSchema !== undefined) {
          return (await validateSchema(
            outputSchema,
            result,
            'Output',
          )) as OUTPUT;
        }

        return result;
      },
    });

    this.inputSchema = inputSchema;

    if (outputSchema !== undefined) {
      this.outputSchema = outputSchema;
    }
  }
}
