<p align="center">
    <img src="assets/logo.svg" height="128">
    <h1 style="border-bottom:none;font-size:60px;margin-bottom:0;" align="center" >Hamstore</h1>
</p>
<p align="center">
  <a aria-label="NPM version" href="https://www.npmjs.com/package/@hamstore/core">
    <img alt="" src="https://img.shields.io/npm/v/@hamstore/core?color=166054&style=for-the-badge">
  </a>
  <a aria-label="License" href="https://github.com/hamstore/hamstore/blob/main/LICENSE">
    <img alt="" src="https://img.shields.io/github/license/hamstore/hamstore?color=%23bde5cb&style=for-the-badge">
  </a>
    <img alt="" src=https://img.shields.io/npm/dt/@hamstore/core?color=%23ddf99d&style=for-the-badge>
    <br/>
    <br/>
</p>

> **Note:** Hamstore is a fork of the excellent [Castore](https://github.com/castore-dev/castore) library, which is no longer actively maintained. We continue to build on its solid foundation.

# Making Event Sourcing easy 😎

[Event Sourcing](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing) is a data storage paradigm that saves **changes in your application state** rather than the state itself.

It is powerful as it enables **rewinding to a previous state** and **exploring audit trails** for debugging or business/legal purposes. It also integrates very well with [event-driven architectures](https://en.wikipedia.org/wiki/Event-driven_architecture).

That's why we forked the excellent [Castore](https://github.com/castore-dev/castore) library and created Hamstore — to keep pushing Event Sourcing forward in the TypeScript ecosystem.

---

<p align="center">
  Hamstore is a TypeScript library that <b>makes Event Sourcing easy</b> 😎
</p>

---

## Features

**🙈 Stack agnostic**: Can be used in any JS context (web apps, containers, lambdas... you name it 🙌)

**🕊️ Light-weight**: _opt-in_ packages only

**🏋️ Type-safety** pushed to the limit

**📐 Validation library agnostic** ([Zod](https://github.com/colinhacks/zod), [JSON schema](https://github.com/ThomasAribart/json-schema-to-ts)...) with support for type inference

**😍 On-the-shelf adapters** for [Redux](https://redux.js.org/), [DynamoDB](https://aws.amazon.com/dynamodb/), [SQS](https://aws.amazon.com/sqs/), [EventBridge](https://aws.amazon.com/eventbridge/) and more

**🎯 Test tools** included

**🔧 Migration & maintenance utils** available

**🎨 React components** to visualize and model your event stores

And much more to come 🙌: Admin, snapshots, read models...

## Visit the 👉 [official documentation](https://hamstore.github.io/hamstore/) 👈 to get started!
