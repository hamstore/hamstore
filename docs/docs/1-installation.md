---
sidebar_position: 1
---

# Installation

```bash
# npm
npm install @hamstore/core

# pnpm
pnpm add @hamstore/core
```

Hamstore is not a single package, but a **collection of packages** revolving around a `core` package. This is made so every line of code added to your project is _opt-in_, wether you use tree-shaking or not.

Hamstore packages are **released together**. Though different versions may be compatible, you are **guaranteed** to have working code as long as you use matching versions.

Here is an example of working `package.json`:

```js
{
  ...
  "dependencies": {
    "@hamstore/core": "2.0.0",
    "@hamstore/event-storage-adapter-dynamodb": "2.0.0"
    ...
  },
  "devDependencies": {
    "@hamstore/lib-test-tools": "2.0.0"
    ...
  }
}
```
