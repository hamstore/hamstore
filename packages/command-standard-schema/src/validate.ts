import type { StandardSchemaV1 } from '@standard-schema/spec';

export type ValidateOption =
  | boolean
  | 'auto'
  | 'warn'
  | ((error: Error) => void);

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

export const isObjectForm = (
  value: ValidateCommandOption,
): value is { input?: ValidateOption; output?: ValidateOption } =>
  typeof value === 'object' &&
  value !== null &&
  ('input' in value || 'output' in value);

export const resolveValidateOption = (
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

export const validateSchema = async <SCHEMA extends StandardSchemaV1>(
  schema: SCHEMA,
  value: unknown,
  label: string,
  validate: ValidateOption,
): Promise<StandardSchemaV1.InferOutput<SCHEMA>> => {
  if (validate === false) {
    return value as StandardSchemaV1.InferOutput<SCHEMA>;
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

    return value as StandardSchemaV1.InferOutput<SCHEMA>;
  }

  return result.value;
};
