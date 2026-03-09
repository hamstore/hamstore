# In Memory Event Storage Adapter

DRY Hamstore [`EventStorageAdapter`](https://hamstore.github.io/hamstore/docs/event-sourcing/fetching-events/) implementation using a JS object.

This class is mainly useful for manual and unit tests. It is obviously not recommended for production uses 🙂

## 📥 Installation

```bash
# npm
npm install @hamstore/event-storage-adapter-in-memory

# yarn
yarn add @hamstore/event-storage-adapter-in-memory
```

This package has `@hamstore/core` as peer dependency, so you will have to install it as well:

```bash
# npm
npm install @hamstore/core

# yarn
yarn add @hamstore/core
```

## 👩‍💻 Usage

```ts
import { InMemoryEventStorageAdapter } from '@hamstore/event-storage-adapter-in-memory';

const pokemonsEventStorageAdapter = new InMemoryEventStorageAdapter({
  // 👇 You can specify an initial state for your event store
  initialEvents: [
    {
      aggregateId: '123',
      ...
    },
  ],
});

const pokemonsEventStore = new EventStore({
  ...
  eventStorageAdapter: pokemonsEventStorageAdapter,
});
```

## 🤔 How it works

This adapter simply persists events in a local dictionary. You can retrieve it at all time through the `eventStore` property:

```ts
const eventStore = pokemonsEventStore.eventStore;
// => { [aggregateId: string]: EventDetail[] }
```
