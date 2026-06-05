---
sidebar_position: 4
---

# 🛒 Fetching events

Once your event store has a [storage adapter](./3-event-stores.md#providing-a-storage-adapter), you can read data back out of it. The `EventStore` class exposes a few **loader methods**, depending on whether you want the raw events or a rebuilt aggregate.

> This page focuses on _when_ to reach for each method. Their full signatures and every option live in the [`EventStore` reference](./3-event-stores.md).

## Fetching raw events

`getEvents` retrieves the ordered list of events for a single aggregate. Use it when you care about the event history itself rather than the derived state:

```ts
const { events } = await pokemonsEventStore.getEvents('pikachu1');
// => typed as PokemonEventDetail[] 🙌
```

You can narrow the range with `minVersion` / `maxVersion`, cap the result with `limit`, or read newest-first with `reverse` — for instance, to grab only the latest event:

```ts
const { events: lastEvent } = await pokemonsEventStore.getEvents('pikachu1', {
  reverse: true,
  limit: 1,
});
```

## Fetching an aggregate

Most of the time you don't want the raw events — you want the **current state**. `getAggregate` fetches the events and folds them through the store's [reducer](./2-aggregates-reducers.md) for you, returning the `aggregate` (plus the `events` and `lastEvent`, should you need them):

```ts
const { aggregate: pikachu } =
  await pokemonsEventStore.getAggregate('pikachu1');
// => typed as PokemonAggregate | undefined 🙌
```

The aggregate is `undefined` when no events exist for that id yet. Pass `maxVersion` to rebuild the state as it was at an earlier version — handy for debugging or "time-travelling" through an aggregate's history.

### Requiring existence

Because `getAggregate` returns `undefined` for an unknown id, callers have to handle that case. When your code can't meaningfully continue without the aggregate, reach for `getExistingAggregate` instead: it behaves the same but throws an `AggregateNotFoundError` when no events exist, so `aggregate` and `lastEvent` are guaranteed to be defined:

```ts
const { aggregate } =
  await pokemonsEventStore.getExistingAggregate('pikachu1');
// => 'aggregate' and 'lastEvent' are always defined 🙌
```

## Listing aggregates

`listAggregateIds` returns the ids of every aggregate in the store, ordered by the timestamp of their initial event. It is paginated: pass the returned `nextPageToken` back in to fetch the next page (the token carries your original options, so you don't have to repeat them):

```ts
const { aggregateIds, nextPageToken } =
  await pokemonsEventStore.listAggregateIds({ limit: 20 });
```

:::note

`getAggregate` is really `getEvents` followed by the reducer. If you _already_ hold a list of events — say, from a migration or a test — you can fold them synchronously with [`buildAggregate`](./3-event-stores.md), which needs no storage adapter at all.

:::
