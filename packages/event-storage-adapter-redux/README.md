# Redux Event Storage Adapter

DRY Hamstore [`EventStorageAdapter`](https://hamstore.github.io/hamstore/docs/event-sourcing/fetching-events/) implementation using a Redux store.

## 📥 Installation

```bash
# npm
npm install @hamstore/event-storage-adapter-redux

# yarn
yarn add @hamstore/event-storage-adapter-redux
```

This package has `@hamstore/core`, `@reduxjs/toolkit` (above v1.9) and `react-redux` (above v8) as peer dependencies, so you will have to install them as well:

```bash
# npm
npm install @hamstore/core @reduxjs/toolkit react-redux

# yarn
yarn add @hamstore/core @reduxjs/toolkit react-redux
```

## 👩‍💻 Usage

### Direct usage

If you do not already use Redux in your app, you can simply use the `configureHamstore` util:

```tsx
import { Provider } from 'react-redux';

import { configureHamstore } from '@hamstore/event-storage-adapter-redux';

const store = configureHamstore({
  eventStores: [pokemonsEventStore, trainersEventStore],
});

const MyReactApp = () => (
  <Provider store={store}>
    <App />
  </Provider>
);
```

And that's it 🙌 `configureHamstore` not only configures the Redux store but also connects it to the event stores by replacing their `eventStorageAdapter`.

You can use the `pushEvent` method as usual:

```tsx
const CatchPokemonButton = ({ pokemonId }) => (
  <Button
    onClick={async () => {
      await pokemonsEventStore.pushEvent({
        aggregateId: pokemonId,
        type: 'POKEMON_CAUGHT',
        version: currentPokemonVersion + 1,
      });
    }}
  />
);
```

You can also use the other methods, but it's simpler to use the following built-in hooks.

### Hooks

You can use the `useAggregateEvents`, `useAggregate`, `useExistingAggregate` and `useAggregateIds` hooks to read data from the store. Their interface is the same as the event store methods, but synchronous.

```tsx
import { useAggregateIds } from '@hamstore/event-storage-adapter-redux';

const AggregateIdsList = () => {
  // 🙌 Will synchronously return the store data, as well as hook the component to it
  const { aggregateIds } = useAggregateIds(pokemonsEventStore, { limit: 20 });

  return aggregateIds.map(aggregateId => (
    <Aggregate key={aggregateId} aggregateId={aggregateId} />
  ));
};

const Aggregate = ({ aggregateId }) => {
  const { aggregate } = useExistingAggregate(pokemonsEventStore, aggregateId);

  // 🙌 aggregate is correctly typed
  return <p>{aggregate.name}</p>;
};
```

Thanks to the magic of Redux, pushing a new event to an aggregate will only trigger re-renders of components hooked to the said aggregate. The same goes when listing aggregate ids: Only creating a new aggregate will trigger a re-render.

### Configure with another store

If you already use Redux, you can merge the Hamstore Redux store with your own.

First, know that event stores events are stored as Redux "slices". Their name is their `eventStoreId`, prefixed by a customizable string (`@hamstore` by default).

You can use the `getHamstoreReducers` util to generate the Hamstore Redux reducers, and merge them with your own:

```tsx
import { Provider } from 'react-redux';

import {
  ReduxEventStorageAdapter,
  getHamstoreReducers,
} from '@hamstore/event-storage-adapter-redux';

const hamstoreReducers = getHamstoreReducers({
  eventStores: [pokemonsEventStore, trainersEventStore],
  // 👇 Optional
  prefix: 'customPrefix',
});

const store = configureStore({
  reducer: {
    ...hamstoreReducers,
    customReducer,
  },
});

// 👇 Connect the event stores to the store
eventStores.forEach(eventStore => {
  eventStore.eventStorageAdapter = new ReduxEventStorageAdapter({
    store,
    eventStoreId: eventStore.eventStoreId,
    // 👇 Don't forget the prefix if one has been provided
    prefix: 'customPrefix',
  });
});

const MyReactApp = () => (
  <Provider store={store}>
    <App />
  </Provider>
);
```
