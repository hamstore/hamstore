import type { AttributeValue } from '@aws-sdk/client-dynamodb';

/**
 * The fields persisted in a `pageToken`. Beyond `lastEvaluatedKey` (the
 * exclusive start key for the next DynamoDB query page), we also persist the
 * applied filter / pagination options so subsequent calls reproduce the same
 * query shape — matching the convention of `parseAppliedListAggregateIdsOptions`
 * in `@hamstore/event-storage-adapter-dynamodb`.
 *
 * Caller-passed options take precedence over token-stored options; the token's
 * fields are only used as fallbacks.
 */
export type ParsedPageToken = {
  lastEvaluatedKey: Record<string, AttributeValue>;
  aggregateId?: string;
  reducerVersion?: string;
  minVersion?: number;
  maxVersion?: number;
  limit?: number;
  reverse?: boolean;
};

export type AppliedListSnapshotsOptions = Omit<
  ParsedPageToken,
  'lastEvaluatedKey'
>;

const fail = (reason: string): never => {
  throw new Error(
    `DynamoDBSingleTableSnapshotStorageAdapter: invalid pageToken (${reason})`,
  );
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const parseJsonOrFail = (pageToken: string): unknown => {
  try {
    return JSON.parse(pageToken);
  } catch {
    return fail('not JSON');
  }
};

export const encodePageToken = (
  lastEvaluatedKey: Record<string, AttributeValue> | undefined,
  appliedOptions: AppliedListSnapshotsOptions,
): string | undefined =>
  lastEvaluatedKey === undefined
    ? undefined
    : JSON.stringify({
        lastEvaluatedKey,
        ...appliedOptions,
      } satisfies ParsedPageToken);

const decodePageToken = (pageToken: string): ParsedPageToken => {
  const parsed = parseJsonOrFail(pageToken);

  if (!isPlainObject(parsed) || !('lastEvaluatedKey' in parsed)) {
    return fail('missing lastEvaluatedKey');
  }

  const tokenOptions = parsed as ParsedPageToken;

  if (!isPlainObject(tokenOptions.lastEvaluatedKey)) {
    return fail('lastEvaluatedKey is not an object');
  }

  return tokenOptions;
};

/**
 * Decode a `pageToken` and merge with caller-passed options. Caller-passed
 * options take precedence; token-stored options are used as fallbacks.
 */
export const parseAppliedListSnapshotsOptions = ({
  inputOptions,
  inputPageToken,
}: {
  inputOptions: AppliedListSnapshotsOptions;
  inputPageToken: string | undefined;
}): AppliedListSnapshotsOptions & {
  exclusiveStartKey?: Record<string, AttributeValue>;
} => {
  if (inputPageToken === undefined) {
    return { ...inputOptions };
  }

  const tokenOptions = decodePageToken(inputPageToken);

  return {
    aggregateId: inputOptions.aggregateId ?? tokenOptions.aggregateId,
    reducerVersion: inputOptions.reducerVersion ?? tokenOptions.reducerVersion,
    minVersion: inputOptions.minVersion ?? tokenOptions.minVersion,
    maxVersion: inputOptions.maxVersion ?? tokenOptions.maxVersion,
    limit: inputOptions.limit ?? tokenOptions.limit,
    reverse: inputOptions.reverse ?? tokenOptions.reverse,
    exclusiveStartKey: tokenOptions.lastEvaluatedKey,
  };
};
