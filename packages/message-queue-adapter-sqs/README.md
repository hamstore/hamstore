# SQS Message Queue Adapter

DRY Hamstore [`MessageQueue`](https://hamstore.github.io/hamstore/docs/reacting-to-events/message-queues/) definition using [AWS SQS](https://aws.amazon.com/sqs/).

## 📥 Installation

```bash
# npm
npm install @hamstore/message-queue-adapter-sqs

# pnpm
pnpm add @hamstore/message-queue-adapter-sqs
```

This package has `@hamstore/core` and `@aws-sdk/client-sqs` (above v3) as peer dependencies, so you will have to install them as well:

```bash
# npm
npm install @hamstore/core @aws-sdk/client-sqs

# pnpm
pnpm add @hamstore/core @aws-sdk/client-sqs
```

## 👩‍💻 Usage

```ts
import { SQSClient } from '@aws-sdk/client-sqs';

import { SQSMessageQueueAdapter } from '@hamstore/message-queue-adapter-sqs';

const sqsClient = new SQSClient({});

const messageQueueAdapter = new SQSMessageQueueAdapter({
  queueUrl: 'https://sqs.us-east-1.amazonaws.com/111122223333/my-super-queue',
  sqsClient,
});

// 👇 Alternatively, provide a getter
const messageQueueAdapter = new SQSMessageQueueAdapter({
  queueUrl: () => process.env.MY_SQS_QUEUE_URL,
  sqsClient,
});

const appMessageQueue = new NotificationMessageQueue({
  // ...
  messageQueueAdapter,
});
```

This will directly plug your MessageQueue to SQS 🙌

If your queue is of type FIFO, don't forget to specify it in the constructor:

```ts
const messageQueueAdapter = new SQSMessageQueueAdapter({
  queueUrl: 'https://sqs.us-east-1.amazonaws.com/111122223333/my-super-queue',
  sqsClient,
  fifo: true,
});
```

## 🤔 How it works

When publishing a message, it is JSON stringified and passed as the record body.

```ts
// 👇 Aggregate exists
const message = {
  body: '{
    \"eventStoreId\": \"POKEMONS\",
    \"aggregateId\": \"123\",
  }',
  ... // <= Other technical SQS properties
}
```

```ts
// 👇 Notification
const message = {
  body: '{
    \"eventStoreId\": \"POKEMONS\",
    \"event\": {
      \"aggregateId\": \"123\",
      \"version\": 1,
      \"type\": \"POKEMON_APPEARED\",
      \"timestamp\": ...
      ...
    },
  }',
  ...
}
```

```ts
// 👇 State-carrying
const message = {
  body: '{
    \"eventStoreId\": \"POKEMONS\",
    \"event\": {
      \"aggregateId\": \"123\",
      ...
    },
    \"aggregate\": ...,
  }',
  ...
};
```

If your queue is of type FIFO, the `messageGroupId` and `messageDeduplicationId` will be derived from a combination of the `eventStoreId`, `aggregateId` and `version`:

```ts
// 👇 Fifo message
const message = {
  messageBody: ...,
  messageGroupId: "POKEMONS#123",
  messageDeduplicationId: "POKEMONS#123#1", // <= Or "POKEMONS#123" for AggregateExistsMessageQueues
  ... // <= Other technical SQS properties
};
```

If the `replay` option is set to `true`, a `replay` metadata attribute is included in the message:

```ts
// 👇 Replayed notification message
const message = {
  body:  '{
    \"eventStoreId\": \"POKEMONS\",
    \"event\": {
      \"aggregateId\": \"123\",
      ...
    },
  }',
  messageAttributes: {
    replay: {
      // 👇 boolean type is not available in SQS 🤷‍♂️
      dataType: 'Number',
      // 👇 numberValue is not available in SQS 🤷‍♂️
      stringValue: '1',
    },
  },
  ...
};
```

On the worker side, you can use the `SQSMessageQueueMessage` and `SQSMessageQueueMessageBody` TS types to type your argument:

```ts
import type {
  SQSMessageQueueMessage,
  SQSMessageQueueMessageBody,
} from '@hamstore/message-queue-adapter-sqs';

const appMessagesWorker = async ({ Records }: SQSMessageQueueMessage) => {
  for (const { body } of Records) {
    // 👇 Correctly typed!
    const recordBody: SQSMessageQueueMessageBody<typeof appMessageQueue> =
      JSON.parse(body);
  }
};
```

## 🔑 IAM

The `publishMessage` method requires the `sqs:SendMessage` IAM permission on the provided SQS queue.
