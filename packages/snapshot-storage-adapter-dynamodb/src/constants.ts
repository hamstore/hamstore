import type { marshallOptions as MarshallOptions } from '@aws-sdk/util-dynamodb';

export const SNAPSHOT_TABLE_PK = 'aggregateId';
export const SNAPSHOT_TABLE_SK = 'snapshotKey';
export const SNAPSHOT_TABLE_AGGREGATE_VERSION_KEY = 'aggregateVersion';
export const SNAPSHOT_TABLE_REDUCER_VERSION_KEY = 'reducerVersion';
export const SNAPSHOT_TABLE_AGGREGATE_KEY = 'aggregate';
export const SNAPSHOT_TABLE_EVENT_STORE_ID_KEY = 'eventStoreId';
export const SNAPSHOT_TABLE_SAVED_AT_KEY = 'savedAt';
export const SNAPSHOT_TABLE_GSI_PK_KEY = 'eventStoreReducerVersion';
export const SNAPSHOT_TABLE_GSI_SK_KEY = 'aggregateSnapshotKey';
export const SNAPSHOT_TABLE_BY_REDUCER_VERSION_INDEX_NAME =
  'snapshotsByReducerVersion';

/**
 * The DynamoDB sort key encodes `aggregateVersion` first so that descending
 * scans (`ScanIndexForward: false`) return the highest-version snapshot first
 * — used for the `getLatestSnapshot` hot path. The padding width matches the
 * width chosen for the in-memory adapter so cross-adapter ordering is the same.
 */
export const VERSION_PADDING_WIDTH = 20;

export const MARSHALL_OPTIONS: MarshallOptions = {
  convertEmptyValues: false,
  removeUndefinedValues: true,
};
