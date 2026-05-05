import {
  EventType,
  type EventDetail,
  type EventDetailParser,
  type ParsedEventDetail,
} from '@hamstore/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';

type InferOutput<T extends StandardSchemaV1> = StandardSchemaV1.InferOutput<T>;

// --- shared low-level helpers (kept identical with @hamstore/command-standard-schema) ---

const formatIssueMessage = (
  issue: StandardSchemaV1.Issue,
  label: string,
): string =>
  `${label} validation failed: ${issue.message}${issue.path !== undefined ? ` (at ${String(issue.path.map(p => (typeof p === 'object' ? p.key : p)).join('.'))})` : ''}`;

const runSchema = async <SCHEMA extends StandardSchemaV1>(
  schema: SCHEMA,
  value: unknown,
  label: string,
): Promise<{ errors: Error[]; value?: InferOutput<SCHEMA> }> => {
  const result = await schema['~standard'].validate(value);

  if (result.issues !== undefined) {
    return {
      errors: result.issues.map(
        issue => new Error(formatIssueMessage(issue, label)),
      ),
    };
  }

  return { errors: [], value: result.value };
};

export class StandardSchemaEventType<
  TYPE extends string = string,
  PAYLOAD_SCHEMA extends StandardSchemaV1 | undefined =
    | StandardSchemaV1
    | undefined,
  PAYLOAD = StandardSchemaV1 extends PAYLOAD_SCHEMA
    ? string extends TYPE
      ? unknown
      : never
    : PAYLOAD_SCHEMA extends StandardSchemaV1
      ? InferOutput<PAYLOAD_SCHEMA>
      : never,
  METADATA_SCHEMA extends StandardSchemaV1 | undefined =
    | StandardSchemaV1
    | undefined,
  METADATA = StandardSchemaV1 extends METADATA_SCHEMA
    ? string extends TYPE
      ? unknown
      : never
    : METADATA_SCHEMA extends StandardSchemaV1
      ? InferOutput<METADATA_SCHEMA>
      : never,
> extends EventType<TYPE, PAYLOAD, METADATA> {
  payloadSchema?: PAYLOAD_SCHEMA;
  metadataSchema?: METADATA_SCHEMA;

  constructor({
    type,
    payloadSchema,
    metadataSchema,
  }: {
    type: TYPE;
    payloadSchema?: PAYLOAD_SCHEMA;
    metadataSchema?: METADATA_SCHEMA;
  }) {
    const parseEventDetail: EventDetailParser<TYPE, PAYLOAD, METADATA> = async (
      candidate: EventDetail,
    ): Promise<ParsedEventDetail<EventDetail<TYPE, PAYLOAD, METADATA>>> => {
      const errors: Error[] = [];

      let parsedPayload = candidate.payload as PAYLOAD;
      let parsedMetadata = candidate.metadata as METADATA;

      if (payloadSchema !== undefined) {
        const { errors: payloadErrors, value } = await runSchema(
          payloadSchema,
          candidate.payload,
          'Payload',
        );
        errors.push(...payloadErrors);
        if (payloadErrors.length === 0) {
          parsedPayload = value as PAYLOAD;
        }
      }

      if (metadataSchema !== undefined) {
        const { errors: metadataErrors, value } = await runSchema(
          metadataSchema,
          candidate.metadata,
          'Metadata',
        );
        errors.push(...metadataErrors);
        if (metadataErrors.length === 0) {
          parsedMetadata = value as METADATA;
        }
      }

      if (errors.length > 0) {
        return {
          isValid: false,
          parsingErrors: errors as [Error, ...Error[]],
        };
      }

      return {
        isValid: true,
        parsedEventDetail: {
          ...candidate,
          type: candidate.type as TYPE,
          payload: parsedPayload as PAYLOAD,
          metadata: parsedMetadata as METADATA,
        } as unknown as EventDetail<TYPE, PAYLOAD, METADATA>,
      };
    };

    super({ type, parseEventDetail });

    if (payloadSchema !== undefined) {
      this.payloadSchema = payloadSchema;
    }

    if (metadataSchema !== undefined) {
      this.metadataSchema = metadataSchema;
    }
  }
}
