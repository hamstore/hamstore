/* eslint-disable max-lines */
import {
  AttributeValue,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  QueryCommandInput,
  QueryCommandOutput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type {
  ListSnapshotsOptions,
  ListSnapshotsOutput,
  Snapshot,
  SnapshotKey,
  SnapshotStorageAdapter,
} from '@hamstore/core';

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
} from './constants';
import {
  aggregateIdFromPartitionKey,
  gsiPartitionKey,
  gsiSortKey,
  parseSortKey,
  partitionKey,
  sortKey,
  sortKeyMaxForVersion,
  sortKeyMinForVersion,
} from './utils/keys';
import {
  encodePageToken,
  parseAppliedListSnapshotsOptions,
} from './utils/pageToken';
import {
  assertValidAggregateId,
  assertValidEventStoreId,
  assertValidReducerVersion,
} from './utils/validate';

type StoredSnapshotItem = {
  [SNAPSHOT_TABLE_PK]: string;
  [SNAPSHOT_TABLE_SK]: string;
  [SNAPSHOT_TABLE_AGGREGATE_KEY]: Snapshot['aggregate'];
  [SNAPSHOT_TABLE_AGGREGATE_VERSION_KEY]: number;
  [SNAPSHOT_TABLE_REDUCER_VERSION_KEY]: string;
  [SNAPSHOT_TABLE_EVENT_STORE_ID_KEY]: string;
  [SNAPSHOT_TABLE_SAVED_AT_KEY]: string;
  [SNAPSHOT_TABLE_GSI_PK_KEY]: string;
  [SNAPSHOT_TABLE_GSI_SK_KEY]: string;
};

const buildItem = (snapshot: Snapshot): StoredSnapshotItem => {
  const { aggregate, reducerVersion, eventStoreId, savedAt } = snapshot;

  return {
    [SNAPSHOT_TABLE_PK]: partitionKey(eventStoreId, aggregate.aggregateId),
    [SNAPSHOT_TABLE_SK]: sortKey(aggregate.version, reducerVersion),
    [SNAPSHOT_TABLE_AGGREGATE_KEY]: aggregate,
    [SNAPSHOT_TABLE_AGGREGATE_VERSION_KEY]: aggregate.version,
    [SNAPSHOT_TABLE_REDUCER_VERSION_KEY]: reducerVersion,
    [SNAPSHOT_TABLE_EVENT_STORE_ID_KEY]: eventStoreId,
    [SNAPSHOT_TABLE_SAVED_AT_KEY]: savedAt,
    [SNAPSHOT_TABLE_GSI_PK_KEY]: gsiPartitionKey(eventStoreId, reducerVersion),
    [SNAPSHOT_TABLE_GSI_SK_KEY]: gsiSortKey(
      aggregate.aggregateId,
      aggregate.version,
    ),
  };
};

const itemToSnapshot = (item: Record<string, unknown>): Snapshot => {
  const stored = item as StoredSnapshotItem;

  return {
    aggregate: stored[SNAPSHOT_TABLE_AGGREGATE_KEY],
    reducerVersion: stored[SNAPSHOT_TABLE_REDUCER_VERSION_KEY],
    eventStoreId: stored[SNAPSHOT_TABLE_EVENT_STORE_ID_KEY],
    savedAt: stored[SNAPSHOT_TABLE_SAVED_AT_KEY],
  };
};

/**
 * Build a `SnapshotKey` from a stored item. Reads only key attributes (PK,
 * SK, `savedAt`) — not the `aggregate` blob — so cleanup/pruning sweeps do
 * not pay the RCU/network cost of large aggregate payloads, and the
 * `snapshotsByReducerVersion` GSI only needs to project `savedAt` (the main
 * table's PK and SK are always projected into a GSI item automatically).
 */
const itemToSnapshotKey = (
  eventStoreId: string,
  item: Record<string, unknown>,
): SnapshotKey => {
  const partitionKeyValue = item[SNAPSHOT_TABLE_PK] as string;
  const sortKeyValue = item[SNAPSHOT_TABLE_SK] as string;
  const savedAt = item[SNAPSHOT_TABLE_SAVED_AT_KEY] as string;

  const aggregateId = aggregateIdFromPartitionKey(
    eventStoreId,
    partitionKeyValue,
  );
  const { aggregateVersion, reducerVersion } = parseSortKey(sortKeyValue);

  return {
    aggregateId,
    aggregateVersion,
    reducerVersion,
    savedAt,
  };
};

/**
 * DynamoDB single-table implementation of `SnapshotStorageAdapter`.
 *
 * **Layout**
 *
 *   Main table:
 *     PK  ("aggregateId")  = "<eventStoreId>#<aggregateId>"
 *     SK  ("snapshotKey")  = "<padded-aggregateVersion>#<reducerVersion>"
 *
 *   GSI ("snapshotsByReducerVersion"):
 *     PK  ("eventStoreReducerVersion") = "<eventStoreId>#<reducerVersion>"
 *     SK  ("aggregateSnapshotKey")     = "<aggregateId>#<padded-aggregateVersion>"
 *
 * The main table serves the hot path (`getLatestSnapshot`, `getSnapshot`,
 * per-aggregate `listSnapshots`) and persistence. The GSI exists so that
 * `listSnapshots({ reducerVersion })` (used by `cleanUpOutdatedSnapshots` and
 * `pruneEventStoreSnapshots`) is O(M) in the number of matching snapshots
 * rather than O(table size).
 *
 * **Constraints** (enforced at write/query time)
 *
 * - `listSnapshots` requires either `aggregateId` or `reducerVersion` to be
 *   set. The adapter does not perform full-table scans; the EventStore never
 *   asks it to.
 * - `eventStoreId`, `aggregateId`, and `reducerVersion` must not contain the
 *   literal `'#'` character (separator inside the composite keys).
 * - `reducerVersion` must not contain the literal `'\uFFFF'` character (the
 *   upper-bound terminator used by `sortKeyMaxForVersion`). Non-BMP
 *   characters are safe — their UTF-16 surrogate code units all lie strictly
 *   below `\uFFFF`.
 */
export class DynamoDBSingleTableSnapshotStorageAdapter
  implements SnapshotStorageAdapter
{
  getLatestSnapshot: SnapshotStorageAdapter['getLatestSnapshot'];
  getSnapshot: SnapshotStorageAdapter['getSnapshot'];
  putSnapshot: SnapshotStorageAdapter['putSnapshot'];
  deleteSnapshot: SnapshotStorageAdapter['deleteSnapshot'];
  listSnapshots: SnapshotStorageAdapter['listSnapshots'];

  getTableName: () => string;
  tableName: string | (() => string);
  dynamoDBClient: DynamoDBClient;

  constructor({
    tableName,
    dynamoDBClient,
  }: {
    tableName: string | (() => string);
    dynamoDBClient: DynamoDBClient;
  }) {
    this.tableName = tableName;
    this.dynamoDBClient = dynamoDBClient;

    this.getTableName = () =>
      typeof this.tableName === 'string' ? this.tableName : this.tableName();

    this.getLatestSnapshot = async (
      aggregateId,
      { eventStoreId },
      options = {},
    ) => {
      assertValidEventStoreId(eventStoreId);
      assertValidAggregateId(aggregateId);
      if (options.reducerVersion !== undefined) {
        assertValidReducerVersion(options.reducerVersion);
      }

      const baseInput = this.buildLatestSnapshotQueryInput(
        eventStoreId,
        aggregateId,
        options,
      );

      return await this.queryLatestSnapshot(baseInput);
    };

    this.getSnapshot = async (snapshotKey, { eventStoreId }) => {
      const result = await this.dynamoDBClient.send(
        new GetItemCommand({
          TableName: this.getTableName(),
          Key: marshall(
            {
              [SNAPSHOT_TABLE_PK]: partitionKey(
                eventStoreId,
                snapshotKey.aggregateId,
              ),
              [SNAPSHOT_TABLE_SK]: sortKey(
                snapshotKey.aggregateVersion,
                snapshotKey.reducerVersion,
              ),
            },
            MARSHALL_OPTIONS,
          ),
          ConsistentRead: true,
        }),
      );

      if (result.Item === undefined) {
        return { snapshot: undefined };
      }

      return { snapshot: itemToSnapshot(unmarshall(result.Item)) };
    };

    this.putSnapshot = async (snapshot, { eventStoreId }) => {
      if (snapshot.eventStoreId !== eventStoreId) {
        throw new Error(
          `Snapshot eventStoreId "${snapshot.eventStoreId}" does not match context "${eventStoreId}"`,
        );
      }
      assertValidEventStoreId(eventStoreId);
      assertValidAggregateId(snapshot.aggregate.aggregateId);
      assertValidReducerVersion(snapshot.reducerVersion);

      await this.dynamoDBClient.send(
        new PutItemCommand({
          TableName: this.getTableName(),
          Item: marshall(buildItem(snapshot), MARSHALL_OPTIONS),
        }),
      );
    };

    this.deleteSnapshot = async (snapshotKey, { eventStoreId }) => {
      await this.dynamoDBClient.send(
        new DeleteItemCommand({
          TableName: this.getTableName(),
          Key: marshall(
            {
              [SNAPSHOT_TABLE_PK]: partitionKey(
                eventStoreId,
                snapshotKey.aggregateId,
              ),
              [SNAPSHOT_TABLE_SK]: sortKey(
                snapshotKey.aggregateVersion,
                snapshotKey.reducerVersion,
              ),
            },
            MARSHALL_OPTIONS,
          ),
        }),
      );
    };

    // eslint-disable-next-line complexity
    this.listSnapshots = async (
      { eventStoreId },
      { pageToken: inputPageToken, ...inputOptions } = {},
    ): Promise<ListSnapshotsOutput> => {
      assertValidEventStoreId(eventStoreId);
      if (inputOptions.aggregateId !== undefined) {
        assertValidAggregateId(inputOptions.aggregateId);
      }
      if (inputOptions.reducerVersion !== undefined) {
        assertValidReducerVersion(inputOptions.reducerVersion);
      }

      const {
        aggregateId,
        reducerVersion,
        minVersion,
        maxVersion,
        limit,
        reverse,
        exclusiveStartKey,
      } = parseAppliedListSnapshotsOptions({
        inputOptions,
        inputPageToken,
      });

      if (aggregateId === undefined && reducerVersion === undefined) {
        throw new Error(
          'DynamoDBSingleTableSnapshotStorageAdapter.listSnapshots requires either aggregateId or reducerVersion (full-table scans are not supported)',
        );
      }

      const useGsi = aggregateId === undefined;
      const queryInput = useGsi
        ? this.buildGsiQueryInput(
            eventStoreId,
            // We checked above that reducerVersion is defined here.
            reducerVersion as string,
            { minVersion, maxVersion, limit, reverse },
          )
        : this.buildMainQueryInput(
            eventStoreId,
            aggregateId,
            { reducerVersion, minVersion, maxVersion, limit, reverse },
          );

      if (exclusiveStartKey !== undefined) {
        queryInput.ExclusiveStartKey = exclusiveStartKey;
      }

      const result = (await this.dynamoDBClient.send(
        new QueryCommand(queryInput),
      )) as QueryCommandOutput;

      const items = result.Items ?? [];
      const snapshotKeys = items
        .map(item => unmarshall(item))
        .map(item => itemToSnapshotKey(eventStoreId, item));

      const nextPageToken = encodePageToken(result.LastEvaluatedKey, {
        aggregateId,
        reducerVersion,
        minVersion,
        maxVersion,
        limit,
        reverse,
      });

      return {
        snapshotKeys,
        ...(nextPageToken !== undefined ? { nextPageToken } : {}),
      };
    };
  }

  private buildLatestSnapshotQueryInput(
    eventStoreId: string,
    aggregateId: string,
    {
      aggregateMaxVersion,
      reducerVersion,
    }: { aggregateMaxVersion?: number; reducerVersion?: string },
  ): QueryCommandInput {
    const expressionAttributeNames: Record<string, string> = {
      '#pk': SNAPSHOT_TABLE_PK,
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ':pk': partitionKey(eventStoreId, aggregateId),
    };

    let keyConditionExpression = '#pk = :pk';
    if (aggregateMaxVersion !== undefined) {
      keyConditionExpression += ' AND #sk <= :maxSk';
      expressionAttributeNames['#sk'] = SNAPSHOT_TABLE_SK;
      expressionAttributeValues[':maxSk'] =
        sortKeyMaxForVersion(aggregateMaxVersion);
    }

    const baseInput: QueryCommandInput = {
      TableName: this.getTableName(),
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ConsistentRead: true,
      ScanIndexForward: false,
    };

    if (reducerVersion !== undefined) {
      baseInput.FilterExpression = '#reducerVersion = :reducerVersion';
      expressionAttributeNames['#reducerVersion'] =
        SNAPSHOT_TABLE_REDUCER_VERSION_KEY;
      expressionAttributeValues[':reducerVersion'] = reducerVersion;
      // 16 is a small batch that normally finds a match on the first page;
      // queryLatestSnapshot still loops with ExclusiveStartKey if every item
      // on the page is filtered out.
      baseInput.Limit = 16;
    } else {
      baseInput.Limit = 1;
    }

    baseInput.ExpressionAttributeValues = marshall(
      expressionAttributeValues,
      MARSHALL_OPTIONS,
    );

    return baseInput;
  }

  private async queryLatestSnapshot(
    baseInput: QueryCommandInput,
  ): Promise<{ snapshot: Snapshot | undefined }> {
    // Iterate until DynamoDB stops paginating. We loop only when a
    // `FilterExpression` rejects every item on a page (i.e. when callers
    // request `getLatestSnapshot` with a `reducerVersion` filter); without a
    // filter, the first page returns `Limit: 1` and the loop exits after one
    // iteration. Each page is bounded by DynamoDB's 1MB hard cap, so the
    // worst-case latency is O(matching aggregate's snapshot rows under
    // other reducer versions).
    let exclusiveStartKey: Record<string, AttributeValue> | undefined =
      undefined;

    do {
      const result = (await this.dynamoDBClient.send(
        new QueryCommand({
          ...baseInput,
          ...(exclusiveStartKey !== undefined
            ? { ExclusiveStartKey: exclusiveStartKey }
            : {}),
        }),
      )) as QueryCommandOutput;

      const firstItem = (result.Items ?? [])[0];
      if (firstItem !== undefined) {
        return { snapshot: itemToSnapshot(unmarshall(firstItem)) };
      }

      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey !== undefined);

    return { snapshot: undefined };
  }

  private buildMainQueryInput(
    eventStoreId: string,
    aggregateId: string,
    {
      reducerVersion,
      minVersion,
      maxVersion,
      limit,
      reverse,
    }: Pick<
      ListSnapshotsOptions,
      'reducerVersion' | 'minVersion' | 'maxVersion' | 'limit' | 'reverse'
    >,
  ): QueryCommandInput {
    const expressionAttributeNames: Record<string, string> = {
      '#pk': SNAPSHOT_TABLE_PK,
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ':pk': partitionKey(eventStoreId, aggregateId),
    };

    let keyConditionExpression = '#pk = :pk';

    if (minVersion !== undefined && maxVersion !== undefined) {
      keyConditionExpression += ' AND #sk BETWEEN :minSk AND :maxSk';
      expressionAttributeNames['#sk'] = SNAPSHOT_TABLE_SK;
      expressionAttributeValues[':minSk'] = sortKeyMinForVersion(minVersion);
      expressionAttributeValues[':maxSk'] = sortKeyMaxForVersion(maxVersion);
    } else if (minVersion !== undefined) {
      keyConditionExpression += ' AND #sk >= :minSk';
      expressionAttributeNames['#sk'] = SNAPSHOT_TABLE_SK;
      expressionAttributeValues[':minSk'] = sortKeyMinForVersion(minVersion);
    } else if (maxVersion !== undefined) {
      keyConditionExpression += ' AND #sk <= :maxSk';
      expressionAttributeNames['#sk'] = SNAPSHOT_TABLE_SK;
      expressionAttributeValues[':maxSk'] = sortKeyMaxForVersion(maxVersion);
    }

    const queryInput: QueryCommandInput = {
      TableName: this.getTableName(),
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ConsistentRead: true,
    };

    if (reducerVersion !== undefined) {
      queryInput.FilterExpression = '#reducerVersion = :reducerVersion';
      expressionAttributeNames['#reducerVersion'] =
        SNAPSHOT_TABLE_REDUCER_VERSION_KEY;
      expressionAttributeValues[':reducerVersion'] = reducerVersion;
    }

    queryInput.ExpressionAttributeValues = marshall(
      expressionAttributeValues,
      MARSHALL_OPTIONS,
    );

    if (reverse !== undefined) {
      queryInput.ScanIndexForward = !reverse;
    }
    if (limit !== undefined) {
      queryInput.Limit = limit;
    }

    return queryInput;
  }

  private buildGsiQueryInput(
    eventStoreId: string,
    reducerVersion: string,
    {
      minVersion,
      maxVersion,
      limit,
      reverse,
    }: Pick<
      ListSnapshotsOptions,
      'minVersion' | 'maxVersion' | 'limit' | 'reverse'
    >,
  ): QueryCommandInput {
    const expressionAttributeNames: Record<string, string> = {
      '#gsiPk': SNAPSHOT_TABLE_GSI_PK_KEY,
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ':gsiPk': gsiPartitionKey(eventStoreId, reducerVersion),
    };

    const filterParts: string[] = [];
    if (minVersion !== undefined) {
      filterParts.push('#aggregateVersion >= :minVersion');
      expressionAttributeNames['#aggregateVersion'] =
        SNAPSHOT_TABLE_AGGREGATE_VERSION_KEY;
      expressionAttributeValues[':minVersion'] = minVersion;
    }
    if (maxVersion !== undefined) {
      filterParts.push('#aggregateVersion <= :maxVersion');
      expressionAttributeNames['#aggregateVersion'] =
        SNAPSHOT_TABLE_AGGREGATE_VERSION_KEY;
      expressionAttributeValues[':maxVersion'] = maxVersion;
    }

    const queryInput: QueryCommandInput = {
      TableName: this.getTableName(),
      IndexName: SNAPSHOT_TABLE_BY_REDUCER_VERSION_INDEX_NAME,
      KeyConditionExpression: '#gsiPk = :gsiPk',
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: marshall(
        expressionAttributeValues,
        MARSHALL_OPTIONS,
      ),
    };

    if (filterParts.length > 0) {
      queryInput.FilterExpression = filterParts.join(' AND ');
    }

    if (reverse !== undefined) {
      queryInput.ScanIndexForward = !reverse;
    }
    if (limit !== undefined) {
      queryInput.Limit = limit;
    }

    return queryInput;
  }
}
