export class UndefinedSnapshotStorageAdapterError extends Error {
  code: 'UndefinedSnapshotStorageAdapter';
  eventStoreId: string;

  constructor({ eventStoreId }: { eventStoreId: string }) {
    super(
      `Event store "${eventStoreId}" has a snapshotConfig but no snapshotStorageAdapter — set one on the EventStore constructor or via setSnapshotStorageAdapter().`,
    );

    this.eventStoreId = eventStoreId;
    this.code = 'UndefinedSnapshotStorageAdapter';
  }
}
