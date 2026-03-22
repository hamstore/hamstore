# JSON Schema Command

> **Deprecated:** This package provides type inference only and does **not** perform runtime validation of command inputs or outputs. It is deprecated in favor of [`@hamstore/command-standard-schema`](../command-standard-schema), which uses the [Standard Schema](https://standardschema.dev/) interface (compatible with Zod, Valibot, ArkType, and more). This package will be removed in a future release.

DRY Hamstore [`Command`](https://hamstore.github.io/hamstore/docs/event-sourcing/pushing-events/) definition using [JSON Schemas](http://json-schema.org/understanding-json-schema/reference/index.html) and [`json-schema-to-ts`](https://github.com/ThomasAribart/json-schema-to-ts).

## 📥 Installation

```bash
# npm
npm install @hamstore/command-json-schema

# pnpm
pnpm add @hamstore/command-json-schema
```

This package has `@hamstore/core` and `json-schema-to-ts` (above v2) as peer dependencies, so you will have to install them as well:

```bash
# npm
npm install @hamstore/core json-schema-to-ts

# pnpm
pnpm add @hamstore/core json-schema-to-ts
```

## 👩‍💻 Usage

```ts
import { JSONSchemaCommand } from '@hamstore/command-json-schema';
import { tuple } from '@hamstore/core';

const pokemonAppearedInputSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    level: { type: 'integer' },
  },
  required: ['name', 'level'],
  additionalProperties: false,
} as const; // 👈 Don't forget the "as const" statement
// (Cf json-schema-to-ts documentation)

const pokemonAppearedOutputSchema = {
  type: 'object',
  properties: {
    pokemonId: { type: 'string', format: 'uuid' },
  },
  required: ['pokemonId'],
  additionalProperties: false,
} as const;

// 👇 generics are correctly inferred
const pokemonAppearCommand = new JSONSchemaCommand({
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
  handler: async (
    commandInput,
    [pokemonsEventStore],
    { generateUuid }: { generateUuid: () => string },
  ) => {
    // ...same code
  },
});
```

## ⚙️ Properties & Methods

`JSONSchemaCommand` implements the [`Command`](https://hamstore.github.io/hamstore/docs/event-sourcing/pushing-events/) class and adds the following properties to it:

- <code>inputSchema <i>(?object)</i></code>: The command input JSON schema

```ts
const inputSchema = pokemonAppearCommand.inputSchema;
// => pokemonAppearedInputSchema
```

- <code>outputSchema <i>(?object)</i></code>: The command output JSON schema

```ts
const outputSchema = pokemonAppearCommand.outputSchema;
// => pokemonAppearedOutputSchema
```
