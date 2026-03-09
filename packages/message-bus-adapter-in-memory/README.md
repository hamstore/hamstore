# In Memory Message Bus Adapter

DRY Hamstore [`MessageBus`](https://hamstore.github.io/hamstore/docs/reacting-to-events/message-buses/) definition using [Event Emitters](https://nodejs.org/api/events.html#events).

## 📥 Installation

```bash
# npm
npm install @hamstore/message-bus-adapter-in-memory

# yarn
yarn add @hamstore/message-bus-adapter-in-memory
```

This package has `@hamstore/core` as peer dependency, so you will have to install it as well:

```bash
# npm
npm install @hamstore/core

# yarn
yarn add @hamstore/core
```

## 👩‍💻 Usage

The simplest way to use this adapter is to use the `attachTo` static method:

```ts
// 👇 Note: EventEmitter is a native NodeJS library
// Outside of NodeJS (like browsers) you can use the event-emitter package
import { EventEmitter } from 'events';

import { InMemoryMessageBusAdapter } from '@hamstore/message-bus-adapter-in-memory';

const eventEmitter = new EventEmitter();

const messageBusAdapter = InMemoryMessageBusAdapter.attachTo(
  appMessageBus,
  { eventEmitter }, // <= Constructor arguments
);
```

This will make your `messageBusAdapter` inherit from your `appMessageBus` types while plugging them together 🙌

You can also instanciate one on its own, but notice the code duplication:

```ts
import type { MessageBusMessage } from '@hamstore/core';
import { InMemoryMessageBusAdapter } from '@hamstore/message-bus-adapter-in-memory';

const messageBusAdapter = new InMemoryMessageBusAdapter<
  MessageBusMessage<typeof appMessageBus>
>({ eventEmitter });

appMessageBus.messageBusAdapter = messageBusAdapter;
```

## 👂 Add listeners

Similarly to event emitters, the `inMemoryMessageBusAdapter` exposes an `on` method that takes two arguments:

- A filter patterns to optionally specify an `eventStoreId` and an event `type` to listen to (`NotificationEventBus` and `StateCarryingEventBus` only), and wether replayed events should be included
- An async callback to execute if the message matches the filter pattern

```ts
// 👇 Listen to all messages
messageBusAdapter.on({}, async message => {
  // 🙌 Correctly typed!
  const { eventStoreId, event } = message;
});

// 👇 Listen only to pokemons messages
messageBusAdapter.on({ eventStoreId: 'POKEMONS' }, async message => {
  // 🙌 Correctly typed!
  const { eventStoreId, event } = message;
});

// 👇 Listen only to POKEMON_APPEARED created messages
messageBusAdapter.on(
  { eventStoreId: 'POKEMONS', eventType: 'POKEMON_APPEARED' },
  async message => {
    // 🙌 Correctly typed!
    const { eventStoreId, event } = message;
  },
);

// 👇 Include replayed events
messageBusAdapter.on(
  { eventStoreId: 'POKEMONS', eventType: 'POKEMON_APPEARED', onReplay: true },
  async message => {
    // 🙌 Correctly typed!
    const { eventStoreId, event } = message;
  },
);
```

For more control, the callback has access to more context through its second argument:

```ts
messageBusAdapter.on(
  ...,
  async (message, context) => {
    const { eventStoreId, event } = message;
    const {
      // 👇 See "Retry policy" section below
      attempt,
      retryAttemptsLeft,
      // 👇 If event is replayed
      replay,
    } = context;
  },
);
```

The same callback can be re-used with different filter patterns. If a message matches several of them, it will still be triggered once:

```ts
const logSomething = async () => {
  console.log('Received message!');
};

messageBusAdapter.on({ eventStoreId: 'POKEMONS' }, logSomething);
messageBusAdapter.on(
  { eventStoreId: 'POKEMONS', eventType: 'POKEMON_APPEARED' },
  logSomething,
);

await appMessageBus.publishMessage(pokemonAppearedEvent);

// 👇 Console output (only once):
// "Received message!"
```

> Listeners cannot be removed for now.

## ♻️ Retry policy

This adapter will retry failed messages handling on a per listener basis. You can specify a different retry policy than the default one via its constructor arguments:

- <code>retryAttempts <i>(?number = 2)</i></code>: The maximum number of retry attempts for a message in case of listener execution failure. If all the retries fail, the error is logged with `console.error`, and the message ignored.
- <code>retryDelayInMs <i>(?number = 30000)</i></code>: The minimum delay in milliseconds between a listener execution failure and its first retry.
- <code>retryBackoffRate <i>(?number = 2)</i></code>: A factor applied to the `retryDelayInMs` at each subsequent retry.

```ts
const messageBusAdapter = InMemoryMessageBusAdapter.attachTo(appMessageBus, {
  eventEmitter,
  retryAttempts: 3,
  retryDelayInMs: 10000,
  retryBackoffRate: 1.5,
});

// 👇 Alternatively
const messageBusAdapter = new InMemoryMessageBusAdapter<
  MessageBusMessage<typeof appMessageBus>
>({
  eventEmitter,
  retryAttempts: 3,
  retryDelayInMs: 10000,
  retryBackoffRate: 1.5,
});
```

For instance, if a message is listened by two listeners A and B, with listener A continously failing, the sequence of code execution (with the default retry policy) will look like this:

- Listener A execution: ❌ Failure
- Listener B execution: ✅ Success
- _30 seconds of delay_
- Listener A execution: ❌ Failure
- _60 seconds of delay (30x2)_
- Listener A execution: ❌ Failure
- _No more retry attempt, error is logged_
