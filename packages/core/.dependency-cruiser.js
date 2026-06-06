/** @type {import('dependency-cruiser').IConfiguration} */
import baseConfig from '../../.dependency-cruiser.js';

export default {
  ...baseConfig,
  options: {
    ...baseConfig.options,
    exclude: {
      ...baseConfig.options.exclude,
      path: [
        'src/event/groupedEvent.ts',
        // type dependency only
        'src/connectedEventStore/publishPushedEvent.ts',
        // type-only dependency on EventStore (mirrors groupedEvent.ts); the
        // EventStore -> AggregateHandle edge is a value import, but the reverse
        // edge is types-only, so there is no runtime cycle.
        'src/eventStore/aggregateHandle.ts',
      ],
    },
  },
};
