---
sidebar_position: 4
---

# Packages

## 🎯 Test Tools

The official [test tools package](https://www.npmjs.com/package/@hamstore/lib-test-tools) facilitates the writing of unit tests: It allows mocking event stores, populating them with an initial state and resetting them to it in a boilerplate-free and type-safe way:

```ts
import { mockEventStore } from '@hamstore/lib-test-tools';

describe('My awesome test', () => {
  const mockedPokemonsEventStore = mockEventStore(pokemonsEventStore, [
    // 👇 Provide initial state (list of event details) in a type-safe way
    {
      aggregateId: 'pikachu1',
      version: 1,
      type: 'POKEMON_APPEARED',
      // ...
    },
  ]);

  beforeEach(() => {
    // 👇 Reset to initial state
    mockedPokemonsEventStore.reset();
  });
});
```

## 🌊 Dam

[Dam](https://www.npmjs.com/package/@hamstore/lib-dam) is a suite of utils that facilitates data migration and maintenance operations with Hamstore (for instance, dispatching all the events of an event store - ordered by their timestamps - to a message queue):

```ts
import { pourEventStoreEvents } from '@hamstore/lib-dam';

const maintenanceMessageQueue = new NotificationMessageQueue({
  sourceEventStores: [pokemonEventStore],
  // ...
});

await pourEventStoreEvents({
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
```

## 🌈 React Visualizer

The [React Visualizer](https://www.npmjs.com/package/@hamstore/lib-react-visualizer) package exposes a React component to visualize, design and manually test Hamstore event stores and commands.

Here is a [hosted example](https://hamstore.github.io/hamstore/visualizer/), based on this documentation code snippets about pokemons and trainers. You can find the related source code (commands & event stores) in the [demo package](https://github.com/hamstore/hamstore/tree/main/demo/blueprint/src).

## 📅 Event Types

To add run-time validation to your event types:

- [JSON Schema Event Type](https://www.npmjs.com/package/@hamstore/event-type-json-schema): DRY `EventType` definition using [JSON Schemas](http://json-schema.org/understanding-json-schema/reference/index.html) and [`json-schema-to-ts`](https://github.com/ThomasAribart/json-schema-to-ts)
- [Zod Event Type](https://www.npmjs.com/package/@hamstore/event-type-zod): DRY `EventType` definition using [`zod`](https://github.com/colinhacks/zod)

## 💾 Event Storage Adapters

- [DynamoDB Event Storage Adapter](https://www.npmjs.com/package/@hamstore/event-storage-adapter-dynamodb): Implementation of the `EventStorageAdapter` interface based on DynamoDB.
- [Redux Event Storage Adapter](https://www.npmjs.com/package/@hamstore/event-storage-adapter-redux): Implementation of the `EventStorageAdapter` interface based on a Redux store, along with tooling to configure the store and hooks to read from it efficiently.
- [Postgres Event Storage Adapter](https://www.npmjs.com/package/@hamstore/event-storage-adapter-postgres): Implementation of the `EventStorageAdapter` interface using a Postgres database.
- [In-Memory Event Storage Adapter](https://www.npmjs.com/package/@hamstore/event-storage-adapter-in-memory): Implementation of the `EventStorageAdapter` interface using a local Node/JS object. To be used in manual or unit tests.

## 🏋️‍♂️ Commands

To add run-time validation to your commands:

- [JSON Schema Command](https://www.npmjs.com/package/@hamstore/command-json-schema): DRY `Command` definition using [JSON Schemas](http://json-schema.org/understanding-json-schema/reference/index.html) and [`json-schema-to-ts`](https://github.com/ThomasAribart/json-schema-to-ts)
- [Zod Command](https://www.npmjs.com/package/@hamstore/command-zod): DRY `Command` definition using [`zod`](https://github.com/colinhacks/zod)

## 📨 Message Queue Adapters

- [SQS Message Queue Adapter](https://www.npmjs.com/package/@hamstore/message-queue-adapter-sqs): Implementation of the `MessageQueueAdapter` interface based on AWS SQS.
- [SQS + S3 Message Queue Adapter](https://www.npmjs.com/package/@hamstore/message-queue-adapter-sqs-s3): Implementation of the `MessageQueueAdapter` interface based on AWS SQS and S3.
- [In-Memory Message Queue Adapter](https://www.npmjs.com/package/@hamstore/message-queue-adapter-in-memory): Implementation of the `MessageQueueAdapter` interface using a local Node/JS queue. To be used in manual or unit tests.

## 🚌 Message Buses Adapters

- [EventBridge Message Bus Adapter](https://www.npmjs.com/package/@hamstore/message-bus-adapter-event-bridge): Implementation of the `MessageBusAdapter` interface based on AWS EventBridge.
- [EventBridge + S3 Message Bus Adapter](https://www.npmjs.com/package/@hamstore/message-bus-adapter-event-bridge-s3): Implementation of the `MessageBusAdapter` interface based on AWS EventBridge and S3.
- [In-Memory Message Bus Adapter](https://www.npmjs.com/package/@hamstore/message-bus-adapter-in-memory): Implementation of the `MessageBusAdapter` interface using a local Node/JS event emitter. To be used in manual or unit tests.
