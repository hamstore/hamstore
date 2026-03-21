import { Stack } from '@mui/material';
import React, { JSX } from 'react';

import { CommandCard } from './CommandCard';

import type { JSONSchemaCommand } from '@hamstore/command-json-schema';
import type { EventStore } from '@hamstore/core';

export const Commands = ({
  commands,
  eventStoresById,
  contextsByCommandId,
}: {
  commands: JSONSchemaCommand[];
  eventStoresById: Record<string, EventStore>;
  contextsByCommandId: Record<string, unknown[]>;
}): JSX.Element => (
  <Stack spacing={2}>
    {commands.map(command => (
      <CommandCard
        key={command.commandId}
        command={command}
        eventStoresById={eventStoresById}
        contextsByCommandId={contextsByCommandId}
      />
    ))}
  </Stack>
);
