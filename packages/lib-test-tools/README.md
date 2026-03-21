# Test tools

Test tooling for the [Hamstore](https://github.com/hamstore/hamstore) library.

## 📥 Installation

```bash
# npm
npm install --save-dev @hamstore/lib-test-tools

# pnpm
pnpm add --dev @hamstore/lib-test-tools
```

This package has `@hamstore/core` as peer dependency, so you will have to install it as well:

```bash
# npm
npm install @hamstore/core

# pnpm
pnpm add @hamstore/core
```

## 👩‍💻 Usage

### MockEventStore

The `mockEventStore` util returns a copy of the provided `EventStore` connected to an [`InMemoryEventStorageAdapter`](https://github.com/hamstore/hamstore/tree/main/packages/event-storage-adapter-in-memory), empty or with a given initial state. It follows the `EventStore` interface but adds a `reset` method to reset it to the provided initial state. The original event store is not muted.

```ts
import { EventStore } from '@hamstore/core';
import { mockEventStore } from '@hamstore/lib-test-tools';

const pokemonsEventStore = new EventStore({
  // ...
});

const pokemonAppearCommand = new Command({
  // ...
});

describe('My awesome test', () => {
  const mockedPokemonsEventStore = mockEventStore(pokemonsEventStore, [
    // 👇 Provide initial state (list of event details) in a type-safe way
    {
      aggregateId: '123',
      version: 1,
      type: 'POKEMON_APPEARED',
      // ...
    },
  ]);

  beforeEach(() => {
    // 👇 Reset to initial state
    mockedPokemonsEventStore.reset();
  });

  it('pushes a POKEMON_APPEARED event', async () => {
    const { pokemonId } = await pokemonAppearCommand.handler({
      requiredEventsStores: [mockedPokemonsEventStore],
      // ...
    });

    const { events } = await mockedPokemonsEventStore.getEvents(pokemonId);

    expect(events).toHaveLength(1);
  });
});
```

### MuteEventStore

Unlike `mockEventStore`, the `muteEventStore` util mutes the original event store and replace its storage adapter with an `InMemoryEventStorageAdapter` matching the provided initial state.

```ts
import { EventStore } from '@hamstore/core';
import { muteEventStore } from '@hamstore/lib-test-tools';

const pokemonsEventStore = new EventStore({
  // ...
});

const functionUsingTheEventStore = async () => {
  // ...
};

describe('My awesome test', () => {
  muteEventStore(pokemonsEventStore, [
    // 👇 Provide initial state (list of event details) in a type-safe way
    {
      aggregateId: '123',
      version: 1,
      type: 'POKEMON_APPEARED',
      // ...
    },
  ]);

  it('does something incredible', async () => {
    await functionUsingTheEventStore();

    // 👇 Use the original event store
    const { events } = await pokemonsEventStore.getEvents('123');

    expect(events).toHaveLength(1);
  });
});
```
