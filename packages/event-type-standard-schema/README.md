# @hamstore/event-type-standard-schema

DRY Hamstore `EventType` definition using [Standard Schema](https://standardschema.dev/) with **runtime validation**.

## Installation

```bash
# npm
npm install @hamstore/event-type-standard-schema

# yarn
yarn add @hamstore/event-type-standard-schema

# pnpm
pnpm add @hamstore/event-type-standard-schema
```

You also need a Standard Schema-compatible validation library as a peer dependency, for example:

- [Zod](https://zod.dev/) (v3.25+ or v4+)
- [Valibot](https://valibot.dev/)
- [ArkType](https://arktype.io/)

## Usage

```typescript
import { StandardSchemaEventType } from '@hamstore/event-type-standard-schema';
import { z } from 'zod'; // or valibot, arktype, etc.

const pokemonCaughtEventType = new StandardSchemaEventType({
  type: 'POKEMON_CAUGHT',
  payloadSchema: z.object({
    pokemonId: z.string(),
    pokemonName: z.string(),
    level: z.number().int().positive(),
  }),
  metadataSchema: z.object({
    trainerName: z.string(),
  }),
});
```

The `StandardSchemaEventType` extends the core `EventType` and provides a `parseEventDetail` method that validates event payloads and metadata at runtime using the Standard Schema `validate` interface.

### Validation

When used with an `EventStore`, validation is triggered by the `validate` option on `pushEvent` and `groupEvent`:

```typescript
// Validates if the event type has a parser (default: 'auto')
await eventStore.pushEvent(eventDetail, { validate: 'auto' });

// Always validate, throws if no parser defined
await eventStore.pushEvent(eventDetail, { validate: true });

// Skip validation
await eventStore.pushEvent(eventDetail, { validate: false });
```

## Why Standard Schema?

Standard Schema is a shared interface implemented by multiple validation libraries. Using `@hamstore/event-type-standard-schema` means your event types work with **any** Standard Schema-compatible library, without library-specific adapters.

This package is the recommended replacement for `@hamstore/event-type-zod` and `@hamstore/event-type-json-schema`.
