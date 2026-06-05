import type {
  SnapshotKey,
  SnapshotStorageAdapter,
} from './snapshotStorageAdapter';

const requirePositiveInteger = (name: string, value: number): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(
      `cleanUpOutdatedSnapshots: \`${name}\` must be a positive integer (got ${String(value)})`,
    );
  }
};

const deleteKeysInParallel = async (
  adapter: SnapshotStorageAdapter,
  eventStoreId: string,
  keys: SnapshotKey[],
  concurrency: number,
): Promise<void> => {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, keys.length) },
    async () => {
      while (cursor < keys.length) {
        const index = cursor++;
        const key = keys[index];
        if (key === undefined) {
          continue;
        }
        await adapter.deleteSnapshot(key, { eventStoreId });
      }
    },
  );
  await Promise.all(workers);
};

/**
 * Efficiently delete snapshots written under an outdated `reducerVersion`.
 *
 * Iterates through pages of `listSnapshots({ reducerVersion })` and calls
 * `deleteSnapshot` on each key. With a properly indexed adapter (e.g. the
 * DynamoDB adapter's reducer-version GSI) this is O(M) in the number of stale
 * snapshots, not O(table size).
 *
 * @param adapter the snapshot storage adapter
 * @param eventStoreId the event store whose snapshots to clean
 * @param outdatedReducerVersion the reducer fingerprint to remove
 * @param options.batchSize how many snapshots to fetch per page (default 100)
 * @param options.concurrency how many deletes to run in parallel per page (default 16)
 * @param options.onProgress optional progress hook called after each page
 *
 * @returns the total number of snapshots deleted
 */
export const cleanUpOutdatedSnapshots = async (
  adapter: SnapshotStorageAdapter,
  eventStoreId: string,
  outdatedReducerVersion: string,
  options: {
    batchSize?: number;
    concurrency?: number;
    onProgress?: (deletedSoFar: number) => void;
  } = {},
): Promise<{ deletedCount: number }> => {
  const { batchSize = 100, concurrency = 16, onProgress } = options;

  requirePositiveInteger('batchSize', batchSize);
  requirePositiveInteger('concurrency', concurrency);

  let pageToken: string | undefined = undefined;
  let deletedCount = 0;

  do {
    const { snapshotKeys, nextPageToken } = await adapter.listSnapshots(
      { eventStoreId },
      {
        reducerVersion: outdatedReducerVersion,
        limit: batchSize,
        pageToken,
      },
    );

    await deleteKeysInParallel(
      adapter,
      eventStoreId,
      snapshotKeys,
      concurrency,
    );

    deletedCount += snapshotKeys.length;
    onProgress?.(deletedCount);

    pageToken = nextPageToken;
  } while (pageToken !== undefined);

  return { deletedCount };
};
