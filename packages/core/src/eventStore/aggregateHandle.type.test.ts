import type { A } from 'ts-toolbelt';

import type { GroupedEvent } from '~/event/groupedEvent';
import { AggregateHandle } from '~/eventStore';

import {
  PokemonAggregate,
  PokemonEventDetails,
  pokemonsEventStore,
} from './eventStore.fixtures.test';

type PokemonHandle = AggregateHandle<typeof pokemonsEventStore>;

// --- OPEN AGGREGATE binds the handle to the store ---

const assertOpenAggregateOutput: A.Equals<
  ReturnType<typeof pokemonsEventStore.openAggregate>,
  Promise<PokemonHandle>
> = 1;
assertOpenAggregateOutput;

const assertOpenAggregateFromOutput: A.Equals<
  ReturnType<typeof pokemonsEventStore.openAggregateFrom>,
  PokemonHandle
> = 1;
assertOpenAggregateFromOutput;

// --- HANDLE FIELDS ---

const assertHandleAggregate: A.Equals<
  PokemonHandle['aggregate'],
  PokemonAggregate | undefined
> = 1;
assertHandleAggregate;

const assertHandleNextVersion: A.Equals<PokemonHandle['nextVersion'], number> =
  1;
assertHandleNextVersion;

// --- PUSH EVENT: nextAggregate is NON-optional (no `!` needed at call sites) ---

const assertPushEventOutput: A.Equals<
  Awaited<ReturnType<PokemonHandle['pushEvent']>>,
  { event: PokemonEventDetails; nextAggregate: PokemonAggregate }
> = 1;
assertPushEventOutput;

const assertPushEventsOutput: A.Equals<
  Awaited<ReturnType<PokemonHandle['pushEvents']>>,
  { events: PokemonEventDetails[]; nextAggregate: PokemonAggregate }
> = 1;
assertPushEventsOutput;

// --- GROUP EVENT / GROUP EVENTS ---

const assertGroupEventOutput: A.Equals<
  ReturnType<PokemonHandle['groupEvent']>,
  GroupedEvent<PokemonEventDetails, PokemonAggregate>
> = 1;
assertGroupEventOutput;

const assertGroupEventsOutput: A.Equals<
  ReturnType<PokemonHandle['groupEvents']>,
  GroupedEvent<PokemonEventDetails, PokemonAggregate>[]
> = 1;
assertGroupEventsOutput;
