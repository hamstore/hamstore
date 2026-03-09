# Dam

Data maintenance & migration tooling for the [Hamstore](https://github.com/hamstore/hamstore) library.

## 📥 Installation

```bash
# npm
npm install --save-dev @hamstore/lib-dam

# yarn
yarn add --dev @hamstore/lib-dam
```

This package has `@hamstore/core` as peer dependency, so you will have to install it as well:

```bash
# npm
npm install @hamstore/core

# yarn
yarn add @hamstore/core
```

## 👩‍💻 Usage

`@hamstore/lib-dam` exposes a series of utils that scan past events and re-publish them in [message channels](https://github.com/hamstore/hamstore#--event-driven-architecture) – or _"pour them"_ as in _"pouring water from a container to another"_ 🫗.

Those utils are typically very useful for data maintenance and migration. They publish messages with the `replay` option enabled and can be **rate limited** to limit impact on production traffic. They are the following:

- [`pourEventStoreAggregateIds`](#poureventstoreaggregateids): Pour all the aggregate ids of an event store in an `AggregateExistsMessageChannel`.
- [`pourAggregateEvents`](#pouraggregateevents): Pour all the events of a specific aggregate in a provided `NotificationMessageChannel`.
- [`pourEventStoreEvents`](#poureventstoreevents): Pour all the events of an event store in a provided `NotificationMessageChannel`.
- [`pourEventStoreCollectionEvents`](#poureventstorecollectionevents): Pour all the events of a collection of event stores in a provided `NotificationMessageChannel`.

### `pourEventStoreAggregateIds`

Pour all the aggregate ids of an event store in a provided [`AggregateExistsMessageChannel`](https://github.com/hamstore/hamstore#--event-driven-architecture). Aggregate ids are published in the order in which they are retrieved (by default, ordered by their initial timestamps).

```ts
import { pourEventStoreAggregateIds } from '@hamstore/lib-dam';

// 👇 ...or AggregateExistsMessageBus
const maintenanceMessageQueue = new AggregateExistsMessageQueue({
  sourceEventStores: [pokemonEventStore],
  ...
});

const results = await pourEventStoreAggregateIds({
  eventStore: pokemonEventStore,
  messageChannel: maintenanceMessageQueue,
  // 👇 Optional `listAggregateIds` options (except "pageToken")
  options: {
    limit: 100,
    initialEventAfter: '2020-01-01T00:00:00.000Z',
    initialEventBefore: '2023-01-01T00:00:00.000Z',
    reverse: false,
  },
  // 👇 Optional rate limit (messages/second)
  rateLimit: 100,
});

const {
  // 👇 Count of poured aggregate ids
  pouredAggregateIdCount,
  // 👇 Infos about first/last scanned aggregates (potentially undefined)
  firstScannedAggregate,
  lastScannedAggregate,
} = results;
```

### `pourAggregateEvents`

Pour all the events of a specific aggregate in a provided [`NotificationMessageChannel`](https://github.com/hamstore/hamstore#--event-driven-architecture). Events are published in the order in which they are retrieved (by default, ordered by their timestamps).

```ts
import { pourAggregateEvents } from '@hamstore/lib-dam';

// 👇 ...or NotificationMessageBus
const maintenanceMessageQueue = new NotificationMessageQueue({
  sourceEventStores: [pokemonEventStore],
  ...
});

const results = await pourAggregateEvents({
  eventStore: pokemonEventStore,
  messageChannel: maintenanceMessageQueue,
  aggregateId: 'pikachu1',
  // 👇 Optional `getEvents` options
  options: {
    minVersion: 1,
    maxVersion: 10,
    limit: 5,
    reverse: false,
  },
  // 👇 Optional `timestamp` filters
  filters: {
    from: '2020-01-01T00:00:00.000Z',
    to: '2023-01-01T00:00:00.000Z',
  },
  // 👇 Optional rate limit (messages/second)
  rateLimit: 100,
});

const {
  // 👇 Count of poured events
  pouredEventCount,
  // 👇 Infos about first/last scanned events (potentially undefined)
  firstPouredEvent,
  lastPouredEvent,
} = results;
```

### `pourEventStoreEvents`

Pour all the events of an event store in a provided [`NotificationMessageChannel`](https://github.com/hamstore/hamstore#--event-driven-architecture). Events are published in the order of their timestamps (independently of their aggregate).

```ts
import { pourEventStoreEvents } from '@hamstore/lib-dam';

// 👇 ...or NotificationMessageBus
const maintenanceMessageQueue = new NotificationMessageQueue({
  sourceEventStores: [pokemonEventStore],
  ...
});

const results = await pourEventStoreEvents({
  eventStore: pokemonEventStore,
  messageChannel: maintenanceMessageQueue,
  // 👇 Optional `timestamp` filters
  filters: {
    from: '2020-01-01T00:00:00.000Z',
    to: '2023-01-01T00:00:00.000Z',
  },
  // 👇 Optional rate limit (messages/second)
  rateLimit: 100,
});

const {
  // 👇 Count of poured events
  pouredEventCount,
  // 👇 Infos about first/last scanned aggregates (potentially undefined)
  firstScannedAggregate,
  lastScannedAggregate,
} = results;
```

### `pourEventStoreCollectionEvents`

Pour all the events of a **collection of event stores** in a provided [`NotificationMessageChannel`](https://github.com/hamstore/hamstore#--event-driven-architecture). Events are published in the order of their timestamps (independently of their aggregate and event store).

```ts
import { pourEventStoreEvents } from '@hamstore/lib-dam';

// 👇 ...or NotificationMessageBus
const maintenanceMessageQueue = new NotificationMessageQueue({
  sourceEventStores: [pokemonEventStore, trainerEventStore],
  ...
});

const results = await pourEventStoreCollectionEvents({
  eventStores: [pokemonEventStore, trainerEventStore],
  messageChannel: maintenanceMessageQueue,
  // 👇 Optional `timestamp` filters
  filters: {
    from: '2020-01-01T00:00:00.000Z',
    to: '2023-01-01T00:00:00.000Z',
  },
  // 👇 Optional rate limit (messages/second)
  rateLimit: 100,
});

const {
  // 👇 Count of poured events
  pouredEventCount,
  // 👇 Infos about first/last scanned aggregates (potentially undefined)
  scans: {
    // 👇 By event store id
    POKEMONS: { firstScannedAggregate, lastScannedAggregate },
    TRAINERS: { firstScannedAggregate, lastScannedAggregate },
  },
} = results;
```
