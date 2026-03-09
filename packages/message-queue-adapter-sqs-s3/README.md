# SQS + S3 Message Bus Adapter

DRY Hamstore [`MessageQueue`](https://hamstore.github.io/hamstore/docs/reacting-to-events/message-queues/) definition using [AWS SQS](https://aws.amazon.com/sqs/) and [AWS S3](https://aws.amazon.com/s3/).

This adapter works like the [SQS Message Queue Adapter](https://www.npmjs.com/package/@hamstore/message-queue-adapter-sqs) (it actually uses it under the hood), excepts that entry sizes are checked before publishing messages to EventBridge. If they are over the [256KB limit](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html), they are written on a s3 bucket instead, and a message is sent containing a pre-signed URL, as [recommended by AWS](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html).

Do not forget to set a [lifecycle configuration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html) on your s3 bucket to delete the written objects after the presigned URL has expired to avoid high s3 bills! 🤑

## 📥 Installation

```bash
# npm
npm install @hamstore/message-queue-adapter-sqs-s3

# yarn
yarn add @hamstore/message-queue-adapter-sqs-s3
```

This package has `@hamstore/core`, `@aws-sdk/client-sqs` (above v3), `@aws-sdk/client-s3` (above v3) and `@aws-sdk/s3-request-presigner` (above v3) as peer dependencies, so you will have to install them as well:

```bash
# npm
npm install @hamstore/core @aws-sdk/client-sqs @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# yarn
yarn add @hamstore/core @aws-sdk/client-sqs @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## 👩‍💻 Usage

```ts
import { SQSClient } from '@aws-sdk/client-sqs';
import { S3Client } from '@aws-sdk/client-s3';

import { SQSS3MessageBusAdapter } from '@hamstore/message-queue-adapter-sqs-s3';

const sqsClient = new SQSClient({});
const s3Client = new S3Client({});

const messageQueueAdapter = new SQSS3MessageQueueAdapter({
  queueUrl: 'https://sqs.us-east-1.amazonaws.com/111122223333/my-super-queue',
  sqsClient,
  s3BucketName: 'my-bucket-name',
  s3Client,
  // 👇 Optional s3 prefix for temporary data
  s3Prefix: 'temporary-storage/',
  // 👇 Optional s3 presignature expiration in seconds (defaults to 900)
  s3PreSignatureExpirationInSec: 3600
});

// 👇 Alternatively, provide a getter
const messageQueueAdapter = new SQSS3MessageQueueAdapter({
  queueUrl: () => process.env.MY_QUEUE_URL,
  s3BucketName: () => process.env.MY_BUCKET_NAME
  ...
});

const appMessageQueue = new NotificationMessageQueue({
  ...
  messageQueueAdapter
})
```

This will directly plug your MessageQueue to SQS and S3 🙌

## 🤔 How it works

You can read the [SQS Message Queue Adapter documentation](https://www.npmjs.com/package/@hamstore/message-queue-adapter-sqs) for regular cases.

When an entry is oversized, its `Detail` is saved as a JSON object in the provided s3 bucket. It's key is a concatenation of the constructor `s3Prefix` option, the `eventStoreId` and `aggregateId` of the event and the current timestamp:

```ts
const key = 'temporary-storage/POKEMONS/pikachu1/2020-01-01T00:00:00.000Z';
```

If the event is a notification or state-carrying event, the `version` is also added to the mix:

```ts
// 👇 Date is suffixed by the version
const key = 'temporary-storage/POKEMONS/pikachu1/2020-01-01T00:00:00.000Z#3';
```

On the listeners side, you can use the `SQSS3MessageBusMessage` TS type to type your argument, and the `parseMessage` util to fetch the message if it has been uploaded to S3 (it passes it through otherwise):

On the worker side, you can use the `SQSS3MessageQueueMessage` TS type to type your argument, and the `parseBody` util to fetch the message if it has been uploaded to S3 (it passes it through otherwise):

```ts
import {
  SQSS3MessageQueueMessage,
  parseBody,
} from '@hamstore/message-queue-adapter-sqs-s3';

const appMessagesWorker = async ({ Records }: SQSS3MessageQueueMessage) => {
  for (const { body } of Records) {
    // 🙌 Correctly typed!
    const recordBody = await parseBody<typeof appMessageQueue>(body);
  }
};
```

Note that `parseBody` uses `fetch` under the hood, so you will have to provide it if your version of node doesn't:

```ts
import fetch from 'node-fetch';

import {
  SQSS3MessageQueueMessage,
  parseBody,
} from '@hamstore/message-queue-adapter-sqs-s3';

const appMessagesWorker = async ({ Records }: SQSS3MessageQueueMessage) => {
  for (const { body } of Records) {
    // 🙌 Correctly typed!
    const recordBody = await parseBody<typeof appMessageQueue>(body, { fetch });
  }
};
```

## 🔑 IAM

The `publishMessage` method requires the `sqs:SendMessage` IAM permission on the provided SQS queue, as well as the `s3:putObject` and `s3:getObject` IAM permissions on the provided s3 bucket at the desired keys (e.g. `my-bucket-name/temporary-storage/*`).

The `parseBody` util doesn't require any permission as the messageURL is pre-signed.
