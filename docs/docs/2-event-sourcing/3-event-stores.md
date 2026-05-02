---
sidebar_position: 3
---

# 📙 Event Store

Once you've defined your [event types](./1-events.md) and how to [aggregate](./2-aggregates-reducers.md) them, you can bundle them together in an `EventStore` class. Each event store in your application represents a business entity.

:::note

Think of event stores as _"what tables would be in CRUD"_, except that instead of directly updating data, you just append new events to it!

:::

![Event Store](../../assets/docSchemas/eventStore.png)

In Hamstore, `EventStore` classes are NOT responsible for actually storing data (this will come with [event storage adapters](./4-fetching-events.md)). But rather to provide a boilerplate-free and type-safe interface to perform many actions such as:

- Listing aggregate ids
- Accessing events of an aggregate
- Building an aggregate with the reducer
- Pushing new events etc.

```ts
import { EventStore } from '@hamstore/core';

const pokemonsEventStore = new EventStore({
  eventStoreId: 'POKEMONS',
  eventTypes: [
    pokemonAppearedEventType,
    pokemonCaughtEventType,
    pokemonLeveledUpEventType,
    ...
  ],
  reducer: pokemonsReducer,
});
// ...and that's it 🥳
```

:::info

☝️ The `EventStore` class is the heart of Hamstore, it even gave Hamstore (and [Castore](https://github.com/castore-dev/castore), which it is forked from) its name!

:::

<details>
<summary>
  <b>🔧 Reference</b>
</summary>

**Constructor:**

- <code>eventStoreId <i>(string)</i></code>: A string identifying the event store
- <code>eventTypes <i>(EventType[])</i></code>: The list of event types in the event store
- <code>reduce <i>(EventType[])</i></code>: A <a href="../aggregates-reducers">reducer function</a> that can be applied to the store event types
- <code>onEventPushed <i>(?(pushEventResponse: PushEventResponse) => Promise&lt;void&gt;)</i></code>: To run a callback after events are pushed (input is exactly the return value of the <code>pushEvent</code> method)
- <code>eventStorageAdapter <i>(?EventStorageAdapter)</i></code>: See <a href="../fetching-events">fetching events</a>
- <code>snapshotStorageAdapter <i>(?SnapshotStorageAdapter)</i></code>: See <a href="../../reacting-to-events/snapshots">snapshots</a>
- <code>snapshotConfig <i>(?SnapshotConfig)</i></code>: See <a href="../../reacting-to-events/snapshots">snapshots</a>

> ☝️ The return type of the `reducer` is used to infer the `Aggregate` type of the `EventStore`, so it is important to type it explicitely.

---

**Properties:**

- <code>eventStoreId <i>(string)</i></code>

```ts
const pokemonsEventStoreId = pokemonsEventStore.eventStoreId;
// => 'POKEMONS'
```

- <code>eventTypes <i>(EventType[])</i></code>

```ts
const pokemonsEventTypes = pokemonsEventStore.eventTypes;
// => [pokemonAppearedEventType, pokemonCaughtEventType...]
```

- <code>reduce <i>((Aggregate, EventType) => Aggregate)</i></code>

```ts
const reducer = pokemonsEventStore.reduce;
// => pokemonsReducer
```

- <code>onEventPushed <i>(?(pushEventResponse: PushEventResponse) => Promise&lt;void&gt;)</i></code>: Callback to run after events are pushed

```ts
const onEventPushed = pokemonsEventStore.onEventPushed;
// => undefined (we did not provide one in this example)
```

- <code>eventStorageAdapter <i>(?EventStorageAdapter)</i></code>: See <a href="../fetching-events">fetching events</a>

```ts
const eventStorageAdapter = pokemonsEventStore.eventStorageAdapter;
// => undefined (we did not provide one in this example)
```

> ☝️ The `eventStorageAdapter` is not read-only so you do not have to provide it right away.

- <code>snapshotStorageAdapter <i>(?SnapshotStorageAdapter)</i></code>: See <a href="../../reacting-to-events/snapshots">snapshots</a>
- <code>snapshotConfig <i>(?SnapshotConfig)</i></code>: See <a href="../../reacting-to-events/snapshots">snapshots</a>

```ts
const snapshotStorageAdapter = pokemonsEventStore.snapshotStorageAdapter;
const snapshotConfig = pokemonsEventStore.snapshotConfig;
// => both undefined (we did not provide them in this example)
```

> ☝️ Both fields are assignable in context. Re-assigning `snapshotConfig` recompiles the cached `shouldSaveSnapshot` / `shouldKeepSnapshot` predicates once.

---

**Sync Methods:**

- <code>getEventStorageAdapter <i>(() => EventStorageAdapter)</i></code>: Returns the event store event storage adapter if it exists. Throws an <code>UndefinedEventStorageAdapterError</code> if it doesn't.

```ts
import { UndefinedEventStorageAdapterError } from '@hamstore/core';

expect(() => pokemonsEventStore.getEventStorageAdapter()).toThrow(
  new UndefinedEventStorageAdapterError({ eventStoreId: 'POKEMONS' }),
);
// => true
```

- <code>getSnapshotStorageAdapter <i>(() => SnapshotStorageAdapter)</i></code>: Returns the event store snapshot storage adapter if it exists. Throws an <code>UndefinedSnapshotStorageAdapterError</code> if it doesn't. See <a href="../../reacting-to-events/snapshots">snapshots</a>.

- <code>buildAggregate <i>((eventDetails: EventDetail[], initialAggregate?: Aggregate) => Aggregate | undefined)</i></code>: Applies the event store reducer to a serie of events.

```ts
const myPikachuAggregate = pokemonsEventStore.buildAggregate(myPikachuEvents);
```

- <code>groupEvent <i>((eventDetail: EventDetail, opt?: OptionsObj) => GroupedEvent)</i></code>: See <a href="../joining-data">joining data</a>.

---

**Async Methods:**

The following methods interact with the data layer of your event store through its [`EventStorageAdapter`](./4-fetching-events.md). They will throw an `UndefinedEventStorageAdapterError` if you did not provide one.

- <code>getEvents <i>((aggregateId: string, opt?: OptionsObj) => Promise&lt;ResponseObj&gt;)</i></code>: Retrieves the events of an aggregate, ordered by <code>version</code>. Returns an empty array if no event is found for this <code>aggregateId</code>.

  `OptionsObj` contains the following properties:
  - <code>minVersion <i>(?number)</i></code>: To retrieve events above a certain version
  - <code>maxVersion <i>(?number)</i></code>: To retrieve events below a certain version
  - <code>limit <i>(?number)</i></code>: Maximum number of events to retrieve
  - <code>reverse <i>(?boolean = false)</i></code>: To retrieve events in reverse order (does not require to swap <code>minVersion</code> and <code>maxVersion</code>)

  `ResponseObj` contains the following properties:
  - <code>events <i>(EventDetail[])</i></code>: The aggregate events (possibly empty)

```ts
const { events: allEvents } = await pokemonsEventStore.getEvents(myPikachuId);
// => typed as PokemonEventDetail[] 🙌

// 👇 Retrieve a range of events
const { events: rangedEvents } = await pokemonsEventStore.getEvents(
  myPikachuId,
  {
    minVersion: 2,
    maxVersion: 5,
  },
);

// 👇 Retrieve the last event of the aggregate
const { events: onlyLastEvent } = await pokemonsEventStore.getEvents(
  myPikachuId,
  {
    reverse: true,
    limit: 1,
  },
);
```

- <code>getAggregate <i>((aggregateId: string, opt?: OptionsObj) => Promise&lt;ResponseObj&gt;)</i></code>: Retrieves the events of an aggregate and builds it. When [snapshots](../3-reacting-to-events/5-snapshots.md) are configured, the aggregate is seeded from the latest applicable snapshot and only the events on top of it are loaded.

  `OptionsObj` contains the following properties:
  - <code>maxVersion <i>(?number)</i></code>: To retrieve aggregate below a certain version

  `ResponseObj` contains the following properties:
  - <code>aggregate <i>(?Aggregate)</i></code>: The aggregate (possibly <code>undefined</code>)

```ts
const { aggregate: myPikachu } =
  await pokemonsEventStore.getAggregate(myPikachuId);
// => typed as PokemonAggregate | undefined 🙌

// 👇 Retrieve an aggregate below a certain version
const { aggregate: pikachuBelowVersion5 } =
  await pokemonsEventStore.getAggregate(myPikachuId, {
    maxVersion: 5,
  });
```

> ☝️ If you also need the underlying events (e.g. to publish a state-carrying message or to count how many events contributed to the aggregate), use <code>getEventsAndAggregate</code> below — `getAggregate` only returns the rebuilt aggregate so that snapshot-based reads can skip materialising the full event history.

- <code>getExistingAggregate <i>((aggregateId: string, opt?: OptionsObj) => Promise&lt;ResponseObj&gt;)</i></code>: Same as <code>getAggregate</code> method, but ensures that the aggregate exists. Throws an <code>AggregateNotFoundError</code> if no event is found for this <code>aggregateId</code>.

```ts
import { AggregateNotFoundError } from '@hamstore/core';

expect(async () =>
  pokemonsEventStore.getExistingAggregate(unexistingId),
).resolves.toThrow(
  new AggregateNotFoundError({
    eventStoreId: 'POKEMONS',
    aggregateId: unexistingId,
  }),
);
// true

const { aggregate } =
  await pokemonsEventStore.getExistingAggregate(aggregateId);
// => 'aggregate' is always defined 🙌
```

- <code>getEventsAndAggregate <i>((aggregateId: string, opt?: OptionsObj) => Promise&lt;ResponseObj&gt;)</i></code>: Retrieves the events of an aggregate, builds it, and returns both. When [snapshots](../3-reacting-to-events/5-snapshots.md) are configured, the aggregate is still seeded from the latest applicable snapshot — only the returned `events` array is shaped by the options below.

  `OptionsObj` contains <code>maxVersion <i>(?number)</i></code> plus exactly one (or none) of:
  - <code>fromVersion <i>(?number)</i></code>: Filters the returned events to <code>version >= fromVersion</code>. The aggregate is unaffected.
  - <code>fromLatestSnapshot <i>(?true)</i></code>: Returns only the events read on top of the latest snapshot (falls back to the full history if no snapshot applies).
  - <code>lastN <i>(?number)</i></code>: Guarantees that at least the last <code>N</code> events appear in the returned array; the snapshot picker is unconstrained and any missing earlier events are re-fetched in a second read.

  `ResponseObj` contains the following properties:
  - <code>aggregate <i>(?Aggregate)</i></code>: The aggregate (possibly <code>undefined</code>)
  - <code>events <i>(EventDetail[])</i></code>: The aggregate events (possibly empty)
  - <code>lastEvent <i>(?EventDetail)</i></code>: The last event (possibly <code>undefined</code>)

```ts
// Default — full history.
const { aggregate, events, lastEvent } =
  await pokemonsEventStore.getEventsAndAggregate(myPikachuId);

// Events from a known checkpoint.
const { events } = await pokemonsEventStore.getEventsAndAggregate(myPikachuId, {
  fromVersion: lastProcessedVersion + 1,
});

// At least the last 10 events.
const { events: recent } =
  await pokemonsEventStore.getEventsAndAggregate(myPikachuId, { lastN: 10 });
```

- <code>getExistingEventsAndAggregate <i>((aggregateId: string, opt?: OptionsObj) => Promise&lt;ResponseObj&gt;)</i></code>: Same as <code>getEventsAndAggregate</code>, but ensures that the aggregate exists. Throws an <code>AggregateNotFoundError</code> if no event is found for this <code>aggregateId</code>.

```ts
const { aggregate, events, lastEvent } =
  await pokemonsEventStore.getExistingEventsAndAggregate(aggregateId);
// => 'aggregate' and 'lastEvent' are always defined 🙌
```

- <code>pushEvent <i>((eventDetail: EventDetail, opt?: OptionsObj) => Promise&lt;ResponseObj&gt;)</i></code>: Pushes a new event to the event store. The <code>timestamp</code> is optional (we keep it available as it can be useful in tests & migrations). If not provided, it is automatically set as <code>new Date().toISOString()</code>. Throws an <code>EventAlreadyExistsError</code> if an event already exists for the corresponding <code>aggregateId</code> and <code>version</code> (see section on <a href="../pushing-events">race conditions</a>).

  `OptionsObj` contains the following properties:
  - <code>prevAggregate <i>(?Aggregate)</i></code>: The aggregate at the current version, i.e. before having pushed the event. Can be useful in some cases like when using the <a href="../../reacting-to-events/connected-event-store">ConnectedEventStore class</a>
  - <code>force <i>(?boolean)</i></code>: To force push the event even if one already exists for the corresponding <code>aggregateId</code> and <code>version</code>. Any existing event will be overridden, so use with extra care, mainly in <a href="https://www.npmjs.com/package/@hamstore/lib-dam">data migrations</a>.

  `ResponseObj` contains the following properties:
  - <code>event <i>(EventDetail)</i></code>: The complete event (includes the <code>timestamp</code>)
  - <code>nextAggregate <i>(?Aggregate)</i></code>: The aggregate at the new version, i.e. after having pushed the event. Returned only if the event is an initial event, if the <code>prevAggregate</code> option was provided, or when using a <a href="../../reacting-to-events/connected-event-store">ConnectedEventStore class</a> connected to a <a href="../../reacting-to-events/messages">state-carrying message bus or queue</a>

```ts
const { event: completeEvent, nextAggregate } =
  await pokemonsEventStore.pushEvent(
    {
      aggregateId: myPikachuId,
      version: lastVersion + 1,
      type: 'POKEMON_LEVELED_UP', // <= event type is correctly typed 🙌
      payload, // <= payload is typed according to the provided event type 🙌
      metadata, // <= same goes for metadata 🙌
      // timestamp is optional
    },
    // Not required - Can be useful in some cases
    { prevAggregate },
  );
```

- <code>listAggregateIds <i>((opt?: OptionsObj) => Promise&lt;ResponseObj&gt;)</i></code>: Retrieves the list of <code>aggregateId</code> of an event store, ordered by the <code>timestamp</code> of their initial event. Returns an empty array if no aggregate is found.

  `OptionsObj` contains the following properties:
  - <code>limit <i>(?number)</i></code>: Maximum number of aggregate ids to retrieve
  - <code>initialEventAfter <i>(?string)</i></code>: To retrieve aggregate ids that appeared after a certain timestamp
  - <code>initialEventBefore <i>(?string)</i></code>: To retrieve aggregate ids that appeared before a certain timestamp
  - <code>reverse <i>(?boolean)</i></code>: To retrieve the aggregate ids in reverse order
  - <code>pageToken <i>(?string)</i></code>: To retrieve a paginated result of aggregate ids

  `ResponseObj` contains the following properties:
  - <code>aggregateIds <i>(string[])</i></code>: The list of aggregate ids
  - <code>nextPageToken <i>(?string)</i></code>: A token for the next page of aggregate ids if one exists. The nextPageToken carries the previously used options, so you do not have to provide them again (though you can still do it to override them).

```ts
const accAggregateIds: string = [];

const { aggregateIds: firstPage, nextPageToken } =
  await pokemonsEventStore.listAggregateIds({
    limit: 20,
  });

accAggregateIds.push(...firstPage);

if (nextPageToken) {
  const { aggregateIds: secondPage } =
    await pokemonsEventStore.listAggregateIds({
      // 👇 Previous limit of 20 is passed through the page token
      pageToken: nextPageToken,
    });
  accAggregateIds.push(...secondPage);
}
```

---

**Type Helpers:**

- `EventStoreId`: Returns the `EventStore` id

```ts
import type { EventStoreId } from '@hamstore/core';

type PokemonsEventStoreId = EventStoreId<typeof pokemonsEventStore>;
// => 'POKEMONS'
```

- `EventStoreEventTypes`: Returns the `EventStore` list of events types

```ts
import type { EventStoreEventTypes } from '@hamstore/core';

type PokemonEventTypes = EventStoreEventTypes<typeof pokemonsEventStore>;
// => [typeof pokemonAppearedEventType, typeof pokemonCaughtEventType...]
```

- `EventStoreEventDetails`: Returns the union of all the `EventStore` possible events details

```ts
import type { EventStoreEventDetails } from '@hamstore/core';

type PokemonEventDetails = EventStoreEventDetails<typeof pokemonsEventStore>;
// => EventTypeDetail<typeof pokemonAppearedEventType>
// | EventTypeDetail<typeof pokemonCaughtEventType>
// | ...
```

- `EventStoreReducer`: Returns the `EventStore` reducer

```ts
import type { EventStoreReducer } from '@hamstore/core';

type PokemonsReducer = EventStoreReducer<typeof pokemonsEventStore>;
// => Reducer<PokemonAggregate, PokemonEventDetails>
```

- `EventStoreAggregate`: Returns the `EventStore` aggregate

```ts
import type { EventStoreAggregate } from '@hamstore/core';

type SomeAggregate = EventStoreAggregate<typeof pokemonsEventStore>;
// => PokemonAggregate
```

</details>
