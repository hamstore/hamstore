---
sidebar_position: 1
---

# From @castore to @hamstore

Hamstore is a fork of the [Castore](https://github.com/castore-dev/castore) library. This guide helps you migrate your existing `@castore/*` packages to `@hamstore/*`.

## Package Mapping

All packages have been renamed from the `@castore` scope to the `@hamstore` scope. The package names themselves remain the same:

| @castore | @hamstore |
| --- | --- |
| `@castore/core` | `@hamstore/core` |
| `@castore/event-type-json-schema` | `@hamstore/event-type-json-schema` |
| `@castore/event-type-zod` | `@hamstore/event-type-zod` |
| `@castore/command-json-schema` | `@hamstore/command-json-schema` |
| `@castore/command-zod` | `@hamstore/command-zod` |
| `@castore/event-storage-adapter-dynamodb` | `@hamstore/event-storage-adapter-dynamodb` |
| `@castore/event-storage-adapter-redux` | `@hamstore/event-storage-adapter-redux` |
| `@castore/event-storage-adapter-postgres` | `@hamstore/event-storage-adapter-postgres` |
| `@castore/event-storage-adapter-in-memory` | `@hamstore/event-storage-adapter-in-memory` |
| `@castore/event-storage-adapter-http` | `@hamstore/event-storage-adapter-http` |
| `@castore/message-queue-adapter-sqs` | `@hamstore/message-queue-adapter-sqs` |
| `@castore/message-queue-adapter-sqs-s3` | `@hamstore/message-queue-adapter-sqs-s3` |
| `@castore/message-queue-adapter-in-memory` | `@hamstore/message-queue-adapter-in-memory` |
| `@castore/message-bus-adapter-event-bridge` | `@hamstore/message-bus-adapter-event-bridge` |
| `@castore/message-bus-adapter-event-bridge-s3` | `@hamstore/message-bus-adapter-event-bridge-s3` |
| `@castore/message-bus-adapter-in-memory` | `@hamstore/message-bus-adapter-in-memory` |
| `@castore/lib-test-tools` | `@hamstore/lib-test-tools` |
| `@castore/lib-dam` | `@hamstore/lib-dam` |
| `@castore/lib-react-visualizer` | `@hamstore/lib-react-visualizer` |

## Step-by-step Migration

### 1. Update dependencies

Replace all `@castore/*` packages in your `package.json` with their `@hamstore/*` equivalents:

```bash
# Example using npm
npm uninstall @castore/core @castore/event-storage-adapter-dynamodb
npm install @hamstore/core @hamstore/event-storage-adapter-dynamodb
```

### 2. Update imports

Search and replace all import paths from `@castore/` to `@hamstore/`:

```diff
- import { EventStore } from '@castore/core';
- import { DynamoDBSingleTableEventStorageAdapter } from '@castore/event-storage-adapter-dynamodb';
+ import { EventStore } from '@hamstore/core';
+ import { DynamoDBSingleTableEventStorageAdapter } from '@hamstore/event-storage-adapter-dynamodb';
```

You can automate this with a find-and-replace across your codebase:

```bash
# Using sed (Linux/macOS)
find src -name '*.ts' -o -name '*.tsx' | xargs sed -i 's/@castore\//@hamstore\//g'
```

### 3. Renamed exports

The following exported identifiers from `@hamstore/event-storage-adapter-redux` (formerly `@castore/event-storage-adapter-redux`) have been renamed:

| Before | After |
| --- | --- |
| `getCastoreReducers` | `getHamstoreReducers` |
| `configureCastore` | `configureHamstore` |

Update any usage accordingly:

```diff
- import { getCastoreReducers, configureCastore } from '@castore/event-storage-adapter-redux';
+ import { getHamstoreReducers, configureHamstore } from '@hamstore/event-storage-adapter-redux';
```

### 4. HTTP header rename

If you use the HTTP event storage adapter, the custom header has been renamed:

```diff
- x-castore-operationId
+ x-hamstore-operationId
```

### 5. Redux store prefix

If you use the Redux event storage adapter, the default Redux slice prefix has changed from `@castore` to `@hamstore`. This means that your Redux state keys will change shape:

```diff
- @castore_POKEMONS
+ @hamstore_POKEMONS
```

If you have persisted Redux state, you may need to migrate your store keys accordingly.

## No API Changes

Beyond the renames listed above, the Hamstore API is fully compatible with Castore v2. No behavioral changes have been introduced in the fork.
