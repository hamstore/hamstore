import type { StandardSchemaV1 } from '@standard-schema/spec';

type InferOutput<T extends StandardSchemaV1> = StandardSchemaV1.InferOutput<T>;

export type ValidateOption =
  | boolean
  | 'auto'
  | 'warn'
  | ((error: Error) => void);

export type ValidateCommandOption =
  | ValidateOption
  | { input?: ValidateOption; output?: ValidateOption };

// --- shared low-level helpers (kept identical with @hamstore/event-type-standard-schema) ---

type RunSchemaResult<T> =
  | { value: T; errors?: never }
  | { errors: Error[]; value?: never };

const formatIssueMessage = (
  issue: StandardSchemaV1.Issue,
  label: string,
): string =>
  `${label} validation failed: ${issue.message}${issue.path !== undefined ? ` (at ${String(issue.path.map(p => (typeof p === 'object' ? p.key : p)).join('.'))})` : ''}`;

const runSchema = async <SCHEMA extends StandardSchemaV1>(
  schema: SCHEMA,
  value: unknown,
  label: string,
): Promise<RunSchemaResult<InferOutput<SCHEMA>>> => {
  const result = await schema['~standard'].validate(value);

  if (result.issues !== undefined) {
    return {
      errors: result.issues.map(
        issue => new Error(formatIssueMessage(issue, label)),
      ),
    };
  }

  return { value: result.value };
};

// --- command-specific policy ---

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
): Promise<InferOutput<SCHEMA>> => {
  if (validate === false) {
    return value as InferOutput<SCHEMA>;
  }

  const result = await runSchema(schema, value, label);

  if (result.errors === undefined) {
    return result.value;
  }

  const error = new Error(result.errors.map(e => e.message).join('; '));

  if (validate === true) {
    throw error;
  }

  if (validate === 'warn') {
    console.warn(error.message);
  }

  if (typeof validate === 'function') {
    validate(error);
  }

  return value as InferOutput<SCHEMA>;
};
