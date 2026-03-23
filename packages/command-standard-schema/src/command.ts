import {
  Command,
  EventStore,
  $Contravariant,
  OnEventAlreadyExistsCallback,
} from '@hamstore/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

type InferInput<T extends StandardSchemaV1> = StandardSchemaV1.InferInput<T>;
type InferOutput<T extends StandardSchemaV1> = StandardSchemaV1.InferOutput<T>;

export type ValidateOption = boolean | 'auto' | 'warn' | ((error: Error) => void);
export type ValidateCommandOption =
  | ValidateOption
  | { input?: ValidateOption; output?: ValidateOption };

const buildValidationError = (
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
  label: string,
): Error => {
  const messages = issues.map(
    issue =>
      `${issue.message}${issue.path !== undefined ? ` (at ${String(issue.path.map(p => (typeof p === 'object' ? p.key : p)).join('.'))})` : ''}`,
  );

  return new Error(`${label} validation failed: ${messages.join('; ')}`);
};

const isObjectForm = (
  value: ValidateCommandOption,
): value is { input?: ValidateOption; output?: ValidateOption } =>
  typeof value === 'object' &&
  value !== null &&
  ('input' in value || 'output' in value);

const resolveValidateOption = (
  commandValidate: ValidateCommandOption | undefined,
  which: 'input' | 'output',
): ValidateOption => {
  if (commandValidate === undefined) {
    return which === 'output' ? 'auto' : true;
  }

  if (isObjectForm(commandValidate)) {
    return commandValidate[which] ?? (which === 'output' ? 'auto' : true);
  }

  // Shorthand: for output, treat true as 'auto' (validate if schema exists)
  if (which === 'output' && commandValidate === true) {
    return 'auto';
  }

  return commandValidate as ValidateOption;
};

const validateSchema = async (
  schema: StandardSchemaV1,
  value: unknown,
  label: string,
  validate: ValidateOption,
): Promise<unknown> => {
  if (validate === false) {
    return value;
  }

  const result = await schema['~standard'].validate(value);

  if (result.issues !== undefined) {
    const error = buildValidationError(result.issues, label);

    if (validate === true) {
      throw error;
    }

    if (validate === 'warn') {
      console.warn(error.message);
    }

    if (typeof validate === 'function') {
      validate(error);
    }

    return value;
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
      input: HANDLER_INPUT,
      eventStores: $EVENT_STORES,
      ...context: CONTEXT
    ) => Promise<OUTPUT>;
  }) {
    if (validate !== undefined && isObjectForm(validate)) {
      if (
        validate.output !== undefined &&
        validate.output !== false &&
        validate.output !== 'auto' &&
        outputSchema === undefined
      ) {
        throw new Error(
          'validate.output is set but no outputSchema was provided',
        );
      }
    }

    super({
      ...args,
      handler: async (input, eventStores, ...context) => {
        const inputValidate = resolveValidateOption(validate, 'input');
        const validatedInput = (await validateSchema(
          inputSchema,
          input,
          'Input',
          inputValidate,
        )) as HANDLER_INPUT;

        const result = await handler(validatedInput, eventStores, ...context);

        if (outputSchema !== undefined) {
          let outputValidate = resolveValidateOption(validate, 'output');

          // 'auto' means: validate if schema exists, skip if not
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
      },
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
