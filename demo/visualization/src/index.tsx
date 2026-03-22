import { tuple } from '@hamstore/core';
import {
  pokemonsEventStore,
  trainersEventStore,
  startPokemonGameCommand,
  wildPokemonAppearCommand,
  catchPokemonCommand,
  levelUpPokemonCommand,
} from '@hamstore/demo-blueprint';
import { Visualizer } from '@hamstore/lib-react-visualizer';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { v4 as uuid } from 'uuid';

import './index.css';

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <Visualizer
      eventStores={[pokemonsEventStore, trainersEventStore]}
      /**
       * @debt improvement "we probably don't have to use tuple here"
       */
      commands={tuple(
        startPokemonGameCommand,
        wildPokemonAppearCommand,
        catchPokemonCommand,
        levelUpPokemonCommand,
      )}
      contextsByCommandId={{
        START_POKEMON_GAME: [{ generateUuid: uuid }],
        WILD_POKEMON_APPEAR: [{ generateUuid: uuid }],
      }}
    />
  </StrictMode>,
);
