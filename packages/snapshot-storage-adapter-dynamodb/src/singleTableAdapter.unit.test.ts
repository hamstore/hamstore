/* eslint-disable max-lines */
import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import type { Snapshot, SnapshotKey } from '@hamstore/core';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  MARSHALL_OPTIONS,
  SNAPSHOT_TABLE_AGGREGATE_KEY,
  SNAPSHOT_TABLE_AGGREGATE_VERSION_KEY,
  SNAPSHOT_TABLE_BY_REDUCER_VERSION_INDEX_NAME,
  SNAPSHOT_TABLE_EVENT_STORE_ID_KEY,
  SNAPSHOT_TABLE_GSI_PK_KEY,
  SNAPSHOT_TABLE_GSI_SK_KEY,
  SNAPSHOT_TABLE_PK,
  SNAPSHOT_TABLE_REDUCER_VERSION_KEY,
  SNAPSHOT_TABLE_SAVED_AT_KEY,
  SNAPSHOT_TABLE_SK,
  VERSION_PADDING_WIDTH,
} from './constants';
import { DynamoDBSingleTableSnapshotStorageAdapter } from './singleTableAdapter';

const dynamoDBClientMock = mockClient(DynamoDBClient);

const dynamoDBTableName = 'my-table-name';
const eventStoreId = 'POKEMONS';
const otherEventStoreId = 'TRAINERS';
const reducerV1 = 'rv1';
const reducerV2 = 'rv2';

const padVersion = (v: number) => String(v).padStart(VERSION_PADDING_WIDTH, '0');

const buildStoredItem = (snapshot: Snapshot) => ({
  [SNAPSHOT_TABLE_PK]: `${snapshot.eventStoreId}#${snapshot.aggregate.aggregateId}`,
  [SNAPSHOT_TABLE_SK]: `${padVersion(snapshot.aggregate.version)}#${snapshot.reducerVersion}`,
  [SNAPSHOT_TABLE_AGGREGATE_KEY]: snapshot.aggregate,
  [SNAPSHOT_TABLE_AGGREGATE_VERSION_KEY]: snapshot.aggregate.version,
  [SNAPSHOT_TABLE_REDUCER_VERSION_KEY]: snapshot.reducerVersion,
  [SNAPSHOT_TABLE_EVENT_STORE_ID_KEY]: snapshot.eventStoreId,
  [SNAPSHOT_TABLE_SAVED_AT_KEY]: snapshot.savedAt,
  [SNAPSHOT_TABLE_GSI_PK_KEY]: `${snapshot.eventStoreId}#${snapshot.reducerVersion}`,
  [SNAPSHOT_TABLE_GSI_SK_KEY]: `${snapshot.aggregate.aggregateId}#${padVersion(snapshot.aggregate.version)}`,
});

const makeSnapshot = (
  aggregateId: string,
  version: number,
  reducerVersion: string,
  { extra = {}, savedAt }: { extra?: Record<string, unknown>; savedAt?: string } = {},
): Snapshot => ({
  aggregate: { aggregateId, version, ...extra },
  reducerVersion,
  eventStoreId,
  savedAt: savedAt ?? new Date(version * 1000).toISOString(),
});

describe('DynamoDBSingleTableSnapshotStorageAdapter', () => {
  beforeEach(() => {
    dynamoDBClientMock.reset();
    dynamoDBClientMock.on(PutItemCommand).resolves({});
    dynamoDBClientMock.on(GetItemCommand).resolves({});
    dynamoDBClientMock.on(DeleteItemCommand).resolves({});
    dynamoDBClientMock.on(QueryCommand).resolves({});
  });

  const adapter = new DynamoDBSingleTableSnapshotStorageAdapter({
    tableName: dynamoDBTableName,
    dynamoDBClient: dynamoDBClientMock as unknown as DynamoDBClient,
  });

  describe('putSnapshot', () => {
    it('sends a PutItemCommand with the encoded layout', async () => {
      const snapshot = makeSnapshot('a1', 7, reducerV1, {
        extra: { name: 'Pikachu' },
      });

      await adapter.putSnapshot(snapshot, { eventStoreId });

      expect(dynamoDBClientMock.calls()).toHaveLength(1);
      expect(dynamoDBClientMock.call(0).args[0].input).toStrictEqual({
        TableName: dynamoDBTableName,
        Item: marshall(buildStoredItem(snapshot), MARSHALL_OPTIONS),
      });
    });

    it('rejects when context.eventStoreId does not match the snapshot', async () => {
      const snapshot = makeSnapshot('a1', 1, reducerV1);

      await expect(
        adapter.putSnapshot(snapshot, { eventStoreId: otherEventStoreId }),
      ).rejects.toThrow(/eventStoreId/);

      expect(dynamoDBClientMock.calls()).toHaveLength(0);
    });
  });

  describe('getSnapshot', () => {
    it('sends a GetItemCommand with the encoded key', async () => {
      const snapshotKey: SnapshotKey = {
        aggregateId: 'a1',
        aggregateVersion: 5,
        reducerVersion: reducerV1,
        savedAt: new Date(5000).toISOString(),
      };

      await adapter.getSnapshot(snapshotKey, { eventStoreId });

      expect(dynamoDBClientMock.calls()).toHaveLength(1);
      expect(dynamoDBClientMock.call(0).args[0].input).toStrictEqual({
        TableName: dynamoDBTableName,
        Key: marshall(
          {
            [SNAPSHOT_TABLE_PK]: `${eventStoreId}#a1`,
            [SNAPSHOT_TABLE_SK]: `${padVersion(5)}#${reducerV1}`,
          },
          MARSHALL_OPTIONS,
        ),
        ConsistentRead: true,
      });
    });

    it('returns undefined when DynamoDB returns no item', async () => {
      dynamoDBClientMock.on(GetItemCommand).resolves({});

      const result = await adapter.getSnapshot(
        {
          aggregateId: 'gone',
          aggregateVersion: 1,
          reducerVersion: reducerV1,
          savedAt: new Date().toISOString(),
        },
        { eventStoreId },
      );

      expect(result.snapshot).toBeUndefined();
    });

    it('parses the returned item back into a Snapshot', async () => {
      const snapshot = makeSnapshot('a1', 5, reducerV1, {
        extra: { name: 'Pikachu' },
      });

      dynamoDBClientMock.on(GetItemCommand).resolves({
        Item: marshall(buildStoredItem(snapshot), MARSHALL_OPTIONS),
      });

      const result = await adapter.getSnapshot(
        {
          aggregateId: 'a1',
          aggregateVersion: 5,
          reducerVersion: reducerV1,
          savedAt: snapshot.savedAt,
        },
        { eventStoreId },
      );

      expect(result.snapshot).toEqual(snapshot);
    });
  });

  describe('getLatestSnapshot', () => {
    it('issues a descending Limit:1 main-table query for the unbounded case', async () => {
      await adapter.getLatestSnapshot('a1', { eventStoreId });

      expect(dynamoDBClientMock.calls()).toHaveLength(1);
      const input = dynamoDBClientMock.call(0).args[0].input as {
        TableName: string;
        KeyConditionExpression: string;
        ExpressionAttributeNames: Record<string, string>;
        ScanIndexForward: boolean;
        Limit: number;
        ConsistentRead: boolean;
      };
      expect(input.TableName).toBe(dynamoDBTableName);
      expect(input.KeyConditionExpression).toBe('#pk = :pk');
      expect(input.ExpressionAttributeNames).toEqual({
        '#pk': SNAPSHOT_TABLE_PK,
      });
      expect(input.ScanIndexForward).toBe(false);
      expect(input.Limit).toBe(1);
      expect(input.ConsistentRead).toBe(true);
    });

    it('adds an SK upper bound when aggregateMaxVersion is provided', async () => {
      await adapter.getLatestSnapshot(
        'a1',
        { eventStoreId },
        { aggregateMaxVersion: 50 },
      );

      const input = dynamoDBClientMock.call(0).args[0].input as {
        KeyConditionExpression: string;
        ExpressionAttributeNames: Record<string, string>;
        ExpressionAttributeValues: Record<string, unknown>;
      };
      expect(input.KeyConditionExpression).toBe('#pk = :pk AND #sk <= :maxSk');
      expect(input.ExpressionAttributeNames).toEqual({
        '#pk': SNAPSHOT_TABLE_PK,
        '#sk': SNAPSHOT_TABLE_SK,
      });
      expect(input.ExpressionAttributeValues).toMatchObject(
        marshall(
          { ':pk': `${eventStoreId}#a1`, ':maxSk': `${padVersion(50)}#\uffff` },
          MARSHALL_OPTIONS,
        ),
      );
    });

    it('adds a FilterExpression when reducerVersion is provided', async () => {
      await adapter.getLatestSnapshot(
        'a1',
        { eventStoreId },
        { reducerVersion: reducerV2 },
      );

      const input = dynamoDBClientMock.call(0).args[0].input as {
        FilterExpression?: string;
        ExpressionAttributeNames: Record<string, string>;
        Limit: number;
      };
      expect(input.FilterExpression).toBe(
        '#reducerVersion = :reducerVersion',
      );
      expect(input.ExpressionAttributeNames).toMatchObject({
        '#reducerVersion': SNAPSHOT_TABLE_REDUCER_VERSION_KEY,
      });
      expect(input.Limit).toBe(16);
    });

    it('returns undefined when the query returns no items', async () => {
      dynamoDBClientMock.on(QueryCommand).resolves({ Items: [] });

      const result = await adapter.getLatestSnapshot('a1', { eventStoreId });

      expect(result.snapshot).toBeUndefined();
    });

    it('returns the parsed first item when the query returns a match', async () => {
      const snapshot = makeSnapshot('a1', 7, reducerV1);

      dynamoDBClientMock.on(QueryCommand).resolves({
        Items: [marshall(buildStoredItem(snapshot), MARSHALL_OPTIONS)],
      });

      const result = await adapter.getLatestSnapshot('a1', { eventStoreId });

      expect(result.snapshot).toEqual(snapshot);
    });

    it('paginates with ExclusiveStartKey when filter rejects every item on a page', async () => {
      const snapshot = makeSnapshot('a1', 4, reducerV2);
      const lastEvaluatedKey = marshall(
        {
          [SNAPSHOT_TABLE_PK]: `${eventStoreId}#a1`,
          [SNAPSHOT_TABLE_SK]: `${padVersion(5)}#${reducerV1}`,
        },
        MARSHALL_OPTIONS,
      );

      dynamoDBClientMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [], LastEvaluatedKey: lastEvaluatedKey })
        .resolves({
          Items: [marshall(buildStoredItem(snapshot), MARSHALL_OPTIONS)],
        });

      const result = await adapter.getLatestSnapshot(
        'a1',
        { eventStoreId },
        { reducerVersion: reducerV2 },
      );

      expect(result.snapshot).toEqual(snapshot);
      expect(dynamoDBClientMock.calls()).toHaveLength(2);
      const secondInput = dynamoDBClientMock.call(1).args[0].input as {
        ExclusiveStartKey: Record<string, unknown>;
      };
      expect(secondInput.ExclusiveStartKey).toEqual(lastEvaluatedKey);
    });

    it('paginates indefinitely until LastEvaluatedKey is undefined', async () => {
      // Issue many empty pages followed by a match, to confirm the adapter
      // does not bound the loop and silently miss matches.
      const snapshot = makeSnapshot('a1', 100, reducerV2);
      const emptyPageKey = (i: number) =>
        marshall(
          {
            [SNAPSHOT_TABLE_PK]: `${eventStoreId}#a1`,
            [SNAPSHOT_TABLE_SK]: `${padVersion(1000 - i)}#${reducerV1}`,
          },
          MARSHALL_OPTIONS,
        );

      const numEmptyPages = 64;
      let mock = dynamoDBClientMock.on(QueryCommand);
      for (let i = 0; i < numEmptyPages; i += 1) {
        mock = mock.resolvesOnce({
          Items: [],
          LastEvaluatedKey: emptyPageKey(i),
        });
      }
      mock.resolves({
        Items: [marshall(buildStoredItem(snapshot), MARSHALL_OPTIONS)],
      });

      const result = await adapter.getLatestSnapshot(
        'a1',
        { eventStoreId },
        { reducerVersion: reducerV2 },
      );

      expect(result.snapshot).toEqual(snapshot);
      expect(dynamoDBClientMock.calls()).toHaveLength(numEmptyPages + 1);
    });
  });

  describe('deleteSnapshot', () => {
    it('sends a DeleteItemCommand with the encoded key', async () => {
      const snapshotKey: SnapshotKey = {
        aggregateId: 'a1',
        aggregateVersion: 5,
        reducerVersion: reducerV1,
        savedAt: new Date(5000).toISOString(),
      };

      await adapter.deleteSnapshot(snapshotKey, { eventStoreId });

      expect(dynamoDBClientMock.calls()).toHaveLength(1);
      expect(dynamoDBClientMock.call(0).args[0].input).toStrictEqual({
        TableName: dynamoDBTableName,
        Key: marshall(
          {
            [SNAPSHOT_TABLE_PK]: `${eventStoreId}#a1`,
            [SNAPSHOT_TABLE_SK]: `${padVersion(5)}#${reducerV1}`,
          },
          MARSHALL_OPTIONS,
        ),
      });
    });
  });

  describe('listSnapshots', () => {
    it('rejects when neither aggregateId nor reducerVersion is provided', async () => {
      await expect(
        adapter.listSnapshots({ eventStoreId }),
      ).rejects.toThrow(/aggregateId or reducerVersion/);
    });

    it('queries the main table when aggregateId is provided', async () => {
      await adapter.listSnapshots(
        { eventStoreId },
        { aggregateId: 'a1', limit: 10 },
      );

      expect(dynamoDBClientMock.calls()).toHaveLength(1);
      const input = dynamoDBClientMock.call(0).args[0].input as {
        TableName: string;
        IndexName?: string;
        KeyConditionExpression: string;
        Limit: number;
      };
      expect(input.TableName).toBe(dynamoDBTableName);
      expect(input.IndexName).toBeUndefined();
      expect(input.KeyConditionExpression).toBe('#pk = :pk');
      expect(input.Limit).toBe(10);
    });

    it('adds an SK BETWEEN clause when minVersion and maxVersion are both provided', async () => {
      await adapter.listSnapshots(
        { eventStoreId },
        { aggregateId: 'a1', minVersion: 3, maxVersion: 7 },
      );

      const input = dynamoDBClientMock.call(0).args[0].input as {
        KeyConditionExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
      };
      expect(input.KeyConditionExpression).toBe(
        '#pk = :pk AND #sk BETWEEN :minSk AND :maxSk',
      );
      expect(input.ExpressionAttributeValues).toMatchObject(
        marshall(
          {
            ':pk': `${eventStoreId}#a1`,
            ':minSk': `${padVersion(3)}#`,
            ':maxSk': `${padVersion(7)}#\uffff`,
          },
          MARSHALL_OPTIONS,
        ),
      );
    });

    it('queries the GSI when only reducerVersion is provided', async () => {
      await adapter.listSnapshots(
        { eventStoreId },
        { reducerVersion: reducerV2, limit: 25 },
      );

      const input = dynamoDBClientMock.call(0).args[0].input as {
        IndexName?: string;
        KeyConditionExpression: string;
        ExpressionAttributeNames: Record<string, string>;
        ExpressionAttributeValues: Record<string, unknown>;
      };
      expect(input.IndexName).toBe(
        SNAPSHOT_TABLE_BY_REDUCER_VERSION_INDEX_NAME,
      );
      expect(input.KeyConditionExpression).toBe('#gsiPk = :gsiPk');
      expect(input.ExpressionAttributeNames).toEqual({
        '#gsiPk': SNAPSHOT_TABLE_GSI_PK_KEY,
      });
      expect(input.ExpressionAttributeValues).toMatchObject(
        marshall(
          { ':gsiPk': `${eventStoreId}#${reducerV2}` },
          MARSHALL_OPTIONS,
        ),
      );
    });

    it('passes reverse and limit through', async () => {
      await adapter.listSnapshots(
        { eventStoreId },
        { aggregateId: 'a1', reverse: true, limit: 5 },
      );

      const input = dynamoDBClientMock.call(0).args[0].input as {
        ScanIndexForward: boolean;
        Limit: number;
      };
      expect(input.ScanIndexForward).toBe(false);
      expect(input.Limit).toBe(5);
    });

    it('returns parsed snapshot keys and a nextPageToken when DynamoDB paginates', async () => {
      const snapshot = makeSnapshot('a1', 4, reducerV1);
      const lastEvaluatedKey = marshall(
        {
          [SNAPSHOT_TABLE_PK]: `${eventStoreId}#a1`,
          [SNAPSHOT_TABLE_SK]: `${padVersion(4)}#${reducerV1}`,
        },
        MARSHALL_OPTIONS,
      );

      dynamoDBClientMock.on(QueryCommand).resolves({
        Items: [marshall(buildStoredItem(snapshot), MARSHALL_OPTIONS)],
        LastEvaluatedKey: lastEvaluatedKey,
      });

      const { snapshotKeys, nextPageToken } = await adapter.listSnapshots(
        { eventStoreId },
        { aggregateId: 'a1' },
      );

      expect(snapshotKeys).toEqual([
        {
          aggregateId: 'a1',
          aggregateVersion: 4,
          reducerVersion: reducerV1,
          savedAt: snapshot.savedAt,
        },
      ]);
      expect(nextPageToken).toBeDefined();

      // Pass it back in and confirm we forward it as ExclusiveStartKey.
      await adapter.listSnapshots(
        { eventStoreId },
        { aggregateId: 'a1', pageToken: nextPageToken },
      );

      const secondInput = dynamoDBClientMock.call(1).args[0].input as {
        ExclusiveStartKey: Record<string, unknown>;
      };
      expect(secondInput.ExclusiveStartKey).toEqual(lastEvaluatedKey);
    });

    it('rejects an invalid pageToken', async () => {
      await expect(
        adapter.listSnapshots(
          { eventStoreId },
          { aggregateId: 'a1', pageToken: 'not-json' },
        ),
      ).rejects.toThrow(/invalid pageToken/);
    });

    it('preserves applied filter options across paginated calls via the pageToken', async () => {
      const snapshot = makeSnapshot('a1', 4, reducerV1);
      const lastEvaluatedKey = marshall(
        {
          [SNAPSHOT_TABLE_PK]: `${eventStoreId}#a1`,
          [SNAPSHOT_TABLE_SK]: `${padVersion(4)}#${reducerV1}`,
        },
        MARSHALL_OPTIONS,
      );

      dynamoDBClientMock.on(QueryCommand).resolves({
        Items: [marshall(buildStoredItem(snapshot), MARSHALL_OPTIONS)],
        LastEvaluatedKey: lastEvaluatedKey,
      });

      const { nextPageToken } = await adapter.listSnapshots(
        { eventStoreId },
        { aggregateId: 'a1', minVersion: 2, maxVersion: 9, limit: 7, reverse: true },
      );

      // Caller passes only the pageToken on the next call; the filter options
      // should be carried forward from the token, not lost.
      await adapter.listSnapshots(
        { eventStoreId },
        { pageToken: nextPageToken },
      );

      const secondInput = dynamoDBClientMock.call(1).args[0].input as {
        KeyConditionExpression: string;
        ExpressionAttributeValues: Record<string, unknown>;
        Limit: number;
        ScanIndexForward: boolean;
        ExclusiveStartKey: Record<string, unknown>;
      };
      expect(secondInput.KeyConditionExpression).toBe(
        '#pk = :pk AND #sk BETWEEN :minSk AND :maxSk',
      );
      expect(secondInput.Limit).toBe(7);
      expect(secondInput.ScanIndexForward).toBe(false);
      expect(secondInput.ExclusiveStartKey).toEqual(lastEvaluatedKey);
    });

    it('lets caller-passed options override token-stored options', async () => {
      const lastEvaluatedKey = marshall(
        {
          [SNAPSHOT_TABLE_PK]: `${eventStoreId}#a1`,
          [SNAPSHOT_TABLE_SK]: `${padVersion(4)}#${reducerV1}`,
        },
        MARSHALL_OPTIONS,
      );

      dynamoDBClientMock.on(QueryCommand).resolves({
        Items: [],
        LastEvaluatedKey: lastEvaluatedKey,
      });

      const { nextPageToken } = await adapter.listSnapshots(
        { eventStoreId },
        { aggregateId: 'a1', limit: 7 },
      );

      // Override `limit` on the next call. Caller value wins.
      await adapter.listSnapshots(
        { eventStoreId },
        { pageToken: nextPageToken, limit: 3 },
      );

      const secondInput = dynamoDBClientMock.call(1).args[0].input as {
        Limit: number;
      };
      expect(secondInput.Limit).toBe(3);
    });

    it('adds a FilterExpression on the main table when reducerVersion is also provided', async () => {
      await adapter.listSnapshots(
        { eventStoreId },
        { aggregateId: 'a1', reducerVersion: reducerV1 },
      );

      const input = dynamoDBClientMock.call(0).args[0].input as {
        FilterExpression?: string;
        IndexName?: string;
        ExpressionAttributeNames: Record<string, string>;
      };
      expect(input.IndexName).toBeUndefined();
      expect(input.FilterExpression).toBe(
        '#reducerVersion = :reducerVersion',
      );
      expect(input.ExpressionAttributeNames).toMatchObject({
        '#reducerVersion': SNAPSHOT_TABLE_REDUCER_VERSION_KEY,
      });
    });
  });

  describe('composite-key validation', () => {
    it('rejects a putSnapshot whose reducerVersion contains "#"', async () => {
      const snapshot = makeSnapshot('a1', 1, 'rv#bad');

      await expect(
        adapter.putSnapshot(snapshot, { eventStoreId }),
      ).rejects.toThrow(/reducerVersion/);
      expect(dynamoDBClientMock.calls()).toHaveLength(0);
    });

    it('rejects a putSnapshot whose reducerVersion contains "\\uFFFF"', async () => {
      const snapshot = makeSnapshot('a1', 1, 'rv\uffff');

      await expect(
        adapter.putSnapshot(snapshot, { eventStoreId }),
      ).rejects.toThrow(/reducerVersion/);
      expect(dynamoDBClientMock.calls()).toHaveLength(0);
    });

    it('rejects a putSnapshot whose aggregateId contains "#"', async () => {
      const snapshot = makeSnapshot('a#1', 1, reducerV1);

      await expect(
        adapter.putSnapshot(snapshot, { eventStoreId }),
      ).rejects.toThrow(/aggregateId/);
      expect(dynamoDBClientMock.calls()).toHaveLength(0);
    });

    it('rejects a listSnapshots filter whose reducerVersion contains "#"', async () => {
      await expect(
        adapter.listSnapshots(
          { eventStoreId },
          { reducerVersion: 'rv#bad' },
        ),
      ).rejects.toThrow(/reducerVersion/);
      expect(dynamoDBClientMock.calls()).toHaveLength(0);
    });
  });

  describe('tableName getter', () => {
    it('accepts a function and resolves it on each call', async () => {
      let i = 0;
      const dynamicAdapter = new DynamoDBSingleTableSnapshotStorageAdapter({
        tableName: () => `dynamic-${(i += 1)}`,
        dynamoDBClient: dynamoDBClientMock as unknown as DynamoDBClient,
      });

      await dynamicAdapter.putSnapshot(makeSnapshot('a1', 1, reducerV1), {
        eventStoreId,
      });
      await dynamicAdapter.putSnapshot(makeSnapshot('a1', 2, reducerV1), {
        eventStoreId,
      });

      expect(
        (dynamoDBClientMock.call(0).args[0].input as { TableName: string })
          .TableName,
      ).toBe('dynamic-1');
      expect(
        (dynamoDBClientMock.call(1).args[0].input as { TableName: string })
          .TableName,
      ).toBe('dynamic-2');
    });
  });
});
