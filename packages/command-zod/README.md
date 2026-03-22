# Zod Command

> **Deprecated:** This package provides type inference only and does **not** perform runtime validation of command inputs or outputs. It is deprecated in favor of [`@hamstore/command-standard-schema`](../command-standard-schema), which uses the [Standard Schema](https://standardschema.dev/) interface (compatible with Zod, Valibot, ArkType, and more). This package will be removed in a future release.

DRY Hamstore [`Command`](https://hamstore.github.io/hamstore/docs/event-sourcing/pushing-events/) definition using [`zod`](https://github.com/colinhacks/zod).

## 📥 Installation

```bash
# npm
npm install @hamstore/command-zod

# pnpm
pnpm add @hamstore/command-zod
```

This package has `@hamstore/core` and `zod` (above v3) as peer dependencies, so you will have to install them as well:

```bash
# npm
npm install @hamstore/core zod

# pnpm
pnpm add @hamstore/core zod
```

## 👩‍💻 Usage

```ts
import z from 'zod';

import { ZodCommand } from '@hamstore/command-zod';
import { tuple } from '@hamstore/core';

const pokemonAppearedInputSchema = z.object({
  name: z.string(),
  level: z.number(),
});

const pokemonAppearedOutputSchema = z.object({
  pokemonId: z.string().uuid(),
});

// 👇 generics are correctly inferred
const pokemonAppearCommand = new ZodCommand({
  commandId: 'POKEMON_APPEAR',
  requiredEventStores: tuple(pokemonsEventStore),
  inputSchema: pokemonAppearedInputSchema,
  outputSchema: pokemonAppearedOutputSchema,
  // 👇 handler input/output types are correctly inferred
  handler: async (
    commandInput,
    [pokemonsEventStore],
    { generateUuid }: { generateUuid: () => string },
  ) => {
    const { name, level } = commandInput;
    const pokemonId = generateUuid();

    await pokemonsEventStore.pushEvent({
      aggregateId: pokemonId,
      version: 1,
      type: 'POKEMON_APPEARED',
      payload: { name, level },
    });

    return { pokemonId };
  },
});
```

👇 Equivalent to:

```ts
import { Command } from '@hamstore/core';

type RequiredEventStores = [typeof pokemonsEventStore];
type CommandInput = { name: string; level: number };
type CommandOutput = { pokemonId: string };

const pokemonAppearCommand = new Command<
  RequiredEventStores,
  RequiredEventStores,
  CommandInput,
  CommandOutput
>({
  commandId: 'POKEMON_APPEAR',
  requiredEventStores: [pokemonsEventStore],
  handler: async (commandInput, [pokemonsEventStore]) => {
    // ...same code
  },
});
```

## ⚙️ Properties & Methods

`ZodCommand` implements the [`Command`](https://hamstore.github.io/hamstore/docs/event-sourcing/pushing-events/) class and adds the following properties to it:

- <code>inputSchema <i>(?object)</i></code>: The command input zod schema

```ts
const inputSchema = pokemonAppearCommand.inputSchema;
// => pokemonAppearedInputSchema
```

- <code>outputSchema <i>(?object)</i></code>: The command output zod schema

```ts
const outputSchema = pokemonAppearCommand.outputSchema;
// => pokemonAppearedOutputSchema
```
