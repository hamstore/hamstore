import type { A } from 'ts-toolbelt';

import type { AggregateHandle, EventStore } from '~/eventStore';
import type { pokemonsEventStore } from '~/eventStore/eventStore.fixtures.test';

import type { ConnectedEventStore } from './connectedEventStore';
import type {
  pokemonsEventStoreWithNotificationMessageQueue,
  pokemonsEventStoreWithStateCarryingMessageBus,
} from './connectedEventStore.fixtures.test';

// --- EXTENDS ---

const assertExtendsConnectedEventStore: A.Extends<
  typeof pokemonsEventStoreWithStateCarryingMessageBus,
  ConnectedEventStore
> = 1;
assertExtendsConnectedEventStore;

const assertExtendsEventStore: A.Extends<
  typeof pokemonsEventStoreWithStateCarryingMessageBus,
  EventStore
> = 1;
assertExtendsEventStore;

const assertExtendsOriginalEventStore: A.Extends<
  typeof pokemonsEventStoreWithStateCarryingMessageBus,
  typeof pokemonsEventStore
> = 1;
assertExtendsOriginalEventStore;

// --- OPEN* PRESERVE THE WRAPPER TYPE (polymorphic `this`) ---
//
// The `open*` methods are instance fields typed `AggregateOpener<this>`, so on a
// `ConnectedEventStore` the handle is bound to the *wrapper* (not the inner
// store) — that is what keeps its commits publishing through the wrapper.

type ConnectedStore = typeof pokemonsEventStoreWithNotificationMessageQueue;

const assertOpenAggregateBindsWrapper: A.Equals<
  ReturnType<ConnectedStore['openAggregate']>,
  Promise<AggregateHandle<ConnectedStore>>
> = 1;
assertOpenAggregateBindsWrapper;

const assertOpenNewAggregateBindsWrapper: A.Equals<
  ReturnType<ConnectedStore['openNewAggregate']>,
  AggregateHandle<ConnectedStore>
> = 1;
assertOpenNewAggregateBindsWrapper;
