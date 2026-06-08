import { JSONSchemaCommand } from '@hamstore/command-json-schema';
import { EventStore, tuple } from '@hamstore/core';

import { pokemonsEventStore } from '~/pokemons';
import { trainersEventStore } from '~/trainers';

export const catchPokemonCommand = new JSONSchemaCommand({
  commandId: 'CATCH_POKEMON',
  requiredEventStores: tuple(pokemonsEventStore, trainersEventStore),
  inputSchema: {
    type: 'object',
    properties: {
      pokemonId: { type: 'string' },
      trainerId: { type: 'string' },
    },
    required: ['pokemonId', 'trainerId'],
    additionalProperties: false,
  } as const,
  handler: async (input, eventStores) => {
    const { pokemonId, trainerId } = input;
    const [pokemonsStore, trainersStore] = eventStores;

    const [pokemon, trainer] = await Promise.all([
      pokemonsStore.openExistingAggregate(pokemonId),
      trainersStore.openExistingAggregate(trainerId),
    ]);

    if (pokemon.aggregate.status === 'caught') {
      throw new Error('Pokemon already caught');
    }

    await EventStore.pushEventGroup(
      pokemon.groupEvent({
        type: 'CAUGHT_BY_TRAINER',
        payload: {
          trainerId,
        },
      }),
      trainer.groupEvent({
        type: 'POKEMON_CAUGHT',
        payload: {
          pokemonId,
        },
      }),
    );
  },
});
