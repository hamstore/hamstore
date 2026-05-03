import {
  Command,
  EventStore,
  $Contravariant,
  OnEventAlreadyExistsCallback,
} from '@hamstore/core';
import type * as z3 from 'zod/v3';
import type * as z4 from 'zod/v4/core';

type ZodType = z3.ZodTypeAny | z4.$ZodType;
type inferZodType<T extends ZodType> = T extends z3.ZodTypeAny
  ? z3.infer<T>
  : z4.infer<T>;

// Local polyfill so consumers on TypeScript < 5.4 (which doesn't ship a
// built-in `NoInfer`) can still consume the published `.d.ts`. On TS 5.4+
// this shadows the global with an equivalent definition.
// eslint-disable-next-line @typescript-eslint/no-shadow
type NoInfer<T> = [T][T extends unknown ? 0 : never];

export class ZodCommand<
  COMMAND_ID extends string = string,
  EVENT_STORES extends EventStore[] = EventStore[],
  $EVENT_STORES extends EventStore[] = $Contravariant<
    EVENT_STORES,
    EventStore[]
  >,
  INPUT_SCHEMA extends ZodType | undefined = ZodType | undefined,
  INPUT = $Contravariant<
    INPUT_SCHEMA,
    ZodType,
    INPUT_SCHEMA extends ZodType ? inferZodType<INPUT_SCHEMA> : never
  >,
  OUTPUT_SCHEMA extends ZodType | undefined = ZodType | undefined,
  // OUTPUT is constrained so handlers can't disagree with `outputSchema`
  // (the castore-dev/castore#194 bug). When no `outputSchema` is provided
  // the constraint is `unknown`, so `OUTPUT` can still be inferred from
  // the handler's return type — preserving the common "trust the handler"
  // pattern.
  OUTPUT extends OUTPUT_SCHEMA extends ZodType
    ? inferZodType<OUTPUT_SCHEMA>
    : unknown = $Contravariant<
    OUTPUT_SCHEMA,
    ZodType,
    OUTPUT_SCHEMA extends ZodType ? inferZodType<OUTPUT_SCHEMA> : never
  >,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  CONTEXT extends any[] = any[],
> extends Command<
  COMMAND_ID,
  EVENT_STORES,
  $EVENT_STORES,
  INPUT,
  OUTPUT,
  CONTEXT
> {
  inputSchema?: INPUT_SCHEMA;
  outputSchema?: OUTPUT_SCHEMA;

  constructor({
    commandId,
    requiredEventStores,
    eventAlreadyExistsRetries,
    onEventAlreadyExists,
    handler,
    inputSchema,
    outputSchema,
  }: {
    commandId: COMMAND_ID;
    requiredEventStores: EVENT_STORES;
    eventAlreadyExistsRetries?: number;
    onEventAlreadyExists?: OnEventAlreadyExistsCallback;
    handler: (
      input: NoInfer<INPUT>,
      eventStores: $EVENT_STORES,
      ...context: CONTEXT
    ) => Promise<OUTPUT>;
    inputSchema?: INPUT_SCHEMA;
    outputSchema?: OUTPUT_SCHEMA;
  }) {
    super({
      commandId,
      requiredEventStores,
      eventAlreadyExistsRetries,
      onEventAlreadyExists,
      handler,
    });

    if (inputSchema !== undefined) {
      this.inputSchema = inputSchema;
    }

    if (outputSchema !== undefined) {
      this.outputSchema = outputSchema;
    }
  }
}
