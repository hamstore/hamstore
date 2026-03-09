import type { Aggregate } from '@hamstore/core';

export type TrainerAggregate = Aggregate & {
  name: string;
  caughtPokemonIds: string[];
  caughtPokemonsCount: number;
};
