/* eslint-disable max-lines */
import type { EventTypeDetail } from '@hamstore/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { A } from 'ts-toolbelt';

import { StandardSchemaEventType } from './eventType';

// Mock Standard Schema implementations for testing

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

const payloadSchema = createMockSchema<{ message: string }>(value => {
  const obj = value as Record<string, unknown>;
  if (typeof obj?.message === 'string') {
    return { value: obj as { message: string } };
  }

  return { issues: [{ message: 'Expected object with message: string' }] };
});

const metadataSchema = createMockSchema<{ userEmail: string }>(value => {
  const obj = value as Record<string, unknown>;
  if (typeof obj?.userEmail === 'string') {
    return { value: obj as { userEmail: string } };
  }

  return { issues: [{ message: 'Expected object with userEmail: string' }] };
});

const expectedProperties = new Set([
  'type',
  'payloadSchema',
  'metadataSchema',
  'parseEventDetail',
]);

describe('StandardSchemaEventType implementation', () => {
  const type = 'SOMETHING_HAPPENED';

  describe('construction', () => {
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

      // Without schemas, only type and parseEventDetail are set
      expect(simpleEventType.type).toBe(type);
      expect(simpleEventType.payloadSchema).toBeUndefined();
      expect(simpleEventType.metadataSchema).toBeUndefined();
      expect(simpleEventType.parseEventDetail).toBeDefined();
    });

    it('has correct properties (with payload, no metadata)', () => {
      const payloadEventType = new StandardSchemaEventType({
        type,
        payloadSchema,
      });

      expect(payloadEventType.type).toBe(type);
      expect(payloadEventType.payloadSchema).toBe(payloadSchema);
      expect(payloadEventType.metadataSchema).toBeUndefined();
      expect(payloadEventType.parseEventDetail).toBeDefined();
    });

    it('has correct properties (no payload, with metadata)', () => {
      const metadataEventType = new StandardSchemaEventType({
        type,
        metadataSchema,
      });

      expect(metadataEventType.type).toBe(type);
      expect(metadataEventType.payloadSchema).toBeUndefined();
      expect(metadataEventType.metadataSchema).toBe(metadataSchema);
      expect(metadataEventType.parseEventDetail).toBeDefined();
    });

    it('has correct properties (with payload, with metadata)', () => {
      const fullEventType = new StandardSchemaEventType({
        type,
        payloadSchema,
        metadataSchema,
      });

      expect(new Set(Object.keys(fullEventType))).toStrictEqual(
        expectedProperties,
      );
      expect(fullEventType.type).toBe(type);
      expect(fullEventType.payloadSchema).toBe(payloadSchema);
      expect(fullEventType.metadataSchema).toBe(metadataSchema);
    });
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

      expect(result.isValid).toBe(true);
      if (result.isValid) {
        expect(result.parsedEventDetail.aggregateId).toBe('agg-1');
        expect(result.parsedEventDetail.version).toBe(1);
        expect(result.parsedEventDetail.type).toBe(type);
        expect(result.parsedEventDetail.timestamp).toBe('2024-01-01');
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

      expect(result.isValid).toBe(true);
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

      expect(result.isValid).toBe(false);
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

      expect(result.isValid).toBe(true);
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

      expect(result.isValid).toBe(false);
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

      expect(result.isValid).toBe(false);
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

      expect(result.isValid).toBe(false);
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

      expect(result.isValid).toBe(true);
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

      expect(result.isValid).toBe(true);
      if (result.isValid) {
        expect(result.parsedEventDetail.payload).toBe(5);
      }
    });
  });
});
