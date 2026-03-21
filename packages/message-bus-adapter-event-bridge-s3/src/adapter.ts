import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { isEventCarryingMessage } from '@hamstore/core';
import { EventBridgeMessageBusAdapter } from '@hamstore/message-bus-adapter-event-bridge';

import { getFormattedMessageSize, PUT_EVENTS_ENTRIES_SIZE_LIMIT } from './getFormattedMessageSize';

/* eslint-disable max-lines */
import type { EventBridgeClient, PutEventsRequestEntry } from '@aws-sdk/client-eventbridge';
import type { Message, MessageChannelAdapter } from '@hamstore/core';
import type { OversizedEntryDetail } from './message';

const EVENTBRIDGE_MAX_ENTRIES_BATCH_SIZE = 10;

export class EventBridgeS3MessageBusAdapter implements MessageChannelAdapter {
  publishMessage: MessageChannelAdapter['publishMessage'];
  publishMessages: MessageChannelAdapter['publishMessages'];

  eventBridgeMessageBusAdapter: EventBridgeMessageBusAdapter;
  s3BucketName: string | (() => string);
  s3Client: S3Client;
  s3Prefix: string;
  s3PreSignatureExpirationInSec: number;

  getS3BucketName: () => string;
  publishFormattedMessage: (
    formattedMessage: PutEventsRequestEntry,
    message: Message,
  ) => Promise<void>;

  constructor({
    eventBusName,
    eventBridgeClient,
    s3BucketName,
    s3Client,
    s3Prefix = '',
    s3PreSignatureExpirationInSec = 900,
  }: {
    eventBusName: string | (() => string);
    eventBridgeClient: EventBridgeClient;
    s3BucketName: string | (() => string);
    s3Client: S3Client;
    s3Prefix?: string;
    s3PreSignatureExpirationInSec?: number;
  }) {
    this.eventBridgeMessageBusAdapter = new EventBridgeMessageBusAdapter({
      eventBusName,
      eventBridgeClient,
    });
    this.s3BucketName = s3BucketName;
    this.s3Client = s3Client;
    this.s3Prefix = s3Prefix;
    this.s3PreSignatureExpirationInSec = s3PreSignatureExpirationInSec;

    this.getS3BucketName = () =>
      typeof this.s3BucketName === 'string' ? this.s3BucketName : this.s3BucketName();

    this.publishMessage = (message, options) =>
      this.publishFormattedMessage(
        this.eventBridgeMessageBusAdapter.formatMessage(message, options),
        message,
      );

    this.publishFormattedMessage = async (formattedMessage, message) => {
      if (getFormattedMessageSize(formattedMessage) <= PUT_EVENTS_ENTRIES_SIZE_LIMIT) {
        return this.eventBridgeMessageBusAdapter.publishFormattedMessage(formattedMessage);
      }

      const { eventStoreId } = message;
      const filePath: string[] = [eventStoreId];

      if (isEventCarryingMessage(message)) {
        const { aggregateId, version } = message.event;
        filePath.push(aggregateId, [new Date().toISOString(), String(version)].join('#'));
      } else {
        const { aggregateId } = message;
        filePath.push(aggregateId, new Date().toISOString());
      }

      const bucketName = this.getS3BucketName();
      const fileKey = [this.s3Prefix, filePath.join('/')].join('');

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Body: JSON.stringify(message),
          Key: fileKey,
          ContentType: 'application/json',
        }),
      );

      const messageUrl = await getSignedUrl(
        this.s3Client,
        new GetObjectCommand({
          Bucket: bucketName,
          Key: fileKey,
        }),
        { expiresIn: this.s3PreSignatureExpirationInSec },
      );

      const oversizedEntryDetail: OversizedEntryDetail = { messageUrl };

      return this.eventBridgeMessageBusAdapter.publishFormattedMessage({
        ...formattedMessage,
        Detail: JSON.stringify(oversizedEntryDetail),
      });
    };

    this.publishMessages = async (messages, options) => {
      const formattedMessages = messages.map(message =>
        this.eventBridgeMessageBusAdapter.formatMessage(message, options),
      );

      type FormattedMessageWithContext = {
        message: Message;
        formattedMessage: PutEventsRequestEntry;
        formattedMessageSize: number;
      };

      const formattedMessagesWithContext: FormattedMessageWithContext[] = formattedMessages.map(
        (formattedMessage, index) => ({
          formattedMessage,
          formattedMessageSize: getFormattedMessageSize(formattedMessage),
          message: messages[index] as Message,
        }),
      );

      formattedMessagesWithContext.sort(
        ({ formattedMessageSize: sizeA }, { formattedMessageSize: sizeB }) => sizeA - sizeB,
      );

      const formattedMessageBatches: FormattedMessageWithContext[][] = [[]];
      let currentBatch = formattedMessageBatches[0] as FormattedMessageWithContext[];
      let currentBatchSize = 0;

      // NOTE: We could search for the largest fitting formattedMessage instead of doing a for loop
      for (const formattedMessageWithContext of formattedMessagesWithContext) {
        const { formattedMessageSize } = formattedMessageWithContext;

        if (
          currentBatch.length < EVENTBRIDGE_MAX_ENTRIES_BATCH_SIZE &&
          currentBatchSize + formattedMessageSize <= PUT_EVENTS_ENTRIES_SIZE_LIMIT
        ) {
          currentBatch.push(formattedMessageWithContext);
          currentBatchSize += formattedMessageSize;
        } else {
          formattedMessageBatches.push([formattedMessageWithContext]);
          currentBatch = formattedMessageBatches.at(-1) as FormattedMessageWithContext[];
          currentBatchSize = formattedMessageSize;
        }
      }

      for (const formattedMessageBatch of formattedMessageBatches) {
        if (formattedMessageBatch.length === 0) {
          // Can happen for first batch if first message is oversized
          continue;
        }

        if (formattedMessageBatch.length === 1) {
          const [formattedMessageWithContext] = formattedMessageBatch as [
            FormattedMessageWithContext,
          ];
          const { formattedMessage, message } = formattedMessageWithContext;

          await this.publishFormattedMessage(formattedMessage, message);
          continue;
        }

        // We are sure that the batch is not oversized if there is more than 1 entry
        await this.eventBridgeMessageBusAdapter.publishFormattedMessages(
          formattedMessageBatch.map(({ formattedMessage }) => formattedMessage),
        );
      }
    };
  }

  set eventBusName(eventBusName: string | (() => string)) {
    this.eventBridgeMessageBusAdapter.eventBusName = eventBusName;
  }

  get eventBusName(): string {
    return this.eventBridgeMessageBusAdapter.getEventBusName();
  }

  set eventBridgeClient(eventBridgeClient: EventBridgeClient) {
    this.eventBridgeMessageBusAdapter.eventBridgeClient = eventBridgeClient;
  }

  get eventBridgeClient(): EventBridgeClient {
    return this.eventBridgeMessageBusAdapter.eventBridgeClient;
  }
}
