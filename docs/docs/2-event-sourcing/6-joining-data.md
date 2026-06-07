---
sidebar_position: 6
---

# 🔗 Event Groups: Transactions

Some commands can have an effect on **several event stores**, or on **several aggregates** of the same event store. For instance, the `CATCH_POKEMON` command could write both a `CAUGHT_BY_TRAINER` event on a pokemon aggregate (changing its `status` to `'caught'`) and a `POKEMON_CAUGHT` event on a trainer aggregate (appending the `pokemonId` to its `pokedex`).

![Event Group](../../assets/docSchemas/eventGroup.png)

To not have your application in a corrupt state, it's important to make sure that **all those events are pushed or none**. In Hamstore, this can be done through the **event groups** API:

- You build the grouped events to push together — each one synchronously returns a `GroupedEvent` class.
- The `EventStore` class exposes a static `pushEventGroup` method that can be used to effectively push this event group.

## Building grouped events from an `AggregateHandle`

The recommended way to build the grouped events is from an [`AggregateHandle`](./5-pushing-events.md#pushing-events-with-an-aggregatehandle): the handle fills in `aggregateId` and the next `version` for you, so each store contributes its event without manual version bookkeeping. Unlike `pushEvent`/`pushEvents`, these methods **do not commit** — they only build the `GroupedEvent`s you then pass to `EventStore.pushEventGroup`:

- <code>handle.groupEvent(input, opt?)</code>: Builds **one** `GroupedEvent` for this aggregate — the common "N stores, one event each" case.
- <code>handle.groupEvents([input | fn, ...], opt?)</code>: Builds **multiple chained** `GroupedEvent`s on one aggregate. The result is a fixed-size tuple the **same length** as its input, so it can be spread straight into `EventStore.pushEventGroup`.

```ts
const pikachu = await pokemonsEventStore.openExistingAggregate('pikachu1');
const ash = await trainersEventStore.openExistingAggregate('ashKetchum');

await EventStore.pushEventGroup(
  // 👇 aggregateId + version filled in from the handle
  pikachu.groupEvent({
    type: 'CAUGHT_BY_TRAINER',
    payload: { trainerId: 'ashKetchum' },
  }),
  ash.groupEvent({
    type: 'POKEMON_CAUGHT',
    payload: { pokemonId: 'pikachu1' },
  }),
);
```

:::warning

`groupEvent` does **not** chain: calling it twice on the same handle produces two events pinned at the **same** `nextVersion`, which collide loudly on push (`EventAlreadyExistsError` on the duplicate `(aggregateId, version)`). When one aggregate contributes **more than one** event to the group, use `groupEvents([...])` — it chains them on that aggregate and returns a tuple you spread into `pushEventGroup`:

```ts
await EventStore.pushEventGroup(
  ...pikachu.groupEvents([{ type: 'POKEMON_LEVELED_UP' }, { type: 'POKEMON_EVOLVED' }]),
  ash.groupEvent({ type: 'POKEMON_CAUGHT', payload: { pokemonId: 'pikachu1' } }),
);
```

:::

### Low-level event groups

You can also build grouped events directly on the event store with `eventStore.groupEvent(...)` — it has the same input interface as [`pushEvent`](./5-pushing-events.md#direct-low-level-pushing) (you provide the `version` yourself), and accepts options like `{ force: true }` on `pushEventGroup`:

```ts
// 👇 Each aggregate has its OWN version — track one per store, never a shared one
const pikachuVersion = pikachu.version; // e.g. 3
const ashVersion = ash.version; // e.g. 7

await EventStore.pushEventGroup(
  pokemonsEventStore.groupEvent({
    // 👇 Correctly typed, explicit version
    aggregateId: 'pikachu1',
    version: pikachuVersion + 1,
    type: 'CAUGHT_BY_TRAINER',
    payload: { trainerId: 'ashKetchum' },
    ...
  }),
  trainersEventStore.groupEvent({
    aggregateId: 'ashKetchum',
    version: ashVersion + 1,
    type: 'POKEMON_CAUGHT',
    payload: { pokemonId: 'pikachu1' },
    ...
  }),
);

// You can also pass options as a first argument
await EventStore.pushEventGroup(
  { force: true },
  pokemonsEventStore.groupEvent({
    ...
  }),
  ...
);
```

:::note

Think of an event group as a **transaction**: a set of writes — across one or more event stores — that must _all_ succeed or _all_ fail, never half-applied.

:::

Like the `pushEvent` API, event groups are designed to throw an `EventAlreadyExistsError` if the transaction has failed, making sure that commands are retried as expected when race conditions arise.

:::info

☝️ When pushing event groups on several event stores, they must use the **same event storage adapter** class.

:::

:::info

☝️ Also, be aware of technical constraints of your event storage solution. For instance, the [`DynamoDBEventStorageAdapter`](https://www.npmjs.com/package/@hamstore/event-storage-adapter-dynamodb)'s implementation is based on [DynamoDB transactions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html), which means that the event stores tables must be in the same region, and that a group cannot contain more than 100 events.

:::
