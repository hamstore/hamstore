# DynamoDB Snapshot Storage Adapter

DRY Hamstore [`SnapshotStorageAdapter`](https://hamstore.github.io/hamstore/docs/reacting-to-events/snapshots/) implementation using [AWS DynamoDB](https://aws.amazon.com/dynamodb/).

## 📥 Installation

```bash
# npm
npm install @hamstore/snapshot-storage-adapter-dynamodb

# pnpm
pnpm add @hamstore/snapshot-storage-adapter-dynamodb
```

This package has `@hamstore/core` and `@aws-sdk/client-dynamodb` (above v3) as peer dependencies, so you will have to install them as well:

```bash
# npm
npm install @hamstore/core @aws-sdk/client-dynamodb

# pnpm
pnpm add @hamstore/core @aws-sdk/client-dynamodb
```

## 👩‍💻 Usage

```ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

import { DynamoDBSingleTableSnapshotStorageAdapter } from '@hamstore/snapshot-storage-adapter-dynamodb';

const dynamoDBClient = new DynamoDBClient({});

const pokemonsSnapshotStorageAdapter =
  new DynamoDBSingleTableSnapshotStorageAdapter({
    tableName: 'my-snapshots-table',
    dynamoDBClient,
  });

// 👇 Alternatively, provide a getter
const pokemonsSnapshotStorageAdapter =
  new DynamoDBSingleTableSnapshotStorageAdapter({
    tableName: () => process.env.MY_SNAPSHOTS_TABLE,
    dynamoDBClient,
  });

const pokemonsEventStore = new EventStore({
  ...
  snapshotStorageAdapter: pokemonsSnapshotStorageAdapter,
  snapshotConfig: {
    currentReducerVersion: 'v1',
    policy: { strategy: 'EVERY_N_VERSIONS', n: 10 },
  },
});
```

## 🤔 How it works

Like the [DynamoDB event storage adapter](../event-storage-adapter-dynamodb/README.md), this adapter is **single-table**: multiple event stores can share one table by virtue of their `eventStoreId` being prefixed onto the keys.

### Layout

**Main table.** Serves the hot path (`getLatestSnapshot`, `getSnapshot`, per-aggregate `listSnapshots`) and persistence.

| Attribute       | Type   | Notes                                                                        |
|-----------------|--------|------------------------------------------------------------------------------|
| `aggregateId`   | _S_    | Partition key. `"<eventStoreId>#<aggregateId>"`.                             |
| `snapshotKey`   | _S_    | Sort key. `"<padded-aggregateVersion>#<reducerVersion>"`. See note on padding below. |
| `aggregate`     | _M_    | The aggregate JSON.                                                          |
| `aggregateVersion` | _N_ | Numeric duplicate of the SK's version, used by GSI filter expressions.       |
| `reducerVersion` | _S_   | The reducer fingerprint the snapshot was produced under.                     |
| `eventStoreId`  | _S_    | The id of the event store the snapshot belongs to.                           |
| `savedAt`       | _S_    | ISO-8601 timestamp the snapshot was written.                                 |
| `eventStoreReducerVersion` | _S_ | GSI partition key. `"<eventStoreId>#<reducerVersion>"`.            |
| `aggregateSnapshotKey`     | _S_ | GSI sort key. `"<aggregateId>#<padded-aggregateVersion>"`.         |

The `aggregateVersion` is zero-padded to a fixed width (20 characters) inside the SK so that lexicographic order matches numeric order. This lets the `getLatestSnapshot` hot path serve a single `Limit: 1, ScanIndexForward: false` query with no further sorting.

**GSI `snapshotsByReducerVersion`.** Used by [`cleanUpOutdatedSnapshots`](https://hamstore.github.io/hamstore/docs/reacting-to-events/snapshots/) and [`pruneEventStoreSnapshots`](https://hamstore.github.io/hamstore/docs/reacting-to-events/snapshots/) to enumerate snapshots for one reducer version across every aggregate, in O(M) where M is the number of matching snapshots — not O(table size).

| Attribute                  | Type | Notes                                  |
|----------------------------|------|----------------------------------------|
| `eventStoreReducerVersion` | _S_  | Partition key.                         |
| `aggregateSnapshotKey`     | _S_  | Sort key.                              |

Projection type `ALL` is recommended so that `listSnapshots` can return full `SnapshotKey`s (including `savedAt`) without a follow-up `getSnapshot` call.

### Consistency

- `getLatestSnapshot`, `getSnapshot`, and per-aggregate `listSnapshots` issue **strongly consistent** queries against the main table.
- GSI-based `listSnapshots` (i.e. `listSnapshots({ reducerVersion })` without an `aggregateId`) is **eventually consistent**, as DynamoDB GSI reads cannot be strongly consistent.
- `putSnapshot` is unconditional — same-key writes overwrite, matching the `SnapshotStorageAdapter` contract.

### Constraints

- `listSnapshots` requires either `aggregateId` or `reducerVersion` to be set. The adapter does not perform full-table scans; the EventStore never asks it to. Calling `listSnapshots` with neither filter throws.
- `reducerVersion` strings should use printable ASCII characters. The SK range queries rely on a `\uFFFF` terminator that sorts higher than any reasonable reducer-version string.
- `aggregateId` and `reducerVersion` must not contain the literal `'#'` character (it is used as a separator inside the composite keys). The same restriction applies to the [DynamoDB event storage adapter](../event-storage-adapter-dynamodb/README.md).

## 📝 Examples

If you define your infrastructure as code in TypeScript, you can directly use this package instead of hard-coding the below values:

```ts
import {
  SNAPSHOT_TABLE_PK,
  // => aggregateId
  SNAPSHOT_TABLE_SK,
  // => snapshotKey
  SNAPSHOT_TABLE_GSI_PK_KEY,
  // => eventStoreReducerVersion
  SNAPSHOT_TABLE_GSI_SK_KEY,
  // => aggregateSnapshotKey
  SNAPSHOT_TABLE_BY_REDUCER_VERSION_INDEX_NAME,
  // => snapshotsByReducerVersion
} from '@hamstore/snapshot-storage-adapter-dynamodb';
```

### CloudFormation

```json
{
  "Type": "AWS::DynamoDB::Table",
  "Properties": {
    "AttributeDefinitions": [
      { "AttributeName": "aggregateId", "AttributeType": "S" },
      { "AttributeName": "snapshotKey", "AttributeType": "S" },
      { "AttributeName": "eventStoreReducerVersion", "AttributeType": "S" },
      { "AttributeName": "aggregateSnapshotKey", "AttributeType": "S" }
    ],
    "KeySchema": [
      { "AttributeName": "aggregateId", "KeyType": "HASH" },
      { "AttributeName": "snapshotKey", "KeyType": "RANGE" }
    ],
    "GlobalSecondaryIndexes": [
      {
        "IndexName": "snapshotsByReducerVersion",
        "KeySchema": [
          { "AttributeName": "eventStoreReducerVersion", "KeyType": "HASH" },
          { "AttributeName": "aggregateSnapshotKey", "KeyType": "RANGE" }
        ],
        "Projection": { "ProjectionType": "ALL" }
      }
    ]
  }
}
```

### CDK

```ts
import { Table, AttributeType, ProjectionType } from 'aws-cdk-lib/aws-dynamodb';

const { STRING } = AttributeType;
const { ALL } = ProjectionType;

const pokemonsSnapshotsTable = new Table(scope, 'PokemonSnapshots', {
  partitionKey: { name: 'aggregateId', type: STRING },
  sortKey: { name: 'snapshotKey', type: STRING },
});

pokemonsSnapshotsTable.addGlobalSecondaryIndex({
  indexName: 'snapshotsByReducerVersion',
  partitionKey: { name: 'eventStoreReducerVersion', type: STRING },
  sortKey: { name: 'aggregateSnapshotKey', type: STRING },
  projectionType: ALL,
});
```

### Terraform

```h
resource "aws_dynamodb_table" "pokemons-snapshots-table" {
  hash_key  = "aggregateId"
  range_key = "snapshotKey"

  attribute {
    name = "aggregateId"
    type = "S"
  }

  attribute {
    name = "snapshotKey"
    type = "S"
  }

  attribute {
    name = "eventStoreReducerVersion"
    type = "S"
  }

  attribute {
    name = "aggregateSnapshotKey"
    type = "S"
  }

  global_secondary_index {
    name            = "snapshotsByReducerVersion"
    hash_key        = "eventStoreReducerVersion"
    range_key       = "aggregateSnapshotKey"
    projection_type = "ALL"
  }
}
```

## 🔑 IAM

Required IAM permissions for each operation:

- `getLatestSnapshot` (+ `EventStore.getAggregate` / `getEventsAndAggregate` when a snapshot adapter is configured): `dynamodb:Query` on the table.
- `getSnapshot`: `dynamodb:GetItem` on the table.
- `putSnapshot` (+ inline snapshot saves): `dynamodb:PutItem` on the table.
- `deleteSnapshot` (+ inline pruning, `cleanUpOutdatedSnapshots`, `pruneAggregateSnapshots`, `pruneEventStoreSnapshots`): `dynamodb:DeleteItem` on the table.
- `listSnapshots({ aggregateId, ... })`: `dynamodb:Query` on the table.
- `listSnapshots({ reducerVersion, ... })`: `dynamodb:Query` on the `snapshotsByReducerVersion` GSI.
