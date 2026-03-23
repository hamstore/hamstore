# @hamstore/command-standard-schema

DRY Hamstore `Command` definition using [Standard Schema](https://standardschema.dev/).

## Installation

```bash
# npm
npm install @hamstore/command-standard-schema

# yarn
yarn add @hamstore/command-standard-schema

# pnpm
pnpm add @hamstore/command-standard-schema
```

You also need a Standard Schema-compatible validation library as a peer dependency, for example:

- [Zod](https://zod.dev/) (v3.25+ or v4+)
- [Valibot](https://valibot.dev/)
- [ArkType](https://arktype.io/)

## Usage

```typescript
import { StandardSchemaCommand } from '@hamstore/command-standard-schema';
import { z } from 'zod'; // or valibot, arktype, etc.

const catchPokemonCommand = new StandardSchemaCommand({
  commandId: 'CATCH_POKEMON',
  requiredEventStores: [pokemonsEventStore],
  inputSchema: z.object({
    pokemonId: z.string(),
    trainerName: z.string(),
  }),
  outputSchema: z.object({
    caughtAt: z.date(),
  }),
  handler: async (input, [pokemonsEventStore]) => {
    // ... business logic
    return { caughtAt: new Date() };
  },
});
```

The `StandardSchemaCommand` extends the core `Command` with **runtime validation**:

- The `inputSchema` is **required** and validates every command invocation before the handler runs. The handler receives the parsed/transformed output of the schema (e.g. after Zod transforms).
- The `outputSchema` is **optional** and validates the handler's return value if provided.

If validation fails, the command throws an error with the schema's validation issues. Input validation failures do **not** trigger the retry mechanism (retries only apply to `EventAlreadyExistsError`).

## Why Standard Schema?

Standard Schema is a shared interface implemented by multiple validation libraries. Using `@hamstore/command-standard-schema` means your commands work with **any** Standard Schema-compatible library, without library-specific adapters.

This package is the recommended replacement for `@hamstore/command-zod`.
