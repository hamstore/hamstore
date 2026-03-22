# JSON Schema Event

> **Deprecated:** This package provides type inference only and does **not** perform runtime validation of event payloads or metadata. It is deprecated in favor of [`@hamstore/event-type-standard-schema`](../event-type-standard-schema), which supports runtime validation via the [Standard Schema](https://standardschema.dev/) interface (compatible with Zod, Valibot, ArkType, and more). This package will be removed in a future release.

DRY Hamstore [`EventType`](https://hamstore.github.io/hamstore/docs/event-sourcing/events/) definition using [JSON Schemas](http://json-schema.org/understanding-json-schema/reference/index.html) and [`json-schema-to-ts`](https://github.com/ThomasAribart/json-schema-to-ts)

## 📥 Installation

```bash
# npm
npm install @hamstore/event-type-json-schema

# pnpm
pnpm add @hamstore/event-type-json-schema
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
import { JSONSchemaEventType } from '@hamstore/event-type-json-schema';

const pokemonAppearedPayloadSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    level: { type: 'integer' },
  },
  required: ['name', 'level'],
  additionalProperties: false,
} as const; // 👈 Don't forget the "as const" statement
// (Cf json-schema-to-ts documentation)

const pokemonAppearedMetadataSchema = {
  type: 'object',
  properties: {
    trigger: { enum: ['random', 'scripted'] },
  },
  additionalProperties: false,
} as const;

// 👇 generics are correctly inferred
const pokemonAppearedEventType = new JSONSchemaEventType({
  type: 'POKEMON_APPEARED',
  payloadSchema: pokemonAppearedPayloadSchema,
  metadataSchema: pokemonAppearedMetadataSchema,
});
```

👇 Equivalent to:

```ts
import { EventType } from '@hamstore/core';

const pokemonAppearedEventType = new EventType<
  'POKEMON_APPEARED',
  { name: string; level: number },
  { trigger?: 'random' | 'scripted' }
>({ type: 'POKEMON_APPEARED' });
```

## ⚙️ Properties & Methods

`JSONSchemaEventType` implements the [`EventType`](https://hamstore.github.io/hamstore/docs/event-sourcing/events/) class and adds the following properties to it:

- <code>payloadSchema <i>(?object)</i></code>: The event type payload JSON schema

```ts
const payloadSchema = pokemonAppearedEventType.payloadSchema;
// => pokemonAppearedPayloadSchema
```

- <code>metadataSchema <i>(?object)</i></code>: The event type metadata JSON schema

```ts
const metadataSchema = pokemonAppearedEventType.metadataSchema;
// => pokemonAppearedMetadataSchema
```
