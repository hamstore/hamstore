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

const assertOpenNewAggregateOutput: A.Equals<
  ReturnType<typeof pokemonsEventStore.openNewAggregate>,
  PokemonHandle
> = 1;
assertOpenNewAggregateOutput;

// --- STATIC FACTORIES preserve the concrete store subtype in the handle ---

const assertStaticOpenOutput: A.Equals<
  ReturnType<typeof AggregateHandle.open<typeof pokemonsEventStore>>,
  Promise<PokemonHandle>
> = 1;
assertStaticOpenOutput;

const assertStaticOpenExistingOutput: A.Equals<
  ReturnType<typeof AggregateHandle.openExisting<typeof pokemonsEventStore>>,
  Promise<PokemonHandle>
> = 1;
assertStaticOpenExistingOutput;

const assertStaticForNewOutput: A.Equals<
  ReturnType<typeof AggregateHandle.forNew<typeof pokemonsEventStore>>,
  PokemonHandle
> = 1;
assertStaticForNewOutput;

const assertStaticFromOutput: A.Equals<
  ReturnType<typeof AggregateHandle.from<typeof pokemonsEventStore>>,
  PokemonHandle
> = 1;
assertStaticFromOutput;

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

// --- GROUP EVENT / GROUP EVENTS ---

const assertGroupEventOutput: A.Equals<
  ReturnType<PokemonHandle['groupEvent']>,
  GroupedEvent<PokemonEventDetails, PokemonAggregate>
> = 1;
assertGroupEventOutput;

// --- CHAINED METHODS MIRROR THE INPUT LENGTH (fixed-size tuples) ---
//
// `pushEvents` / `groupEvents` are generic over a `const` tuple of inputs, so a
// concrete N-element call returns an N-element tuple (not a `[]`). We observe
// the *call-site* instantiation via the return type of a never-invoked probe —
// a conditional-inference `extends (inputs: I) => infer R` would only see the
// generic instantiated at its (open-ended) constraint.

declare const handle: PokemonHandle;

function groupEventsProbe() {
  return handle.groupEvents([
    { type: 'POKEMON_LEVELED_UP' },
    { type: 'POKEMON_LEVELED_UP' },
  ]);
}

function pushEventsProbe() {
  return handle.pushEvents([
    { type: 'POKEMON_LEVELED_UP' },
    { type: 'POKEMON_LEVELED_UP' },
  ]);
}

const assertGroupEventsTuple: A.Equals<
  ReturnType<typeof groupEventsProbe>,
  [
    GroupedEvent<PokemonEventDetails, PokemonAggregate>,
    GroupedEvent<PokemonEventDetails, PokemonAggregate>,
  ]
> = 1;
assertGroupEventsTuple;

const assertPushEventsTuple: A.Equals<
  Awaited<ReturnType<typeof pushEventsProbe>>,
  {
    events: [PokemonEventDetails, PokemonEventDetails];
    nextAggregate: PokemonAggregate;
  }
> = 1;
assertPushEventsTuple;
