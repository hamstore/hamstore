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

### Controlling validation

By default, validation throws on invalid data. You can change this behavior with the `validate` option:

```typescript
// Disable all validation (type inference only, like command-zod)
new StandardSchemaCommand({ validate: false, ... });

// Log warnings instead of throwing
new StandardSchemaCommand({ validate: 'warn', ... });

// Custom error handler
new StandardSchemaCommand({
  validate: (error) => myLogger.error(error),
  ...
});

// Different modes for input and output
new StandardSchemaCommand({
  validate: { input: true, output: 'warn' },
  ...
});
```

The `validate` option accepts:

- `true` — throw on validation failure (default for input)
- `false` — skip validation entirely
- `'auto'` — validate if a schema exists, skip if not (default for output)
- `'warn'` — log a warning via `console.warn` and continue with the original value
- `(error: Error) => void` — call a custom handler and continue with the original value

For granular control, pass an object with `input` and/or `output` keys, each accepting the same options above. Unspecified input defaults to `true`; unspecified output defaults to `'auto'`.

When using the shorthand form (e.g. `validate: true`), output is always resolved as `'auto'` — meaning it validates when `outputSchema` is provided and skips otherwise. If you explicitly set `validate: { output: true }` without providing an `outputSchema`, the constructor throws an error to catch the misconfiguration early.

## Why Standard Schema?

Standard Schema is a shared interface implemented by multiple validation libraries. Using `@hamstore/command-standard-schema` means your commands work with **any** Standard Schema-compatible library, without library-specific adapters.

This package is the recommended replacement for `@hamstore/command-zod`.
