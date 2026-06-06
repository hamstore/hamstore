---
sidebar_position: 5
---

# ✍️ Pushing Events

Modifying application state means pushing new events to your event stores. There are two tools for this, and the rest of the page is organised around them:

- **[`AggregateHandle`](#pushing-events-with-an-aggregatehandle)** — the recommended, boilerplate-free way to write to a single aggregate.
- **[Commands](#defining-a-command)** — the unit that wraps a write (validation + the optimistic-concurrency retry loop), and the place a handle is typically opened.

## Defining a command {#defining-a-command}

Modifying the state of your application (i.e. pushing new events to your event stores) is done by executing **commands**. They typically consist in:

- **Fetching the required aggregates** (if not the initial event of a new aggregate)
- **Validating** that the modification is acceptable
- **Pushing new events** with incremented versions

![Command](../../assets/docSchemas/command.png)

The recommended way to do the fetch → increment → push dance is to **open an [`AggregateHandle`](#pushing-events-with-an-aggregatehandle)**. A handle reads the aggregate, pins the next version, and fills in `aggregateId`, `version` and `prevAggregate` for you on every push:

```ts
import { Command, tuple } from '@hamstore/core';

type Input = { name: string; level: number };
type Output = { pokemonId: string };
type Context = { generateUuid: () => string };

const catchPokemonCommand = new Command({
  commandId: 'CATCH_POKEMON',
  // 👇 "tuple" is needed to keep ordering in inferred type
  requiredEventStores: tuple(pokemonsEventStore),
  // 👇 Code to execute
  handler: async (
    commandInput: Input,
    [pokemonsEventStore],
    // 👇 Additional context arguments can be provided
    { generateUuid }: Context,
  ): Promise<Output> => {
    const { name, level } = commandInput;
    const pokemonId = generateUuid();

    // 👇 New aggregate: no read needed, the handle pins nextVersion = 1
    const pikachu = pokemonsEventStore.openAggregateFrom({
      aggregateId: pokemonId,
    });

    // 👇 aggregateId + version are filled in automatically
    await pikachu.pushEvent({
      type: 'POKEMON_CAUGHT',
      payload: { name, level },
    });

    return { pokemonId };
  },
});
```

For a command that mutates an **existing** aggregate, open it inside the handler (so each [retry](#race-conditions--retries) re-reads the freshest state) and push from there:

```ts
const levelUpPokemonCommand = new Command({
  commandId: 'LEVEL_UP_POKEMON',
  requiredEventStores: tuple(pokemonsEventStore),
  handler: async ({ pokemonId }: { pokemonId: string }, [pokemonsEventStore]) => {
    // 👇 Reads the aggregate and pins the next version, throws if it is missing
    const pikachu = await pokemonsEventStore.openExistingAggregate(pokemonId);

    // ...validate the modification against pikachu.aggregate...

    // 👇 No manual version bookkeeping, nextAggregate is always defined
    const { nextAggregate } = await pikachu.pushEvent({
      type: 'POKEMON_LEVELED_UP',
    });
  },
});
```

:::info

Note that we only provided TS types for `Input` and `Output` properties. That is because, as stated in the [core design](../../../), **Hamstore is meant to be as flexible as possible**, and that includes the validation library you want to use (if any): The `Command` class can be used directly if no validation is required, or implemented by [other classes](../4-packages.md#commands) which will add run-time validation methods to it 👍

:::

`Commands` handlers should NOT use [read models](../3-reacting-to-events/6-read-models.md) when validating that a modification is acceptable. Read models are like cache: They are not the source of truth, and may not represent the freshest state.

## Race conditions & retries

Fetching and pushing events non-simultaneously exposes your application to [race conditions](https://en.wikipedia.org/wiki/Race_condition). To counter that, commands are designed to be retried when an `EventAlreadyExistsError` is triggered (which is part of the `EventStorageAdapter` interface).

![Command Retry](../../assets/docSchemas/commandRetry.png)

## ✋ Pushing events with an `AggregateHandle` {#pushing-events-with-an-aggregatehandle}

An **`AggregateHandle`** is an immutable, version-pinned write handle for a single aggregate. It removes the boilerplate of reading an aggregate, tracking its `version`, and threading `aggregateId` / `prevAggregate` through every push. It is the **recommended way to push aggregate changes**.

You obtain one from an `EventStore` (or a [`ConnectedEventStore`](../3-reacting-to-events/4-connected-event-store.md)) through three getters:

- <code>openAggregate(aggregateId, opt?)</code>: Reads the aggregate and returns a handle. `handle.aggregate` may be `undefined` (new aggregate).
- <code>openExistingAggregate(aggregateId, opt?)</code>: Same, but throws an `AggregateNotFoundError` if the aggregate does not exist yet — so `handle.aggregate` is always defined.
- <code>openAggregateFrom(&#123; aggregateId, aggregate? &#125;)</code>: Builds a handle from pieces you already have, **without reading storage** — for the initial event of a new aggregate, or for replay / bulk-import flows that already hold the aggregate.

```ts
const pikachu = await pokemonsEventStore.openAggregate('pikachu1');

pikachu.aggregateId; // => 'pikachu1'
pikachu.aggregate; //   => the aggregate at the version it was read (or undefined)
pikachu.nextVersion; // => the version the next pushed event will get
```

The handle is **immutable**: `pikachu.aggregate` always reflects the read it was opened with, and the handle never rolls itself forward. Pushing returns the `nextAggregate` instead — and because the handle pins a version, `nextAggregate` is **never optional** (no `nextAggregate!` assertions). To keep writing, open a fresh handle.

### Single-aggregate writes (self-committing)

- <code>handle.pushEvent(input, opt?)</code>: Pushes **one** event and commits it. Returns `{ event, nextAggregate }`.
- <code>handle.pushEvents([input | fn, ...], opt?)</code>: Pushes **multiple** events on the aggregate **atomically** (all-or-nothing) and commits them. Returns `{ events, nextAggregate }`.

`aggregateId` and `version` are filled in from the handle, so you only provide `type` / `payload` / `metadata`. The singular `pushEvent` still lets you override `aggregateId` / `version` in `input`; the chained `pushEvents` rejects those overrides (it owns sequential version assignment) and rejects an empty list:

```ts
const pikachu = await pokemonsEventStore.openExistingAggregate('pikachu1');

// One event:
const { nextAggregate } = await pikachu.pushEvent({ type: 'POKEMON_LEVELED_UP' });

// Several events on the same aggregate, atomically. Use the function form when a
// later event depends on the aggregate folded through the earlier ones:
const { events } = await pikachu.pushEvents([
  { type: 'POKEMON_LEVELED_UP' },
  afterLevelUp => ({
    type: 'POKEMON_EVOLVED',
    payload: { from: afterLevelUp.name },
  }),
]);
```

:::note

The handle **never force-pushes**: it exists to honour an expected version, so bypassing the optimistic-concurrency check would defeat its purpose. If you genuinely need to overwrite an existing event, reach for the [low-level `pushEvent({ force: true })`](#direct-low-level-pushing).

:::

### Cross-aggregate writes (event groups)

When a command writes to **several aggregates** (across one or more event stores), the commit is owned by the static `EventStore.pushEventGroup` — the handle can't self-commit. Build the grouped events from each handle and push them together (see [Event Groups: Transactions](./6-joining-data.md)):

- <code>handle.groupEvent(input, opt?)</code>: Builds **one** `GroupedEvent` for this aggregate — the common "N stores, one event each" case.
- <code>handle.groupEvents([input | fn, ...], opt?)</code>: Builds **multiple chained** `GroupedEvent`s on one aggregate.

```ts
const pikachu = await pokemonsEventStore.openExistingAggregate('pikachu1');
const ash = await trainersEventStore.openExistingAggregate('ashKetchum');

await EventStore.pushEventGroup(
  pikachu.groupEvent({ type: 'CAUGHT_BY_TRAINER', payload: { trainerId: 'ashKetchum' } }),
  ash.groupEvent({ type: 'POKEMON_CAUGHT', payload: { pokemonId: 'pikachu1' } }),
);
```

:::warning

`groupEvent` does **not** chain: calling it twice on the same handle produces two events pinned at the **same** `nextVersion`, which collide loudly on push (`EventAlreadyExistsError` on the duplicate `(aggregateId, version)`). When one aggregate contributes more than one event to the group, use `groupEvents([...])` instead.

:::

<details>
<summary>
  <b>🔧 Reference</b>
</summary>

A handle is **obtained from an `EventStore`** (or `ConnectedEventStore`) via <code>openAggregate</code> / <code>openExistingAggregate</code> / <code>openAggregateFrom</code> — each documented in the [`EventStore` reference](./3-event-stores.md). It is **immutable** and never force-pushes.

**Event input:** every method takes an event detail with <code>aggregateId</code>, <code>version</code> and <code>timestamp</code> **omitted** — the handle fills those in. The singular <code>pushEvent</code> / <code>groupEvent</code> still let you override <code>version</code> / <code>aggregateId</code> in the input; the chained <code>pushEvents</code> / <code>groupEvents</code> **reject** those overrides (the handle owns sequential version assignment) and **reject** an empty list. In the chained forms, an entry may also be a function <code>(prevAggregate) => input</code> that receives a local aggregate folded through the earlier events.

**`opt`** is <code>&#123; validate?: ValidateEventDetail &#125;</code> on every method. There is deliberately no <code>force</code> option.

---

**Properties:**

- <code>aggregateId <i>(string)</i></code>: The id of the aggregate this handle writes to.
- <code>aggregate <i>(?Aggregate)</i></code>: The aggregate at the version the handle was opened with — always reflects that read and is never rolled forward (the handle is immutable). <code>undefined</code> for an aggregate that does not exist yet.
- <code>nextVersion <i>(number)</i></code>: The version the next pushed event will get, i.e. <code>(aggregate?.version ?? 0) + 1</code> — so <code>1</code> for a brand-new aggregate.

---

**Self-committing methods (single aggregate):**

- <code>pushEvent <i>((input, opt?) => Promise&lt;&#123; event, nextAggregate &#125;&gt;)</i></code>: Pushes **one** event and commits it. <code>nextAggregate</code> is always defined.
- <code>pushEvents <i>(([input | fn, ...], opt?) => Promise&lt;&#123; events, nextAggregate &#125;&gt;)</i></code>: Pushes **multiple** chained events on the aggregate **atomically** and commits them. <code>nextAggregate</code> is rebuilt from the committed events.

**Group-building methods (cross-aggregate, do not commit):**

- <code>groupEvent <i>((input, opt?) => GroupedEvent)</i></code>: Builds **one** <code>GroupedEvent</code> for this aggregate, to pass to <code>EventStore.pushEventGroup</code>. Does not chain.
- <code>groupEvents <i>(([input | fn, ...], opt?) => GroupedEvent[])</i></code>: Builds **multiple chained** <code>GroupedEvent</code>s on this aggregate.

```ts
const pikachu = await pokemonsEventStore.openExistingAggregate('pikachu1');

pikachu.aggregateId; //  => 'pikachu1'
pikachu.nextVersion; //  => e.g. 4

// Self-committing:
const { nextAggregate } = await pikachu.pushEvent({ type: 'POKEMON_LEVELED_UP' });

// Build a grouped event for a cross-aggregate transaction:
const grouped = pikachu.groupEvent({ type: 'POKEMON_LEVELED_UP' });
```

</details>

## 🔧 Direct (low-level) pushing {#direct-low-level-pushing}

The `AggregateHandle` covers the vast majority of writes. The lower-level `EventStore` methods remain available for when you need **direct access** — explicit control over the version you push, or a **force push** (which the handle deliberately does not offer):

- <code>eventStore.pushEvent(eventDetail, opt?)</code> — push a single event with an explicit `version`, optionally `{ force: true }`. See the [`EventStore` reference](./3-event-stores.md).
- <code>eventStore.groupEvent(eventDetail, opt?)</code> + <code>EventStore.pushEventGroup(...)</code> — build and commit cross-aggregate groups directly. See [Event Groups: Transactions](./6-joining-data.md).

```ts
// Force-pushing is only possible through the low-level API (use with care,
// mainly in data migrations — it overrides any existing event at that version):
await pokemonsEventStore.pushEvent(
  {
    aggregateId: 'pikachu1',
    version: lastVersion + 1,
    type: 'POKEMON_LEVELED_UP',
    payload,
  },
  { force: true },
);
```

## Writing pure handlers

Command handlers should be, as much as possible, [pure functions](https://en.wikipedia.org/wiki/Pure_function). If they depend on impure functions like functions with unpredictable outputs (e.g. id generation), mutating effects, side effects or state dependency (e.g. external data fetching), you should pass them through the additional context arguments rather than directly importing and using them. This will make them easier to test and to re-use in different contexts, such as in the [React Visualizer](https://www.npmjs.com/package/@hamstore/lib-react-visualizer).

<details>
<summary>
  <b>🔧 Reference</b>
</summary>

**Constructor:**

- <code>commandId <i>(string)</i></code>: A string identifying the command
- <code>handler <i>((input: Input, requiredEventsStores: EventStore[]) => Promise&lt;Output&gt;)</i></code>: The code to execute
- <code>requiredEventStores <i>(EventStore[])</i></code>: A tuple of <code>EventStores</code> that are required by the command for read/write purposes. In TS, you should use the <code>tuple</code> util to preserve tuple ordering in the handler (<code>tuple</code> doesn't mute its inputs, it simply returns them)
- <code>eventAlreadyExistsRetries <i>(?number = 2)</i></code>: Number of handler execution retries before breaking out of the retry loop (See section above on race conditions)
- <code>onEventAlreadyExists <i>(?(error: EventAlreadyExistsError, context: ContextObj) => Promise&lt;void&gt;)</i></code>: Optional callback to execute when an <code>EventAlreadyExistsError</code> is raised.

  The `EventAlreadyExistsError` class contains the following properties:
  - <code>eventStoreId <i>(?string)</i></code>: The <code>eventStoreId</code> of the aggregate on which the <code>pushEvent</code> attempt failed
  - <code>aggregateId <i>(string)</i></code>: The <code>aggregateId</code> of the aggregate
  - <code>version <i>(number)</i></code>: The <code>version</code> of the aggregate
    The `ContextObj` contains the following properties:
  - <code>attemptNumber <i>(?number)</i></code>: The number of handler execution attempts in the retry loop
  - <code>retriesLeft <i>(?number)</i></code>: The number of retries left before breaking out of the retry loop

```ts
import { Command, tuple } from '@hamstore/core';

const doSomethingCommand = new Command({
  commandId: 'DO_SOMETHING',
  requiredEventStores: tuple(eventStore1, eventStore2),
  handler: async (commandInput, [eventStore1, eventStore2]) => {
    // ...do something here
  },
});
```

---

**Properties:**

- <code>commandId <i>(string)</i></code>: The command id

```ts
const commandId = doSomethingCommand.commandId;
// => 'DO_SOMETHING'
```

- <code>requiredEventStores <i>(EventStore[])</i></code>: The required event stores

```ts
const requiredEventStores = doSomethingCommand.requiredEventStores;
// => [eventStore1, eventStore2]
```

- <code>handler <i>((input: Input, requiredEventsStores: EventStore[]) => Promise&lt;Output&gt;)</i></code>: Function to invoke the command

```ts
const output = await doSomethingCommand.handler(input, [
  eventStore1,
  eventStore2,
]);
```

</details>
