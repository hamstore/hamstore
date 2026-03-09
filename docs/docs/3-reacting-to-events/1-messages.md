---
sidebar_position: 1
---

# ✉️ Messages

Event Sourcing integrates very well with [event-driven architectures](https://en.wikipedia.org/wiki/Event-driven_architecture). In a traditional architecture, you would need to design your system events (or **messages** for clarity) separately from your data. With Event Sourcing, they can simply **broadcast the business events you already designed**.

In Hamstore, we distinguish three types of message:

- **AggregateExists messages** which only carry aggregate ids (mainly for maintenance purposes)
- **Notification messages** which also carry event details
- **State-carrying messages** which also carry their corresponding aggregates

![Messages Types](../../assets/docSchemas/messageTypes.png)

In Hamstore, they are implemented by the `AggregateExistsMessage`, `NotificationMessage` and `StateCarryingMessage` TS types:

```ts
// AggregateExistsMessage
import type {
  AggregateExistsMessage,
  EventStoreAggregateExistsMessage,
} from '@hamstore/core';

type PokemonAggregateExistsMessage = AggregateExistsMessage<'POKEMONS'>;

// 👇 Equivalent to:
type PokemonAggregateExistsMessage = {
  eventStoreId: 'POKEMONS';
  aggregateId: string;
};

// // 👇 Also equivalent to:
type PokemonAggregateExistsMessage = EventStoreAggregateExistsMessage<
  typeof pokemonsEventStore
>;
```

```ts
// NotificationMessage
import type {
  NotificationMessage,
  EventStoreNotificationMessage,
} from '@hamstore/core';

type PokemonEventNotificationMessage = NotificationMessage<
  'POKEMONS',
  PokemonEventDetails
>;

// 👇 Equivalent to:
type PokemonEventNotificationMessage = {
  eventStoreId: 'POKEMONS';
  event: PokemonEventDetails;
};

// 👇 Also equivalent to:
type PokemonEventNotificationMessage = EventStoreNotificationMessage<
  typeof pokemonsEventStore
>;
```

```ts
// StateCarryingMessage
import type {
  StateCarryingMessage,
  EventStoreStateCarryingMessage,
} from '@hamstore/core';

type PokemonEventStateCarryingMessage = StateCarryingMessage<
  'POKEMONS',
  PokemonEventDetails,
  PokemonAggregate
>;

// 👇 Equivalent to:
type PokemonEventStateCarryingMessage = {
  eventStoreId: 'POKEMONS';
  event: PokemonEventDetails;
  aggregate: PokemonAggregate
};

// 👇 Also equivalent to:
type PokemonEventStateCarryingMessage = EventStoreStateCarryingMessage<
  typeof pokemonsEventStore
>;
```

All types of message can be published through message channels, i.e. [Message Queues](./2-message-queues.md) or [Message Buses](./3-message-buses.md).
