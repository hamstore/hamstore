---
sidebar_position: 2
toc_max_heading_level: 2
---

# From hamstore v3 to v4

`@hamstore` v4 is the first major version after the fork from `@castore`. It introduces a series of breaking changes (snapshots, message bus shape tweaks, etc.); this page covers each one as it lands.

## `getAggregate` split: lean read + new `getAggregateAndEvents`

The first v4-breaking change splits `EventStore.getAggregate` into two methods:

- a lean `getAggregate` / `getExistingAggregate` that returns **only** the rebuilt aggregate;
- a new `getAggregateAndEvents` / `getExistingAggregateAndEvents` that returns the legacy shape `{ aggregate, events, lastEvent }`.

This is a **preparational** change. On its own it is purely a method rename for callers that need `events`/`lastEvent`. The motivation is that the upcoming snapshot support lets `getAggregate` skip materialising the full event history altogether — when an aggregate is rebuilt from a snapshot, no events need to be loaded at all. Forcing every caller to consume `{ aggregate, events, lastEvent }` would either prevent that optimisation or make `events` semantically misleading (a partial list).

### What changed

#### `EventStore.getAggregate` and `EventStore.getExistingAggregate`

**Before (v3):**

```ts
const { aggregate, events, lastEvent } =
  await pokemonsEventStore.getAggregate(pikachuId);
```

**After (v4):**

```ts
const { aggregate } = await pokemonsEventStore.getAggregate(pikachuId);
```

The same applies to `getExistingAggregate`:

```ts
// v3
const { aggregate, events, lastEvent } =
  await pokemonsEventStore.getExistingAggregate(pikachuId);

// v4
const { aggregate } =
  await pokemonsEventStore.getExistingAggregate(pikachuId);
```

#### New: `getAggregateAndEvents` / `getExistingAggregateAndEvents`

If you actually need `events` or `lastEvent` (e.g. to build a state-carrying message, to log how many events contributed to a state transition, or to write a projection that reacts to the underlying events), use the new methods:

```ts
const { aggregate, events, lastEvent } =
  await pokemonsEventStore.getAggregateAndEvents(pikachuId);

// or, when the aggregate is expected to exist:
const { aggregate, events, lastEvent } =
  await pokemonsEventStore.getExistingAggregateAndEvents(pikachuId);
```

Their return shape is identical to the old `getAggregate` / `getExistingAggregate`.

`getAggregateAndEvents` accepts an additional `fromVersion` option that filters
the returned `events` array to versions `>= fromVersion`. The `aggregate` still
reflects the full history (or `maxVersion` if set). This is intended for
incremental projection / "events since checkpoint" patterns, e.g. a read-side
projection that has already processed events up to version `V` and wants to
catch up:

```ts
const { aggregate, events } =
  await pokemonsEventStore.getAggregateAndEvents(pikachuId, {
    fromVersion: lastProcessedVersion + 1,
  });
```

#### `AggregateGetter` type

The exported `AggregateGetter` type now corresponds to the lean `getAggregate` shape and no longer takes the `EVENT_DETAIL` type parameter. The full shape is exposed under a new type name:

```ts
// v3
type Lean = AggregateGetter<EventDetail, MyAggregate>;
type Existing = AggregateGetter<EventDetail, MyAggregate, true>;

// v4
type Lean = AggregateGetter<MyAggregate>;
type Existing = AggregateGetter<MyAggregate, true>;
type Full = AggregateAndEventsGetter<EventDetail, MyAggregate>;
type ExistingFull = AggregateAndEventsGetter<EventDetail, MyAggregate, true>;
```

### Migration recipe

A simple pass over your codebase:

1. Find every call to `eventStore.getAggregate(...)` / `eventStore.getExistingAggregate(...)`.
2. If the caller only uses `aggregate`, no change is needed beyond confirming the return-type shape.
3. If the caller uses `events` and/or `lastEvent`, rename the call to `getAggregateAndEvents` / `getExistingAggregateAndEvents`. The argument list and the return shape are unchanged.
4. Update any references to the `AggregateGetter<EVENT_DETAIL, AGGREGATE, …>` type:
    - When the value is the lean getter, drop the `EVENT_DETAIL` type argument: `AggregateGetter<AGGREGATE, …>`.
    - When the value is the full-history getter, switch to `AggregateAndEventsGetter<EVENT_DETAIL, AGGREGATE, …>`.

If you mock `getAggregate` in tests with `vi.spyOn(...).mockResolvedValue({ aggregate, events, lastEvent })`, drop `events` and `lastEvent`:

```diff
 vi.spyOn(eventStore, 'getAggregate')
-  .mockResolvedValue({ aggregate, events, lastEvent });
+  .mockResolvedValue({ aggregate });
```

### What this unlocks

`getAggregate` no longer being contractually required to expose the full event list lets the snapshot integration (next on the v4 roadmap) seed the aggregate from a snapshot and only fetch the trailing events on top of it — without forcing a misleading "partial" `events` array on every caller. Callers that genuinely need the full history opt into it explicitly via `getAggregateAndEvents`, which is also the right place to think about whether you need to load the full history at all.

## `AggregateHandle`: a new write API (breaking for `implements EventStore`)

v4 adds **Aggregate Handles** — an immutable, version-pinned write handle for a single aggregate that removes the fetch → increment → push boilerplate from commands and cross-aggregate writes. You open one through three new `EventStore` methods — `openAggregate`, `openExistingAggregate`, `openNewAggregate` — then push through it (`pushEvent` / `pushEvents` / `groupEvent` / `groupEvents`). See the [`AggregateHandle` reference](../2-event-sourcing/5-pushing-events.md) for the full API; you're encouraged to start using them.

### Adopting handles (optional, recommended)

Nothing forces you to change existing code — handles are purely additive. But they collapse the usual *fetch → check → bump `version` → push* dance into opening a handle and pushing through it. The handle owns the aggregate's `id` and pins its expected `version`, so you stop threading those by hand. Two conversions from the demo:

**Single aggregate.** `openExistingAggregate` throws `AggregateNotFoundError` instead of returning `undefined`, so the existence guard goes away, and the version bump is implicit:

```ts
// Before
const { aggregate } = await pokemonsEventStore.getAggregate(pokemonId);
if (aggregate === undefined) throw new Error('Pokemon not found');
if (aggregate.level === 99) throw new Error('Pokemon level maxed out');

await pokemonsEventStore.pushEvent({
  aggregateId: pokemonId,
  version: aggregate.version + 1,
  type: 'LEVELLED_UP',
});
```

```ts
// After
const pikachu = await pokemonsEventStore.openExistingAggregate(pokemonId);
if (pikachu.aggregate.level === 99) throw new Error('Pokemon level maxed out');

await pikachu.pushEvent({ type: 'LEVELLED_UP' });
```

**Across aggregates.** Each handle owns its own `aggregateId` and `version`, so a grouped write drops the repeated `aggregateId` and every `version + 1`:

```ts
// Before
const [{ aggregate: pokemon }, { aggregate: trainer }] = await Promise.all([
  pokemonsEventStore.getAggregate(pokemonId),
  trainersEventStore.getAggregate(trainerId),
]);
if (pokemon === undefined) throw new Error('Pokemon not found');
if (trainer === undefined) throw new Error('Trainer not found');
if (pokemon.status === 'caught') throw new Error('Pokemon already caught');

await EventStore.pushEventGroup(
  pokemonsEventStore.groupEvent({
    aggregateId: pokemonId,
    version: pokemon.version + 1,
    type: 'CAUGHT_BY_TRAINER',
    payload: { trainerId },
  }),
  trainersEventStore.groupEvent({
    aggregateId: trainerId,
    version: trainer.version + 1,
    type: 'POKEMON_CAUGHT',
    payload: { pokemonId },
  }),
);
```

```ts
// After
const [pokemon, trainer] = await Promise.all([
  pokemonsEventStore.openExistingAggregate(pokemonId),
  trainersEventStore.openExistingAggregate(trainerId),
]);
if (pokemon.aggregate.status === 'caught') throw new Error('Pokemon already caught');

await EventStore.pushEventGroup(
  pokemon.groupEvent({ type: 'CAUGHT_BY_TRAINER', payload: { trainerId } }),
  trainer.groupEvent({ type: 'POKEMON_CAUGHT', payload: { pokemonId } }),
);
```

### Breaking change: `class … implements EventStore`

The three new methods widen the `EventStore` contract, which is breaking **only** in one case:

- **`new EventStore(…)` and `class … extends EventStore` → no change.** The methods are concrete and inherited.
- **`class … implements EventStore` (a wrapper / decorator, like `ConnectedEventStore`) → must add the three methods.** Declare them as instance properties assigned in the constructor and delegate to `AggregateHandle`'s static factories — exactly what `ConnectedEventStore` does, matching how the store's other members (`getEvents`, `pushEvent`, …) are typed:

```ts
import {
  AggregateHandle,
  type EventStore,
  type GetAggregateOptions,
} from '@hamstore/core';

class MyEventStore implements EventStore</* … */> {
  // … existing members …

  openAggregate: (
    aggregateId: string,
    options?: GetAggregateOptions,
  ) => Promise<AggregateHandle<this>>;

  openExistingAggregate: (
    aggregateId: string,
    options?: GetAggregateOptions,
  ) => Promise<AggregateHandle<this, true>>;

  openNewAggregate: (aggregateId: string) => AggregateHandle<this>;

  constructor(/* … */) {
    // … existing assignments …

    this.openAggregate = (aggregateId, options) =>
      AggregateHandle.open(this, aggregateId, options);

    this.openExistingAggregate = (aggregateId, options) =>
      AggregateHandle.openExisting(this, aggregateId, options);

    this.openNewAggregate = aggregateId =>
      AggregateHandle.forNew(this, aggregateId);
  }
}
```

The `, true` on `openExistingAggregate`'s return is the existence flag: it marks the handle's `aggregate` as statically defined (the same flag `getExistingAggregate` uses), so callers don't need a `!` or undefined check.

Passing the store to the factories is what makes the handle route its reads — and the publish-side commit — through it, so a wrapper keeps its event-publishing behaviour without any extra rebind.
