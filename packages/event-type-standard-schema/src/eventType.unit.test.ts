/* eslint-disable max-lines */
import type { EventTypeDetail } from '@hamstore/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { A } from 'ts-toolbelt';

import { StandardSchemaEventType } from './eventType';

// Mock Standard Schema factory for testing

const createMockSchema = <I, O = I>(
  validateFn: (
    value: unknown,
  ) => StandardSchemaV1.Result<O> | Promise<StandardSchemaV1.Result<O>>,
): StandardSchemaV1<I, O> =>
  ({
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: validateFn,
    },
  }) as StandardSchemaV1<I, O>;

const expectedProperties = new Set([
  '_types',
  'type',
  'parseEventDetail',
  'payloadSchema',
  'metadataSchema',
]);

describe('standardSchemaEventType implementation', () => {
  const type = 'SOMETHING_HAPPENED';

  const payloadSchema = createMockSchema<{ message: string }>(value => {
    const obj = value as Record<string, unknown>;
    if (typeof obj?.message === 'string') {
      return { value: obj as { message: string } };
    }

    return { issues: [{ message: 'Expected object with message: string' }] };
  });

  type Payload = StandardSchemaV1.InferOutput<typeof payloadSchema>;

  const metadataSchema = createMockSchema<{ userEmail: string }>(value => {
    const obj = value as Record<string, unknown>;
    if (typeof obj?.userEmail === 'string') {
      return { value: obj as { userEmail: string } };
    }

    return {
      issues: [{ message: 'Expected object with userEmail: string' }],
    };
  });

  type Metadata = StandardSchemaV1.InferOutput<typeof metadataSchema>;

  it('has correct properties (no payload, no metadata)', () => {
    const simpleEventType = new StandardSchemaEventType({ type });

    const assertExtends: A.Extends<
      typeof simpleEventType,
      StandardSchemaEventType
    > = 1;
    assertExtends;

    type SimpleEventTypeDetail = EventTypeDetail<typeof simpleEventType>;
    const assertSimpleEventTypeDetail: A.Equals<
      SimpleEventTypeDetail,
      {
        aggregateId: string;
        version: number;
        type: typeof type;
        timestamp: string;
      }
    > = 1;
    assertSimpleEventTypeDetail;

    expect(new Set(Object.keys(simpleEventType))).toStrictEqual(
      expectedProperties,
    );
    expect(simpleEventType.type).toStrictEqual(type);
    expect(simpleEventType.payloadSchema).toStrictEqual(undefined);
    expect(simpleEventType.metadataSchema).toStrictEqual(undefined);
  });

  it('has correct properties (with payload, no metadata)', () => {
    const payloadEventType = new StandardSchemaEventType({
      type,
      payloadSchema,
    });

    const assertExtends: A.Extends<
      typeof payloadEventType,
      StandardSchemaEventType
    > = 1;
    assertExtends;

    type PayloadEventTypeDetail = EventTypeDetail<typeof payloadEventType>;
    const assertPayloadEventTypeDetail: A.Equals<
      PayloadEventTypeDetail,
      {
        aggregateId: string;
        version: number;
        type: typeof type;
        timestamp: string;
        payload: Payload;
      }
    > = 1;
    assertPayloadEventTypeDetail;

    expect(new Set(Object.keys(payloadEventType))).toStrictEqual(
      expectedProperties,
    );
    expect(payloadEventType.type).toStrictEqual(type);
    expect(payloadEventType.payloadSchema).toStrictEqual(payloadSchema);
    expect(payloadEventType.metadataSchema).toStrictEqual(undefined);
  });

  it('has correct properties (no payload, with metadata)', () => {
    const metadataEventType = new StandardSchemaEventType({
      type,
      metadataSchema,
    });

    const assertExtends: A.Extends<
      typeof metadataEventType,
      StandardSchemaEventType
    > = 1;
    assertExtends;

    type MetadataEventTypeDetail = EventTypeDetail<typeof metadataEventType>;
    const assertMetadataEventTypeDetail: A.Equals<
      MetadataEventTypeDetail,
      {
        aggregateId: string;
        version: number;
        type: typeof type;
        timestamp: string;
        metadata: Metadata;
      }
    > = 1;
    assertMetadataEventTypeDetail;

    expect(new Set(Object.keys(metadataEventType))).toStrictEqual(
      expectedProperties,
    );
    expect(metadataEventType.type).toStrictEqual(type);
    expect(metadataEventType.payloadSchema).toStrictEqual(undefined);
    expect(metadataEventType.metadataSchema).toStrictEqual(metadataSchema);
  });

  it('has correct properties (with payload, with metadata)', () => {
    const fullEventType = new StandardSchemaEventType({
      type,
      payloadSchema,
      metadataSchema,
    });

    const assertExtends: A.Extends<
      typeof fullEventType,
      StandardSchemaEventType
    > = 1;
    assertExtends;

    type FullEventTypeDetail = EventTypeDetail<typeof fullEventType>;
    const assertFullEventTypeDetail: A.Equals<
      FullEventTypeDetail,
      {
        aggregateId: string;
        version: number;
        type: typeof type;
        timestamp: string;
        payload: Payload;
        metadata: Metadata;
      }
    > = 1;
    assertFullEventTypeDetail;

    expect(new Set(Object.keys(fullEventType))).toStrictEqual(
      expectedProperties,
    );
    expect(fullEventType.type).toStrictEqual(type);
    expect(fullEventType.payloadSchema).toStrictEqual(payloadSchema);
    expect(fullEventType.metadataSchema).toStrictEqual(metadataSchema);
  });

  describe('parseEventDetail', () => {
    it('returns valid result for event with no schemas', async () => {
      const eventType = new StandardSchemaEventType({ type });

      const candidate = {
        aggregateId: 'agg-1',
        version: 1,
        type,
        timestamp: '2024-01-01',
      };

      const result = await eventType.parseEventDetail!(candidate);

      expect(result.isValid).toStrictEqual(true);
      if (result.isValid) {
        expect(result.parsedEventDetail.aggregateId).toStrictEqual('agg-1');
        expect(result.parsedEventDetail.version).toStrictEqual(1);
        expect(result.parsedEventDetail.type).toStrictEqual(type);
        expect(result.parsedEventDetail.timestamp).toStrictEqual('2024-01-01');
      }
    });

    it('returns valid result for valid payload', async () => {
      const eventType = new StandardSchemaEventType({
        type,
        payloadSchema,
      });

      const candidate = {
        aggregateId: 'agg-1',
        version: 1,
        type,
        timestamp: '2024-01-01',
        payload: { message: 'hello' },
      };

      const result = await eventType.parseEventDetail!(candidate);

      expect(result.isValid).toStrictEqual(true);
      if (result.isValid) {
        expect(result.parsedEventDetail.payload).toStrictEqual({
          message: 'hello',
        });
      }
    });

    it('returns invalid result for invalid payload', async () => {
      const eventType = new StandardSchemaEventType({
        type,
        payloadSchema,
      });

      const candidate = {
        aggregateId: 'agg-1',
        version: 1,
        type,
        timestamp: '2024-01-01',
        payload: { message: 123 },
      };

      const result = await eventType.parseEventDetail!(candidate);

      expect(result.isValid).toStrictEqual(false);
      if (!result.isValid) {
        expect(result.parsingErrors).toHaveLength(1);
        expect(result.parsingErrors[0].message).toContain(
          'Payload validation failed',
        );
      }
    });

    it('returns valid result for valid metadata', async () => {
      const eventType = new StandardSchemaEventType({
        type,
        metadataSchema,
      });

      const candidate = {
        aggregateId: 'agg-1',
        version: 1,
        type,
        timestamp: '2024-01-01',
        metadata: { userEmail: 'test@example.com' },
      };

      const result = await eventType.parseEventDetail!(candidate);

      expect(result.isValid).toStrictEqual(true);
      if (result.isValid) {
        expect(result.parsedEventDetail.metadata).toStrictEqual({
          userEmail: 'test@example.com',
        });
      }
    });

    it('returns invalid result for invalid metadata', async () => {
      const eventType = new StandardSchemaEventType({
        type,
        metadataSchema,
      });

      const candidate = {
        aggregateId: 'agg-1',
        version: 1,
        type,
        timestamp: '2024-01-01',
        metadata: { userEmail: 42 },
      };

      const result = await eventType.parseEventDetail!(candidate);

      expect(result.isValid).toStrictEqual(false);
      if (!result.isValid) {
        expect(result.parsingErrors).toHaveLength(1);
        expect(result.parsingErrors[0].message).toContain(
          'Metadata validation failed',
        );
      }
    });

    it('returns all errors when both payload and metadata are invalid', async () => {
      const eventType = new StandardSchemaEventType({
        type,
        payloadSchema,
        metadataSchema,
      });

      const candidate = {
        aggregateId: 'agg-1',
        version: 1,
        type,
        timestamp: '2024-01-01',
        payload: 'not-an-object',
        metadata: 42,
      };

      const result = await eventType.parseEventDetail!(candidate);

      expect(result.isValid).toStrictEqual(false);
      if (!result.isValid) {
        expect(result.parsingErrors).toHaveLength(2);
        expect(result.parsingErrors[0].message).toContain('Payload');
        expect(result.parsingErrors[1]!.message).toContain('Metadata');
      }
    });

    it('includes path information in error messages', async () => {
      const schemaWithPath = createMockSchema<{ nested: string }>(_value => ({
        issues: [
          {
            message: 'Required',
            path: [{ key: 'nested' }],
          },
        ],
      }));

      const eventType = new StandardSchemaEventType({
        type,
        payloadSchema: schemaWithPath,
      });

      const candidate = {
        aggregateId: 'agg-1',
        version: 1,
        type,
        timestamp: '2024-01-01',
        payload: {},
      };

      const result = await eventType.parseEventDetail!(candidate);

      expect(result.isValid).toStrictEqual(false);
      if (!result.isValid) {
        expect(result.parsingErrors[0].message).toContain('(at nested)');
      }
    });

    it('works with async validation', async () => {
      const asyncSchema = createMockSchema<{ value: string }>(
        async value => {
          await new Promise(resolve => setTimeout(resolve, 1));

          return { value: value as { value: string } };
        },
      );

      const eventType = new StandardSchemaEventType({
        type,
        payloadSchema: asyncSchema,
      });

      const candidate = {
        aggregateId: 'agg-1',
        version: 1,
        type,
        timestamp: '2024-01-01',
        payload: { value: 'test' },
      };

      const result = await eventType.parseEventDetail!(candidate);

      expect(result.isValid).toStrictEqual(true);
    });

    it('uses transformed output value from schema', async () => {
      const transformingSchema = createMockSchema<string, number>(value => {
        if (typeof value === 'string') {
          return { value: value.length };
        }

        return { issues: [{ message: 'Expected string' }] };
      });

      const eventType = new StandardSchemaEventType({
        type,
        payloadSchema: transformingSchema,
      });

      const candidate = {
        aggregateId: 'agg-1',
        version: 1,
        type,
        timestamp: '2024-01-01',
        payload: 'hello',
      };

      const result = await eventType.parseEventDetail!(candidate);

      expect(result.isValid).toStrictEqual(true);
      if (result.isValid) {
        expect(result.parsedEventDetail.payload).toStrictEqual(5);
      }
    });
  });
});
