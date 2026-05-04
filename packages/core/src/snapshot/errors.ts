export class UndefinedSnapshotStorageAdapterError extends Error {
  code: 'UndefinedSnapshotStorageAdapter';
  eventStoreId: string;

  constructor({ eventStoreId }: { eventStoreId: string }) {
    super(
      `Event store "${eventStoreId}" has a snapshotConfig but no snapshotStorageAdapter — pass one to the EventStore constructor or assign it directly via \`eventStore.snapshotStorageAdapter = ...\`.`,
    );

    this.eventStoreId = eventStoreId;
    this.code = 'UndefinedSnapshotStorageAdapter';
  }
}
