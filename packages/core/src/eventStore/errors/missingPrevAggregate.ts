export class MissingPrevAggregateError extends Error {
  constructor({ eventStoreId }: { eventStoreId: string }) {
    super(
      `Event store "${eventStoreId}" was constructed with requirePrevAggregate=true, but a prevAggregate was not provided.`,
    );
  }
}
