import {
  Command,
  EventStore,
  $Contravariant,
  OnEventAlreadyExistsCallback,
} from '@hamstore/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

type InferOutput<T extends StandardSchemaV1> = NonNullable<
  T['~standard']['types']
>['output'];

export class StandardSchemaCommand<
  COMMAND_ID extends string = string,
  EVENT_STORES extends EventStore[] = EventStore[],
  $EVENT_STORES extends EventStore[] = $Contravariant<
    EVENT_STORES,
    EventStore[]
  >,
  INPUT_SCHEMA extends StandardSchemaV1 | undefined =
    | StandardSchemaV1
    | undefined,
  INPUT = $Contravariant<
    INPUT_SCHEMA,
    StandardSchemaV1,
    INPUT_SCHEMA extends StandardSchemaV1 ? InferOutput<INPUT_SCHEMA> : never
  >,
  OUTPUT_SCHEMA extends StandardSchemaV1 | undefined =
    | StandardSchemaV1
    | undefined,
  OUTPUT = $Contravariant<
    OUTPUT_SCHEMA,
    StandardSchemaV1,
    OUTPUT_SCHEMA extends StandardSchemaV1 ? InferOutput<OUTPUT_SCHEMA> : never
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
  inputSchema?: INPUT_SCHEMA;
  outputSchema?: OUTPUT_SCHEMA;

  constructor({
    commandId,
    requiredEventStores,
    eventAlreadyExistsRetries,
    onEventAlreadyExists,
    handler,
    inputSchema,
    outputSchema,
  }: {
    commandId: COMMAND_ID;
    requiredEventStores: EVENT_STORES;
    eventAlreadyExistsRetries?: number;
    onEventAlreadyExists?: OnEventAlreadyExistsCallback;
    handler: (
      input: INPUT,
      eventStores: $EVENT_STORES,
      ...context: CONTEXT
    ) => Promise<OUTPUT>;
    inputSchema?: INPUT_SCHEMA;
    outputSchema?: OUTPUT_SCHEMA;
  }) {
    super({
      commandId,
      requiredEventStores,
      eventAlreadyExistsRetries,
      onEventAlreadyExists,
      handler,
    });

    if (inputSchema !== undefined) {
      this.inputSchema = inputSchema;
    }

    if (outputSchema !== undefined) {
      this.outputSchema = outputSchema;
    }
  }
}
