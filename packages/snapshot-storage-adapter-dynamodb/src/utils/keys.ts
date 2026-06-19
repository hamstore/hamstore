import { VERSION_PADDING_WIDTH } from '../constants';

const padVersion = (version: number): string =>
  String(version).padStart(VERSION_PADDING_WIDTH, '0');

/**
 * Compose the main-table partition key. Mirrors the
 * `event-storage-adapter-dynamodb` `<eventStoreId>#<aggregateId>` convention.
 */
export const partitionKey = (
  eventStoreId: string,
  aggregateId: string,
): string => `${eventStoreId}#${aggregateId}`;

/**
 * Compose the main-table sort key. The `aggregateVersion` is zero-padded so
 * that lexicographic order matches numeric order, which lets us serve the
 * `getLatestSnapshot` hot path with a single `Limit: 1, ScanIndexForward: false`
 * query.
 */
export const sortKey = (aggregateVersion: number, reducerVersion: string): string =>
  `${padVersion(aggregateVersion)}#${reducerVersion}`;

/**
 * Lower-bound helper for SK queries. `aggregateVersion >= V` translates to
 * `SK >= sortKeyMinForVersion(V)`, since `padVersion(V) + '#'` is the smallest
 * possible SK with `aggregateVersion = V`.
 */
export const sortKeyMinForVersion = (aggregateVersion: number): string =>
  `${padVersion(aggregateVersion)}#`;

/**
 * Upper-bound helper for SK queries. `aggregateVersion <= V` translates to
 * `SK <= sortKeyMaxForVersion(V)`. We use the `\uFFFF` terminator: in JS
 * (UTF-16) every code unit lies in `[0, 0xFFFF]`, surrogate pairs encoding
 * non-BMP characters use code units in `[0xD800, 0xDFFF]` (all strictly
 * below `0xFFFF`), so any string that does not literally contain `\uFFFF`
 * sorts strictly below `<padded-V>#\uFFFF`. `assertValidReducerVersion`
 * rejects literal `\uFFFF` at write time as defense-in-depth.
 */
export const sortKeyMaxForVersion = (aggregateVersion: number): string =>
  `${padVersion(aggregateVersion)}#\uffff`;

/** GSI partition key: `<eventStoreId>#<reducerVersion>`. */
export const gsiPartitionKey = (
  eventStoreId: string,
  reducerVersion: string,
): string => `${eventStoreId}#${reducerVersion}`;

/** GSI sort key: `<aggregateId>#<padded-aggregateVersion>`. */
export const gsiSortKey = (
  aggregateId: string,
  aggregateVersion: number,
): string => `${aggregateId}#${padVersion(aggregateVersion)}`;

/**
 * Strip the `<eventStoreId>#` prefix from a main-table PK value to recover
 * the bare `aggregateId`. Mirrors the `unprefixAggregateId` helper in
 * `event-storage-adapter-dynamodb`.
 */
export const aggregateIdFromPartitionKey = (
  eventStoreId: string,
  partitionKeyValue: string,
): string =>
  partitionKeyValue.startsWith(`${eventStoreId}#`)
    ? partitionKeyValue.slice(eventStoreId.length + 1)
    : partitionKeyValue;

/**
 * Parse the main-table SK back into its `aggregateVersion` and `reducerVersion`
 * components. Inverse of `sortKey`. Throws on malformed inputs (in practice
 * this would only be a programmer error or upstream data corruption — fresh
 * adapter installs always produce well-formed SKs).
 */
export const parseSortKey = (
  sortKeyValue: string,
): { aggregateVersion: number; reducerVersion: string } => {
  const separatorIndex = sortKeyValue.indexOf('#');
  if (separatorIndex === -1) {
    throw new Error(
      `DynamoDBSingleTableSnapshotStorageAdapter: malformed snapshotKey ${JSON.stringify(sortKeyValue)} (missing '#' separator)`,
    );
  }

  const aggregateVersion = Number(sortKeyValue.slice(0, separatorIndex));
  if (!Number.isInteger(aggregateVersion)) {
    throw new Error(
      `DynamoDBSingleTableSnapshotStorageAdapter: malformed snapshotKey ${JSON.stringify(sortKeyValue)} (non-integer version prefix)`,
    );
  }

  return {
    aggregateVersion,
    reducerVersion: sortKeyValue.slice(separatorIndex + 1),
  };
};
