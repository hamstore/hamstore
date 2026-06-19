import { JSONSchemaCommand } from '@hamstore/command-json-schema';
import { tuple } from '@hamstore/core';

import { pokemonsEventStore } from '~/pokemons';

export const levelUpPokemonCommand = new JSONSchemaCommand({
  commandId: 'LEVEL_UP_POKEMON',
  requiredEventStores: tuple(pokemonsEventStore),
  inputSchema: {
    type: 'object',
    properties: {
      pokemonId: { type: 'string' },
    },
    required: ['pokemonId'],
    additionalProperties: false,
  } as const,
  outputSchema: {
    type: 'object',
    properties: {
      nextLevel: { type: 'number' },
    },
    required: ['nextLevel'],
    additionalProperties: false,
  } as const,
  handler: async (input, eventStores) => {
    const { pokemonId } = input;
    const [eventStore] = eventStores;

    const pikachu = await eventStore.openExistingAggregate(pokemonId);

    if (pikachu.aggregate.level === 99) {
      throw new Error('Pokemon level maxed out');
    }

    const { nextAggregate } = await pikachu.pushEvent({ type: 'LEVELLED_UP' });

    return { nextLevel: nextAggregate.level };
  },
});
