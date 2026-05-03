import {
  Command,
  EventStore,
  $Contravariant,
  OnEventAlreadyExistsCallback,
} from '@hamstore/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

import {
  isObjectForm,
  resolveValidateOption,
  validateSchema,
} from './validate';
import type { ValidateCommandOption } from './validate';

type InferInput<T extends StandardSchemaV1> = StandardSchemaV1.InferInput<T>;
type InferOutput<T extends StandardSchemaV1> = StandardSchemaV1.InferOutput<T>;

// Local polyfill so consumers on TypeScript < 5.4 (which doesn't ship a
// built-in `NoInfer`) can still consume the published `.d.ts`. On TS 5.4+
// this shadows the global with an equivalent definition.
// eslint-disable-next-line @typescript-eslint/no-shadow
type NoInfer<T> = [T][T extends unknown ? 0 : never];

const assertOutputSchemaPresent = (
  validate: ValidateCommandOption | undefined,
  outputSchema: StandardSchemaV1 | undefined,
): void => {
  if (validate === undefined || !isObjectForm(validate)) {
    return;
  }

  const { output } = validate;

  if (
    output !== undefined &&
    output !== false &&
    output !== 'auto' &&
    outputSchema === undefined
  ) {
    throw new Error(
      'validate.output is set but no outputSchema was provided',
    );
  }
};

const buildValidatingHandler = <HANDLER_INPUT, OUTPUT>(
  inputSchema: StandardSchemaV1,
  outputSchema: StandardSchemaV1 | undefined,
  validate: ValidateCommandOption | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (...args: any[]) => Promise<OUTPUT>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): ((...args: any[]) => Promise<OUTPUT>) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (input: any, eventStores: any, ...context: any[]) => {
    let inputValidate = resolveValidateOption(validate, 'input');
    if (inputValidate === 'auto') {
      inputValidate = true;
    }

    const validatedInput = (await validateSchema(
      inputSchema,
      input,
      'Input',
      inputValidate,
    )) as HANDLER_INPUT;

    const result = await handler(validatedInput, eventStores, ...context);

    if (outputSchema !== undefined) {
      let outputValidate = resolveValidateOption(validate, 'output');
      if (outputValidate === 'auto') {
        outputValidate = true;
      }

      return (await validateSchema(
        outputSchema,
        result,
        'Output',
        outputValidate,
      )) as OUTPUT;
    }

    return result;
  };
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
  // OUTPUT is constrained so handlers can't disagree with `outputSchema`
  // (the castore-dev/castore#194 bug). When no `outputSchema` is provided
  // the constraint is `unknown`, so `OUTPUT` can still be inferred from
  // the handler's return type — preserving the common "trust the handler"
  // pattern.
  OUTPUT extends OUTPUT_SCHEMA extends StandardSchemaV1
    ? InferOutput<OUTPUT_SCHEMA>
    : unknown = $Contravariant<
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
  validate?: ValidateCommandOption;

  constructor({
    handler,
    inputSchema,
    outputSchema,
    validate,
    ...args
  }: Omit<
    {
      commandId: COMMAND_ID;
      requiredEventStores: EVENT_STORES;
      eventAlreadyExistsRetries?: number;
      onEventAlreadyExists?: OnEventAlreadyExistsCallback;
      inputSchema: INPUT_SCHEMA;
      outputSchema?: OUTPUT_SCHEMA;
      validate?: ValidateCommandOption;
    },
    'handler'
  > & {
    handler: (
      input: NoInfer<HANDLER_INPUT>,
      eventStores: $EVENT_STORES,
      ...context: CONTEXT
    ) => Promise<OUTPUT>;
  }) {
    assertOutputSchemaPresent(validate, outputSchema);

    super({
      ...args,
      handler: buildValidatingHandler<HANDLER_INPUT, OUTPUT>(
        inputSchema,
        outputSchema,
        validate,
        handler,
      ),
    });

    this.inputSchema = inputSchema;

    if (outputSchema !== undefined) {
      this.outputSchema = outputSchema;
    }

    if (validate !== undefined) {
      this.validate = validate;
    }
  }
}
