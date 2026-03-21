import type { JSONSchemaCommand } from '@hamstore/command-json-schema';
import type { EventStore } from '@hamstore/core';
import { configureHamstore } from '@hamstore/event-storage-adapter-redux';
import React, { JSX } from 'react';
import { Provider } from 'react-redux';

import { VisualizerContent } from './VisualizerContent';

export const UnthemedVisualizer = ({
  commands,
  eventStores,
  contextsByCommandId,
}: {
  commands: JSONSchemaCommand[];
  eventStores: EventStore[];
  contextsByCommandId: Record<string, unknown[]>;
}): JSX.Element => {
  const store = configureHamstore({ eventStores });

  const eventStoresById: Record<string, EventStore> = {};
  const eventStoreIds: string[] = [];
  eventStores.forEach(eventStore => {
    eventStoreIds.push(eventStore.eventStoreId);
    eventStoresById[eventStore.eventStoreId] = eventStore;
  });

  return (
    <Provider store={store}>
      <VisualizerContent
        commands={commands}
        eventStoreIds={eventStoreIds}
        eventStoresById={eventStoresById}
        contextsByCommandId={contextsByCommandId}
      />
    </Provider>
  );
};
