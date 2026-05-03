import type { AttributeValue } from '@aws-sdk/client-dynamodb';

export type ParsedPageToken = {
  lastEvaluatedKey: Record<string, AttributeValue>;
};

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
): string | undefined =>
  lastEvaluatedKey === undefined
    ? undefined
    : JSON.stringify({ lastEvaluatedKey } satisfies ParsedPageToken);

export const decodePageToken = (
  pageToken: string | undefined,
): Record<string, AttributeValue> | undefined => {
  if (pageToken === undefined) {
    return undefined;
  }

  const parsed = parseJsonOrFail(pageToken);

  if (!isPlainObject(parsed) || !('lastEvaluatedKey' in parsed)) {
    return fail('missing lastEvaluatedKey');
  }

  const { lastEvaluatedKey } = parsed as ParsedPageToken;

  if (!isPlainObject(lastEvaluatedKey)) {
    return fail('lastEvaluatedKey is not an object');
  }

  return lastEvaluatedKey;
};
