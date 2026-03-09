import BrowserOnly from '@docusaurus/BrowserOnly';
import { tuple } from '@hamstore/core';
import {
  pokemonsEventStore,
  trainersEventStore,
  startPokemonGameCommand,
  wildPokemonAppearCommand,
  catchPokemonCommand,
  levelUpPokemonCommand,
} from '@hamstore/demo-blueprint';
import Layout from '@theme/Layout';
import React, { JSX } from 'react';

import './index.css';

const VisualizerPage = (): JSX.Element => (
  <Layout
    title="Visualizer"
    description="Hamstore is a TypeScript library that makes Event Sourcing easy, a powerful paradigm that saves changes to your application state rather than the state itself."
  >
    <BrowserOnly>
      {() => {
        const Visualizer = require('@hamstore/lib-react-visualizer').Visualizer;
        const uuid = require('uuid').v4 as () => string;

        return (
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
        );
      }}
    </BrowserOnly>
  </Layout>
);

export default VisualizerPage;
