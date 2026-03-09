import { EventStore } from '@hamstore/core';
import { configureStore, EnhancedStore } from '@reduxjs/toolkit';

import { ReduxEventStorageAdapter } from '~/adapter';
import { getHamstoreReducers } from '~/getHamstoreReducers';
import { EventStoresReduxState } from '~/types';
import { DEFAULT_PREFIX } from '~/utils/getEventStoreSliceName';

export const configureHamstore = <EVENT_STORES extends EventStore[]>({
  eventStores,
  prefix = DEFAULT_PREFIX,
}: {
  eventStores: EVENT_STORES;
  prefix?: string;
}): EnhancedStore<EventStoresReduxState<EVENT_STORES>> => {
  const hamstoreReducers = getHamstoreReducers({ eventStores, prefix });

  const store = configureStore({ reducer: hamstoreReducers });

  eventStores.forEach(eventStore => {
    eventStore.eventStorageAdapter = new ReduxEventStorageAdapter({
      store,
      eventStoreId: eventStore.eventStoreId,
      prefix,
    });
  });

  return store as EnhancedStore<EventStoresReduxState<EVENT_STORES>>;
};
