---
sidebar_position: 2
---

# From hamstore v3 to v4

`@hamstore` v4 is the first major version after the fork from `@castore`. It introduces a series of breaking changes (snapshots, message bus shape tweaks, etc.); this page covers each one as it lands.

The first v4-breaking change splits `EventStore.getAggregate` into two methods:

- a lean `getAggregate` / `getExistingAggregate` that returns **only** the rebuilt aggregate;
- a new `getEventsAndAggregate` / `getExistingEventsAndAggregate` that returns the legacy shape `{ aggregate, events, lastEvent }`.

This is a **preparational** change. On its own it is purely a method rename for callers that need `events`/`lastEvent`. The motivation is that the upcoming snapshot support lets `getAggregate` skip materialising the full event history altogether — when an aggregate is rebuilt from a snapshot, no events need to be loaded at all. Forcing every caller to consume `{ aggregate, events, lastEvent }` would either prevent that optimisation or make `events` semantically misleading (a partial list).

## What changed

### `EventStore.getAggregate` and `EventStore.getExistingAggregate`

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

### New: `getEventsAndAggregate` / `getExistingEventsAndAggregate`

If you actually need `events` or `lastEvent` (e.g. to build a state-carrying message, to log how many events contributed to a state transition, or to write a projection that reacts to the underlying events), use the new methods:

```ts
const { aggregate, events, lastEvent } =
  await pokemonsEventStore.getEventsAndAggregate(pikachuId);

// or, when the aggregate is expected to exist:
const { aggregate, events, lastEvent } =
  await pokemonsEventStore.getExistingEventsAndAggregate(pikachuId);
```

Their return shape is identical to the old `getAggregate` / `getExistingAggregate`.

`getEventsAndAggregate` accepts three mutually exclusive options for selecting
which events the call returns. The `aggregate` always reflects the full history
(or `maxVersion` if set), regardless of which mode is used.

#### `fromVersion: N` — events from a known checkpoint

Filters the returned `events` array to `version >= N`. Intended for incremental
projection / "events since checkpoint" patterns, e.g. a read-side projection
that has already processed events up to version `V` and wants to catch up:

```ts
const { aggregate, events } =
  await pokemonsEventStore.getEventsAndAggregate(pikachuId, {
    fromVersion: lastProcessedVersion + 1,
  });
```

When the EventStore has snapshots configured, `fromVersion` also bounds which
snapshot may seed the aggregate: only snapshots with
`aggregate.version < fromVersion` are eligible.

#### `fromLatestSnapshot: true` — events read on top of the latest snapshot

Use the latest available snapshot to seed the aggregate, and return only the
events read on top of it. Falls back to the full history if no snapshot is
applicable. Useful when you want the speed benefit of snapshots and only care
about the events that contributed to the current state since the cache:

```ts
const { aggregate, events } =
  await pokemonsEventStore.getEventsAndAggregate(pikachuId, {
    fromLatestSnapshot: true,
  });
```

#### `lastN: K` — at least the last K events

Guarantees that at least the last `K` events of the aggregate's history (up to
`maxVersion`) appear in the returned `events` array. The snapshot picker is
unconstrained; if the snapshot already covers more than `aggregate.version - K`
events, the missing earlier events are re-fetched in a second read. Useful when
the caller wants a recent slice (e.g. to render a "recent activity" panel) but
doesn't need the full history:

```ts
const { aggregate, events, lastEvent } =
  await pokemonsEventStore.getEventsAndAggregate(pikachuId, {
    lastN: 10,
  });
```

The three options are mutually exclusive at the type level — passing more than
one is a TypeScript error.

### `AggregateGetter` type

The exported `AggregateGetter` type now corresponds to the lean `getAggregate` shape and no longer takes the `EVENT_DETAIL` type parameter. The legacy shape is exposed under a new type name:

```ts
// v3
type Lean = AggregateGetter<EventDetail, MyAggregate>;
type Existing = AggregateGetter<EventDetail, MyAggregate, true>;

// v4
type Lean = AggregateGetter<MyAggregate>;
type Existing = AggregateGetter<MyAggregate, true>;
type Full = EventsAndAggregateGetter<EventDetail, MyAggregate>;
type ExistingFull = EventsAndAggregateGetter<EventDetail, MyAggregate, true>;
```

## Migration recipe

A simple pass over your codebase:

1. Find every call to `eventStore.getAggregate(...)` / `eventStore.getExistingAggregate(...)`.
2. If the caller only uses `aggregate`, no change is needed beyond confirming the return-type shape.
3. If the caller uses `events` and/or `lastEvent`, rename the call to `getEventsAndAggregate` / `getExistingEventsAndAggregate`. The argument list and the return shape are unchanged.
4. Update any references to the `AggregateGetter<EVENT_DETAIL, AGGREGATE, …>` type:
    - When the value is the lean getter, drop the `EVENT_DETAIL` type argument: `AggregateGetter<AGGREGATE, …>`.
    - When the value is the full-history getter, switch to `EventsAndAggregateGetter<EVENT_DETAIL, AGGREGATE, …>`.

If you mock `getAggregate` in tests with `vi.spyOn(...).mockResolvedValue({ aggregate, events, lastEvent })`, drop `events` and `lastEvent`:

```diff
 vi.spyOn(eventStore, 'getAggregate')
-  .mockResolvedValue({ aggregate, events, lastEvent });
+  .mockResolvedValue({ aggregate });
```

## What this unlocks

`getAggregate` no longer being contractually required to expose the full event list lets the snapshot integration (next on the v4 roadmap) seed the aggregate from a snapshot and only fetch the trailing events on top of it — without forcing a misleading "partial" `events` array on every caller. Callers that genuinely need the full history opt into it explicitly via `getEventsAndAggregate`, which is also the right place to think about whether you need to load the full history at all.
