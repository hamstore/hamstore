import { useAggregateIds } from '@hamstore/event-storage-adapter-redux';
import { Stack } from '@mui/material';
import React, { JSX } from 'react';

import { AggregateCard } from './AggregateCard';

import type { EventStore } from '@hamstore/core';

export const EventStoreDB = ({
  eventStore,
}: {
  eventStore: EventStore;
}): JSX.Element => {
  const { aggregateIds } = useAggregateIds(eventStore);

  return (
    <Stack spacing={2}>
      {aggregateIds.map(({ aggregateId }) => (
        <AggregateCard
          key={aggregateId}
          aggregateId={aggregateId}
          eventStore={eventStore}
        />
      ))}
    </Stack>
  );
};
