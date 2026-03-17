import { trainersEventStore as $trainersEventStore } from '@hamstore/demo-blueprint';
import { DynamoDBSingleTableEventStorageAdapter } from '@hamstore/event-storage-adapter-dynamodb';

import { dynamoDBClient } from './client';

export const trainersEventStore: typeof $trainersEventStore =
  $trainersEventStore;

trainersEventStore.eventStorageAdapter =
  new DynamoDBSingleTableEventStorageAdapter({
    tableName: process.env.TRAINER_EVENTS_TABLE_NAME as string,
    dynamoDBClient,
  });
