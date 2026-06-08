import type { A } from 'ts-toolbelt';

import type { GroupedEvent } from '~/event/groupedEvent';
import { AggregateHandle } from '~/eventStore';

import {
  PokemonAggregate,
  PokemonEventDetails,
  pokemonsEventStore,
} from './eventStore.fixtures.test';

type PokemonHandle = AggregateHandle<typeof pokemonsEventStore>;
type ExistingPokemonHandle = AggregateHandle<typeof pokemonsEventStore, true>;

// --- OPEN AGGREGATE binds the handle to the store ---

const assertOpenAggregateOutput: A.Equals<
  ReturnType<typeof pokemonsEventStore.openAggregate>,
  Promise<PokemonHandle>
> = 1;
assertOpenAggregateOutput;

// `openExistingAggregate` tightens the handle to one with a defined `aggregate`
// (the same `EXISTS` flag `getExistingAggregate` uses), so no `!`/guard needed.
const assertOpenExistingAggregateOutput: A.Equals<
  ReturnType<typeof pokemonsEventStore.openExistingAggregate>,
  Promise<ExistingPokemonHandle>
> = 1;
assertOpenExistingAggregateOutput;

const assertOpenNewAggregateOutput: A.Equals<
  ReturnType<typeof pokemonsEventStore.openNewAggregate>,
  PokemonHandle
> = 1;
assertOpenNewAggregateOutput;

// --- `aggregate` DEFINEDNESS follows the EXISTS flag, statically ---

const assertOpenAggregateMaybeUndefined: A.Equals<
  Awaited<ReturnType<typeof pokemonsEventStore.openAggregate>>['aggregate'],
  PokemonAggregate | undefined
> = 1;
assertOpenAggregateMaybeUndefined;

const assertOpenExistingAggregateDefined: A.Equals<
  Awaited<
    ReturnType<typeof pokemonsEventStore.openExistingAggregate>
  >['aggregate'],
  PokemonAggregate
> = 1;
assertOpenExistingAggregateDefined;

const assertOpenNewAggregateMaybeUndefined: A.Equals<
  ReturnType<typeof pokemonsEventStore.openNewAggregate>['aggregate'],
  PokemonAggregate | undefined
> = 1;
assertOpenNewAggregateMaybeUndefined;

// --- STATIC FACTORIES preserve the concrete store subtype in the handle ---

const assertStaticOpenOutput: A.Equals<
  ReturnType<typeof AggregateHandle.open<typeof pokemonsEventStore>>,
  Promise<PokemonHandle>
> = 1;
assertStaticOpenOutput;

const assertStaticOpenExistingOutput: A.Equals<
  ReturnType<typeof AggregateHandle.openExisting<typeof pokemonsEventStore>>,
  Promise<ExistingPokemonHandle>
> = 1;
assertStaticOpenExistingOutput;

const assertStaticForNewOutput: A.Equals<
  ReturnType<typeof AggregateHandle.forNew<typeof pokemonsEventStore>>,
  PokemonHandle
> = 1;
assertStaticForNewOutput;

// `from` is handed a defined aggregate, so it also yields the `EXISTS = true`
// handle (a defined `aggregate`).
const assertStaticFromOutput: A.Equals<
  ReturnType<typeof AggregateHandle.from<typeof pokemonsEventStore>>,
  ExistingPokemonHandle
> = 1;
assertStaticFromOutput;

const assertExistingHandleAggregateDefined: A.Equals<
  ExistingPokemonHandle['aggregate'],
  PokemonAggregate
> = 1;
assertExistingHandleAggregateDefined;

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

// --- FUNCTION INPUTS RECEIVE A DEFINED AGGREGATE ---
//
// A function input folds against the aggregate built from the preceding events
// in the same call. Since the first input must be a plain input, by the time
// any function runs at least one event has been folded, so its parameter is a
// defined `PokemonAggregate` (no `| undefined`) — even on a maybe-handle.

handle.groupEvents([
  { type: 'POKEMON_LEVELED_UP' },
  (aggregate) => {
    const assertFnAggregateDefined: A.Equals<
      typeof aggregate,
      PokemonAggregate
    > = 1;
    assertFnAggregateDefined;

    return { type: 'POKEMON_LEVELED_UP' };
  },
]);

// A function is NOT allowed as the FIRST input — the first event has no
// predecessor in the call to depend on.
handle.groupEvents([
  // @ts-expect-error - first input must be a plain input, not a function
  () => ({ type: 'POKEMON_LEVELED_UP' }),
  { type: 'POKEMON_LEVELED_UP' },
]);
