import { uuidSchema } from '~/libs/schemas/uuid';

import type { FromSchema } from 'json-schema-to-ts';

export const inputSchema = {
  type: 'object',
  properties: {
    queryStringParameters: {
      type: 'object',
      properties: {
        aggregateId: uuidSchema,
      },
      required: ['aggregateId'],
      additionalProperties: false,
    },
  },
  required: ['queryStringParameters'],
} as const;

export type Input = FromSchema<typeof inputSchema>;
