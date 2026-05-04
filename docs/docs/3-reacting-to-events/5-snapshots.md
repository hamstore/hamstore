---
sidebar_position: 5
---

# 📸 Snapshots

As events pile up in your event stores, the cost of rebuilding aggregates from their full history can become an issue. Hamstore lets you periodically persist **snapshots** of your aggregates, so subsequent reads only need to fetch the events written _after_ the snapshot:

```ts
// Without snapshots — read every event of the aggregate, then reduce them all.
//   storage roundtrip: events 1..N
//   reducer applications: N

// With snapshots — read the latest snapshot, then only the events on top of it.
//   storage roundtrips: 1× snapshot + events (snapshot.version + 1)..N
//   reducer applications: N − snapshot.version
```

In v4, snapshots are **cache-only**: they accelerate `getAggregate` reads but they are NOT a source of truth — the event log still is. Snapshots can be regenerated from events at any time, and any unrecognised or outdated snapshot is silently ignored (the aggregate falls back to a full event-log replay). Compaction-style snapshots, where the snapshot _replaces_ part of the event log, are out of scope for now.

:::info

Snapshots are an **opt-in optimisation**. An event store with no `snapshotStorageAdapter` reads exactly as it did in v3.

:::

## Configuring an event store with snapshots

Two pieces are needed:

- A `SnapshotStorageAdapter` — the storage backend for snapshots.
- A `SnapshotConfig` — when to save snapshots, what to do with old ones, and how to react to reducer changes.

```ts
import { EventStore } from '@hamstore/core';
import { InMemorySnapshotStorageAdapter } from '@hamstore/snapshot-storage-adapter-in-memory';

const pokemonsEventStore = new EventStore({
  eventStoreId: 'POKEMONS',
  eventTypes: pokemonEventTypes,
  reducer: pokemonsReducer,
  eventStorageAdapter: pokemonsEventStorageAdapter,

  // 👇 Provide a snapshot storage adapter
  snapshotStorageAdapter: new InMemorySnapshotStorageAdapter(),
  // 👇 ...and a snapshot config
  snapshotConfig: {
    currentReducerVersion: 'v1',
    policy: { strategy: 'EVERY_N_VERSIONS', periodInVersions: 50 },
  },
});

// 🙌 getAggregate now seeds from the latest applicable snapshot when one exists,
//    and saves a new snapshot in the background after a sufficient number of events.
const { aggregate } = await pokemonsEventStore.getAggregate(pikachuId);
```

Both fields are also assignable in context:

```ts
pokemonsEventStore.snapshotStorageAdapter = anotherSnapshotStorageAdapter;
pokemonsEventStore.snapshotConfig = anotherSnapshotConfig;
```

:::info

You can choose to build a snapshot storage adapter that suits your usage. We recommend using an [off-the-shelf adapter](../4-packages.md#-snapshot-storage-adapters) when one exists for your storage solution.

:::

## When to save: `SnapshotPolicy`

The `policy` field of a `SnapshotConfig` decides whether to persist a new snapshot after a successful read or write. It is a discriminated union — pick the strategy that matches the access pattern of your aggregate.

The trigger that lets the EventStore consider a save in the first place is controlled by [`saveOn`](#which-path-triggers-the-save-saveon) (default `'write'`). The policy then decides whether the candidate save fires.

### `NONE`

Never save snapshots automatically. Useful when your application creates snapshots through some other mechanism (a scheduled job, a message-bus listener, etc.):

```ts
{ strategy: 'NONE' }
```

### `EVERY_N_VERSIONS`

Save when the version gap to the previous snapshot reaches `periodInVersions` (or there is no previous snapshot and the aggregate has at least that many versions).

```ts
{ strategy: 'EVERY_N_VERSIONS', periodInVersions: 50 }
```

A predictable choice for aggregates whose event volume grows steadily.

### `EVERY_N_MS_SINCE_LAST`

Save when the elapsed time since the previous snapshot's `savedAt` reaches `periodInMs`. With no previous snapshot the policy fires on the first read.

```ts
{ strategy: 'EVERY_N_MS_SINCE_LAST', periodInMs: 24 * 60 * 60 * 1_000 }
```

Useful for aggregates that are read often but mutated unpredictably, where you care more about wall-clock freshness than about replaying a specific number of events.

### `AUTO`

Adaptive: snapshot more often for high-throughput aggregates and less often for low-throughput ones. The first snapshot is taken once `minPeriodInVersions` is reached; subsequent snapshots use a target version-gap that grows linearly with elapsed time between `minPeriodInMs` and `maxPeriodInMs`, clamped to `[minPeriodInVersions, maxPeriodInVersions]`.

```ts
{
  strategy: 'AUTO',
  minPeriodInVersions: 25,             // default
  maxPeriodInVersions: 500,            // default
  minPeriodInMs: 1 * 60 * 60 * 1_000,  // default — 1 hour
  maxPeriodInMs: 24 * 60 * 60 * 1_000, // default — 24 hours
}
```

The defaults are a reasonable starting point — bump them if your aggregates are very large or very small.

### `CUSTOM`

Bring your own predicate when none of the built-in strategies fits:

```ts
{
  strategy: 'CUSTOM',
  shouldSaveSnapshot: ({ aggregate, previousSnapshot, newEventCount, now }) => {
    // ...return true to persist a new snapshot
  },
}
```

The arguments are documented under `ShouldSaveSnapshotArgs` in the reference block at the bottom of this page.

## Which path triggers the save: `saveOn`

`SnapshotConfig.saveOn` controls which code path is allowed to attempt a snapshot save. It defaults to `'write'`.

```ts
type SnapshotSaveTrigger = 'write' | 'read' | 'both';
```

- `'write'` (default) — save fires after a successful `pushEvent` / `pushEventGroup` if the policy says so. The push needs to know the aggregate's new state, so this only triggers when `nextAggregate` was computed (typically when `prevAggregate` was passed, or for the first event of a new aggregate). No previous snapshot is in scope on this path; see the policy caveats below.
- `'read'` — save fires after `getAggregate` / `getExistingAggregate` / `getAggregateAndEvents` rebuilt the aggregate, using the seed snapshot it was rebuilt from as `previousSnapshot`. This is the only mode that gives the policy full information about the previous snapshot, but it makes reads side-effectful and can race when the same aggregate is read concurrently.
- `'both'` — both paths attempt saves. `putSnapshot` is idempotent at the storage layer, so this is safe but does extra work; useful when most aggregates are mutated through `pushEvent` but some are also written outside hamstore (bulk import, replay) and you still want reads to keep them snapshotted.

### Policy evaluation on the write path

The write path does not have a `previousSnapshot` in scope. To avoid a hidden `getLatestSnapshot` round-trip on every push, policies degrade as follows:

- `EVERY_N_VERSIONS` — evaluated statelessly: `aggregate.version > 0 && aggregate.version % periodInVersions === 0`. Equivalent steady-state behaviour, no extra fetch.
- `EVERY_N_MS_SINCE_LAST` and `AUTO` — cannot be evaluated without `previousSnapshot`, so the write-path always returns `false` for these. Set `saveOn: 'read'` or `'both'` if you need time-based saves.
- `CUSTOM` — your predicate is called with `previousSnapshot: undefined`. Decide what makes sense for your aggregate.

## What to keep: `PruningPolicy`

After a snapshot is saved, an optional pruning step decides which older snapshots to delete. The `pruning` field of a `SnapshotConfig` defaults to `{ strategy: 'NONE' }` — i.e. _no_ inline pruning. This keeps the read path lean (one `putSnapshot`, no `listSnapshots`/`deleteSnapshot` calls) at the cost of letting old snapshots accumulate.

:::info

For low-traffic services and demos, `{ strategy: 'DELETE_PREVIOUS' }` is a reasonable inline default.

For production / serverless, prefer `{ strategy: 'NONE' }` and run pruning **offline** via [`pruneAggregateSnapshots` / `pruneEventStoreSnapshots`](#offline-maintenance) on a schedule. That keeps the hot path's adapter cost predictable while still bounding storage.

:::

### `NONE` (default)

Keep every snapshot. No `listSnapshots` / `deleteSnapshot` calls on save.

```ts
{ strategy: 'NONE' }
```

### `DELETE_PREVIOUS`

Keep only the latest snapshot per aggregate. The newly-saved snapshot is always preserved.

```ts
{ strategy: 'DELETE_PREVIOUS' }
```

### `KEEP_LAST_N`

Keep the latest `n` snapshots per aggregate, delete the rest.

```ts
{ strategy: 'KEEP_LAST_N', n: 5 }
```

### `KEEP_NEWER_THAN_MS`

Keep every snapshot whose `savedAt` is within `ageMs` of "now" (rolling window). Older snapshots are pruned. The newly-saved snapshot is always preserved (snapshots written in the future, e.g. due to clock skew, are also kept).

```ts
{ strategy: 'KEEP_NEWER_THAN_MS', ageMs: 7 * 24 * 60 * 60 * 1_000 } // 7 days
```

### `CUSTOM`

Bring your own per-snapshot predicate when you need to combine clauses (e.g. _"keep last 5, plus everything newer than 7 days"_):

```ts
{
  strategy: 'CUSTOM',
  shouldKeep: ({ key, position, ageMs, now }) =>
    position < 5 || ageMs < 7 * 24 * 60 * 60 * 1_000,
}
```

The arguments are documented under `ShouldKeepSnapshotArgs` in the reference block at the bottom of this page.

## Reducer-version management

Snapshots are tied to a `reducerVersion` so that bumping your reducer invalidates them: snapshots written under a different reducer version are never silently applied to the current reducer.

```ts
snapshotConfig: {
  // 👇 Bump this whenever the reducer's logic or the aggregate shape changes
  currentReducerVersion: 'v2',
  policy: { strategy: 'EVERY_N_VERSIONS', periodInVersions: 50 },
}
```

By default, a stale snapshot is ignored and the aggregate is rebuilt from events. If your reducer change is backwards-compatible and you would rather migrate the snapshot in place, provide a `migrateSnapshotReducerVersion` hook:

```ts
snapshotConfig: {
  currentReducerVersion: 'v2',
  policy: { strategy: 'EVERY_N_VERSIONS', periodInVersions: 50 },

  // 👇 Optional reducer-version migrator
  migrateSnapshotReducerVersion: snapshot => {
    if (snapshot.reducerVersion === 'v1') {
      return {
        ...snapshot,
        reducerVersion: 'v2',
        // ...migrate the aggregate shape if needed
      };
    }

    // Returning `undefined` falls back to a full rebuild from events
    return undefined;
  },
}
```

A common pattern is to derive `currentReducerVersion` from a build identifier (e.g. a commit SHA), or to bump it manually whenever the reducer's logic changes. Once an old reducer version is no longer in flight you can clean its snapshots out with [`cleanUpOutdatedSnapshots`](#offline-maintenance).

## Reading with snapshots

When a `snapshotStorageAdapter` and `snapshotConfig` are configured, every `getAggregate` / `getExistingAggregate` call seeds the rebuild from the latest applicable snapshot, then replays only the events on top of it. The interface and the return shape are unchanged — snapshots are transparent to the caller.

```ts
const { aggregate } = await pokemonsEventStore.getAggregate(pikachuId);
//                                              ^^^^^^^^^^^^^
// Same call as without snapshots — the seed is picked up automatically.
```

`getAggregateAndEvents` / `getExistingAggregateAndEvents` use snapshots too, but they let the caller control _which events_ end up in the returned `events` array. Three mutually-exclusive options shape the read:

### Default — full history

Returns every event of the aggregate, regardless of any snapshot:

```ts
const { aggregate, events, lastEvent } =
  await pokemonsEventStore.getAggregateAndEvents(pikachuId);
```

When a snapshot exists, the aggregate is still seeded from it so reducer applications are saved — only the returned `events` array is loaded in full.

### `fromVersion: N` — events from a known checkpoint

Returns events from version `N` onward. The latest applicable snapshot is used regardless of its position relative to `N`; events are fetched in a single range starting at `min(snapshot.version + 1, N)` so the read covers both what's needed for replay and what the caller asked to receive:

```ts
const { aggregate, events } =
  await pokemonsEventStore.getAggregateAndEvents(pikachuId, {
    fromVersion: lastProcessedVersion + 1,
  });
```

Intended for incremental projection / "events since checkpoint" patterns.

### `fromLatestSnapshot: true` — events on top of the latest snapshot

Use the latest available snapshot to seed the aggregate, and return only the events read on top of it. Falls back to the full history if no snapshot is applicable:

```ts
const { aggregate, events } =
  await pokemonsEventStore.getAggregateAndEvents(pikachuId, {
    fromLatestSnapshot: true,
  });
```

Useful when you want the speed benefit of snapshots and only care about the events that contributed to the current state since the cache.

### `lastN: K` — the last K versions

Returns every event of the aggregate whose version falls in the window `[max(1, aggregate.version - K + 1), aggregate.version]` (further clamped by `maxVersion`). When event versions are contiguous — the typical case — this is exactly the last `K` events; if the version space has holes (e.g. an aggregate whose event log was compacted), fewer than `K` events may be returned. The snapshot picker is unconstrained; if the snapshot's seed sits past the floor (`snapshot.version >= aggregate.version - K + 1`), the missing earlier events are re-fetched in a second read:

```ts
const { aggregate, events, lastEvent } =
  await pokemonsEventStore.getAggregateAndEvents(pikachuId, {
    lastN: 10,
  });
```

Useful when the caller wants a recent slice (e.g. to render a "recent activity" panel) but doesn't need the full history.

:::info

The three options are mutually exclusive at the type level — passing more than one is a TypeScript error.

:::

## Offline maintenance

Hamstore exports three helpers for snapshot maintenance outside the read path. They are designed for cron jobs, scheduled Lambdas, [`@hamstore/lib-dam`](https://www.npmjs.com/package/@hamstore/lib-dam)-style maintenance scripts, etc.

### `pruneAggregateSnapshots`

Prune snapshots for **a single aggregate** according to a `PruningPolicy`. Pages through `listSnapshots({ aggregateId, reducerVersion, reverse: true })` so the worst case is `O(M)` in the number of snapshots for that aggregate.

```ts
import { pruneAggregateSnapshots } from '@hamstore/core';

const { deletedCount } = await pruneAggregateSnapshots(
  snapshotStorageAdapter,
  'POKEMONS',
  pikachuId,
  { policy: { strategy: 'KEEP_LAST_N', n: 5 } },
);
```

### `pruneEventStoreSnapshots`

Prune snapshots **across every aggregate** in an event store. Pages through `listSnapshots({ reducerVersion, reverse: true })` (no `aggregateId` filter) and tracks each aggregate's `position` separately as it sweeps.

```ts
import { pruneEventStoreSnapshots } from '@hamstore/core';

const { deletedCount, aggregateCount } = await pruneEventStoreSnapshots(
  snapshotStorageAdapter,
  'POKEMONS',
  { policy: { strategy: 'KEEP_NEWER_THAN_MS', ageMs: 7 * 24 * 60 * 60 * 1_000 } },
);
```

### `cleanUpOutdatedSnapshots`

Efficiently delete every snapshot written under an outdated `reducerVersion`. With a properly indexed adapter this is `O(M)` in the number of stale snapshots, not `O(table size)`.

```ts
import { cleanUpOutdatedSnapshots } from '@hamstore/core';

const { deletedCount } = await cleanUpOutdatedSnapshots(
  snapshotStorageAdapter,
  'POKEMONS',
  'v1', // outdated reducer version
);
```

Run this after deploying a new `currentReducerVersion`, once you are confident no still-running process will read snapshots written under the old one.

## Error handling

Snapshot reads, fire-and-forget saves and pruning sweeps all throw into the void by default — the EventStore swallows the error so a misbehaving snapshot adapter can't break a `getAggregate` call (the read transparently falls back to events).

To route those errors to your observability stack, provide an `onSnapshotError` hook on the `SnapshotConfig`:

```ts
snapshotConfig: {
  currentReducerVersion: 'v1',
  policy: { strategy: 'EVERY_N_VERSIONS', periodInVersions: 50 },
  onSnapshotError: ({ phase, aggregateId, eventStoreId, error }) => {
    logger.warn('snapshot error', { phase, aggregateId, eventStoreId, error });
  },
}
```

`phase` is `'read'` (read-path failures) or `'save'` (background save failures, including prune failures that occur as part of the same fire-and-forget save). The type union also includes `'prune'` so that future implementations or custom hooks can distinguish prune errors separately.

## Authoring a custom adapter

A `SnapshotStorageAdapter` is a stateless object exposing a fixed set of methods (`getLatestSnapshot`, `getSnapshot`, `putSnapshot`, `deleteSnapshot`, `listSnapshots`). Multiple `EventStore`s can share one adapter, so methods always take the `eventStoreId` via context.

The simplest reference implementation is [`@hamstore/snapshot-storage-adapter-in-memory`](https://www.npmjs.com/package/@hamstore/snapshot-storage-adapter-in-memory) — a single file you can read end to end. Its unit-test suite (`packages/snapshot-storage-adapter-in-memory/src/adapter.unit.test.ts`) doubles as a behavioural reference for what every adapter should satisfy.

<details>
<summary>
  <b>🔧 Reference</b>
</summary>

**`SnapshotConfig`:**

- <code>currentReducerVersion <i>(string)</i></code>: The current reducer fingerprint. Snapshots written under a different value are never silently applied — they are migrated by `migrateSnapshotReducerVersion` if configured, or ignored otherwise.
- <code>saveOn <i>(?'write' | 'read' | 'both')</i></code>: Which code path may attempt a save. Defaults to `'write'`. See [`saveOn`](#which-path-triggers-the-save-saveon).
- <code>policy <i>(SnapshotPolicy)</i></code>: When to save snapshots. See [save policies](#when-to-save-snapshotpolicy).
- <code>pruning <i>(?PruningPolicy)</i></code>: What to do with older snapshots after a successful save. Defaults to `{ strategy: 'NONE' }`. See [pruning policies](#what-to-keep-pruningpolicy).
- <code>migrateSnapshotReducerVersion <i>(?(snapshot: Snapshot) => Promise&lt;Snapshot | undefined&gt; | Snapshot | undefined)</i></code>: Optional migrator invoked when a snapshot under a different `reducerVersion` is found. Returning the migrated snapshot uses it as the seed; returning `undefined` rebuilds from events.
- <code>onSnapshotError <i>(?(args) => void)</i></code>: Optional error hook. `args` is `{ phase, aggregateId, eventStoreId, error }`. The EventStore currently emits `phase: 'read'` (read-path failures) and `phase: 'save'` (background save failures, including prune failures that occur during the same save). The type union also includes `'prune'` for future use.

---

**`SnapshotPolicy`:**

```ts
type SnapshotPolicy =
  | { strategy: 'NONE' }
  | { strategy: 'EVERY_N_VERSIONS'; periodInVersions: number }
  | { strategy: 'EVERY_N_MS_SINCE_LAST'; periodInMs: number }
  | {
      strategy: 'AUTO';
      minPeriodInVersions?: number; // default 25
      maxPeriodInVersions?: number; // default 500
      minPeriodInMs?: number;       // default 1 hour
      maxPeriodInMs?: number;       // default 24 hours
    }
  | { strategy: 'CUSTOM'; shouldSaveSnapshot: ShouldSaveSnapshot };
```

---

**`ShouldSaveSnapshotArgs`:**

- <code>aggregate <i>(Aggregate)</i></code>: The aggregate just rebuilt.
- <code>previousSnapshot <i>(?Snapshot)</i></code>: The snapshot that seeded the rebuild, if any.
- <code>newEventCount <i>(number)</i></code>: The number of events fetched on top of `previousSnapshot` to produce `aggregate`. With no previous snapshot it is the total number of events read.
- <code>now <i>(Date)</i></code>: Provided by the EventStore so policies can be deterministic in tests.

---

**`PruningPolicy`:**

```ts
type PruningPolicy =
  | { strategy: 'NONE' }
  | { strategy: 'DELETE_PREVIOUS' }
  | { strategy: 'KEEP_LAST_N'; n: number }
  | { strategy: 'KEEP_NEWER_THAN_MS'; ageMs: number }
  | { strategy: 'CUSTOM'; shouldKeep: ShouldKeepSnapshot };
```

All non-`NONE` strategies always preserve the newly-saved snapshot (`position: 0`).

---

**`ShouldKeepSnapshotArgs`:**

- <code>key <i>(SnapshotKey)</i></code>: The candidate snapshot's key.
- <code>position <i>(number)</i></code>: The snapshot's 0-based index when sorted newest-first within its aggregate (0 = newest, 1 = next-newest, …). The newly-saved snapshot is always at `position: 0`.
- <code>ageMs <i>(number)</i></code>: `now.getTime() - new Date(key.savedAt).getTime()`.
- <code>now <i>(Date)</i></code>: Provided by the caller so policies can be deterministic in tests.

---

**`SnapshotStorageAdapter`:**

- `getLatestSnapshot: (aggregateId, context, opt?) => Promise<{ snapshot?: Snapshot }>` — Hot path. Returns the highest-version snapshot for the given aggregate, or `undefined` if none. `opt.aggregateMaxVersion` lets `getAggregate` retrieve a snapshot bounded by the requested version. `opt.reducerVersion` lets the caller pre-filter to only matching snapshots.
- `getSnapshot: (snapshotKey, context) => Promise<{ snapshot?: Snapshot }>` — Read a specific snapshot by key. Used during migration / inspection helpers.
- `putSnapshot: (snapshot, context) => Promise<void>` — Persist a snapshot. Implementations may overwrite an existing snapshot with the same `(aggregateId, aggregateVersion, reducerVersion)` key.
- `deleteSnapshot: (snapshotKey, context) => Promise<void>` — Delete a single snapshot. No-op if the snapshot is already gone.
- `listSnapshots: (context, opt?) => Promise<{ snapshotKeys: SnapshotKey[]; nextPageToken?: string }>` — List snapshot keys (not payloads). Results are returned in a stable order (`aggregateVersion` ascending within each aggregate, ties broken by `reducerVersion`); `reverse: true` reverses it.

`SnapshotKey` carries `aggregateId`, `aggregateVersion`, `reducerVersion` and `savedAt` — `savedAt` is included so list-only pruning (e.g. `KEEP_NEWER_THAN_MS`) can filter without an extra `getSnapshot` round-trip per candidate.

---

**`EventStore` snapshot fields:**

- <code>snapshotStorageAdapter <i>(?SnapshotStorageAdapter)</i></code>: The snapshot storage adapter (assignable in context).
- <code>snapshotConfig <i>(?SnapshotConfig)</i></code>: The snapshot config (assignable in context — assigning recompiles the cached `shouldSaveSnapshot` / `shouldKeepSnapshot` predicates once).
- <code>getSnapshotStorageAdapter <i>(() => SnapshotStorageAdapter)</i></code>: Returns the adapter if it exists. Throws an `UndefinedSnapshotStorageAdapterError` otherwise.

</details>
