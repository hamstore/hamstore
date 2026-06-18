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

You can narrow the range with `minVersion` / `maxVersion`, cap the result with `limit`, or read newest-first with `reverse`. For instance, to read a slice of an aggregate's history:

```ts
const { events } = await pokemonsEventStore.getEvents('pikachu1', {
  minVersion: 2,
  maxVersion: 5,
});
// => events at versions 2 to 5
```

Or, if you only need the latest event, read newest-first and cap at 1 — cheaper than `getAggregate`, which fetches the whole history and folds it through the reducer:

```ts
const { events: [lastEvent] } = await pokemonsEventStore.getEvents('pikachu1', {
  reverse: true,
  limit: 1,
});
// => lastEvent: PokemonEventDetail | undefined
```

## Fetching an aggregate

Most of the time you don't want the raw events — you want the **current state**. `getAggregate` fetches the events and folds them through the store's [reducer](./2-aggregates-reducers.md) for you, returning just the `aggregate`:

```ts
const { aggregate: pikachu } =
  await pokemonsEventStore.getAggregate('pikachu1');
// => typed as PokemonAggregate | undefined 🙌
```

The aggregate is `undefined` when no events exist for that id yet. Pass `maxVersion` to rebuild the state as it was at an earlier version — handy for debugging or "time-travelling" through an aggregate's history.

### Requiring existence

Because `getAggregate` returns `undefined` for an unknown id, callers have to handle that case. When your code can't meaningfully continue without the aggregate, reach for `getExistingAggregate` instead: it behaves the same but throws an `AggregateNotFoundError` when no events exist, so `aggregate` is guaranteed to be defined:

```ts
const { aggregate } =
  await pokemonsEventStore.getExistingAggregate('pikachu1');
// => 'aggregate' is always defined 🙌
```

### Also need the events?

`getAggregate` returns **only** the aggregate. When you also need the events that produced it — say, to publish a [state-carrying message](../3-reacting-to-events/1-messages.md) or to count how many events contributed — use `getAggregateAndEvents` (or its throwing sibling `getExistingAggregateAndEvents`), which returns the `events` and `lastEvent` alongside the `aggregate`:

```ts
const { aggregate, events, lastEvent } =
  await pokemonsEventStore.getAggregateAndEvents('pikachu1');
// => aggregate + the full history that produced it
```

Pass `fromVersion` to narrow the returned `events` to a known checkpoint — the `aggregate` is still built from the full history, regardless:

```ts
const { events } = await pokemonsEventStore.getAggregateAndEvents('pikachu1', {
  fromVersion: lastProcessedVersion + 1,
});
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
