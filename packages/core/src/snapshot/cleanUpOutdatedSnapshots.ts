import type { SnapshotStorageAdapter } from './snapshotStorageAdapter';

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

    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, snapshotKeys.length) }, async () => {
      while (cursor < snapshotKeys.length) {
        const index = cursor++;
        const key = snapshotKeys[index];
        if (key === undefined) {
          continue;
        }
        await adapter.deleteSnapshot(key, { eventStoreId });
      }
    });
    await Promise.all(workers);

    deletedCount += snapshotKeys.length;
    onProgress?.(deletedCount);

    pageToken = nextPageToken;
  } while (pageToken !== undefined);

  return { deletedCount };
};
