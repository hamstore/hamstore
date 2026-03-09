import { pokemonsEventStore as $pokemonsEventStore } from '@hamstore/demo-blueprint';
import { DynamoDBSingleTableEventStorageAdapter } from '@hamstore/event-storage-adapter-dynamodb';

import { dynamoDBClient } from './client';

export const pokemonsEventStore = $pokemonsEventStore;

pokemonsEventStore.eventStorageAdapter =
  new DynamoDBSingleTableEventStorageAdapter({
    tableName: process.env.POKEMON_EVENTS_TABLE_NAME as string,
    dynamoDBClient,
  });
