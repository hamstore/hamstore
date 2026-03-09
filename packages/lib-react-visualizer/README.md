# React Visualizer

React component to visualize, design and manually test [Hamstore](https://github.com/hamstore/hamstore) event stores and commands.

Here is a [hosted example](https://hamstore.github.io/hamstore/visualizer/), based on the docs code snippets about pokemons and trainers. You can find the related source code (commands & event stores) in the [demo package](https://github.com/hamstore/hamstore/tree/main/demo/blueprint/src).

## 📥 Installation

```bash
# npm
npm install --save-dev @hamstore/lib-react-visualizer

# yarn
yarn add --dev @hamstore/lib-react-visualizer
```

This package has `@hamstore/core`, `@hamstore/command-json-schema` and `react` (above v17) as peer dependencies, so you will have to install them as well:

```bash
# npm
npm install @hamstore/core @hamstore/command-json-schema react

# yarn
yarn add @hamstore/core @hamstore/command-json-schema react
```

## 👩‍💻 Usage

```tsx
// ...somewhere in your React App
import { tuple } from '@hamstore/core';
import { Visualizer } from '@hamstore/lib-react-visualizer';

const MyPage = () =>
  <Visualizer
    eventStores={[
      eventStoreA,
      eventStoreB
      ...
    ]}
    // 👇 `tuple` is only used for type inference
    commands={tuple(
      commandA,
      commandB
      ...
    )}
    // 👇 Provide additional context arguments
    // (see https://github.com/hamstore/hamstore#--command)
    contextsByCommandId={{
      COMMAND_A_ID: [{ generateUuid: uuid }],
      ...
    }}
  />
```

It will render a [visualizer](https://hamstore.github.io/hamstore/).

## ☝️ Warning

| ❌ **This package is not an admin** ❌ |
| -------------------------------------- |

We are thinking about re-using some Components to develop an admin, but it is NOT an admin for now. It's main goal is to visualize, design and manually test your event stores and commands, as well as getting familiar with the event sourcing paradigm.

No connection to a DB or API is actually done. All the data is stored locally your web page, thanks to a [`ReduxEventStorageAdapter`](https://github.com/hamstore/hamstore/tree/main/packages/event-storage-adapter-redux).

Also, the forms are generated with [`react-json-schema-form`](https://github.com/rjsf-team/react-jsonschema-form), so only `JSONSchemaCommand`s are supported.

## 🎨 Unthemed component

The visualizer uses the [MUI](https://mui.com/) components library. You can customize its design by providing your own theme:

```tsx
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { UnthemedVisualizer } from '@hamstore/lib-react-visualizer';

const customTheme = createTheme({
  ...
})

const MyPage = () =>
  <ThemeProvider theme={customTheme}>
    <CssBaseline/>
    <UnthemedVisualizer ... />
  </Theme>
```
