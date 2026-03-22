import {
  counterEventsMocks,
  getEventsMock,
  incrementCounter,
  incrementCounterA,
  incrementCounterANoOutput,
  incrementCounterNoOutput,
  inputSchema,
  outputSchema,
  requiredEventStores,
} from './command.fixtures.test';

getEventsMock.mockResolvedValue({ events: counterEventsMocks });

describe('jsonSchemaCommand implementation', () => {
  const expectedProperties = new Set([
    '_types',
    'commandId',
    'requiredEventStores',
    'inputSchema',
    'outputSchema',
    'eventAlreadyExistsRetries',
    'onEventAlreadyExists',
    'handler',
  ]);

  it('has correct properties', () => {
    expect(new Set(Object.keys(incrementCounter))).toStrictEqual(
      expectedProperties,
    );

    expect(
      incrementCounter.requiredEventStores.map(
        ({ eventStoreId }) => eventStoreId,
      ),
    ).toStrictEqual(
      requiredEventStores.map(({ eventStoreId }) => eventStoreId),
    );

    expect(incrementCounter.inputSchema).toStrictEqual(inputSchema);
    expect(incrementCounter.outputSchema).toStrictEqual(outputSchema);
  });

  it('has correct properties (no output)', () => {
    expect(new Set(Object.keys(incrementCounterNoOutput))).toStrictEqual(
      expectedProperties,
    );
    expect(incrementCounterNoOutput.inputSchema).toStrictEqual(inputSchema);
    expect(incrementCounterNoOutput.outputSchema).toBeUndefined();
  });

  it('has correct properties (no input)', () => {
    expect(new Set(Object.keys(incrementCounterA))).toStrictEqual(
      expectedProperties,
    );
    expect(incrementCounterA.inputSchema).toBeUndefined();
    expect(incrementCounterA.outputSchema).toStrictEqual(outputSchema);
  });

  it('has correct properties (no input, no output)', () => {
    expect(new Set(Object.keys(incrementCounterANoOutput))).toStrictEqual(
      expectedProperties,
    );
    expect(incrementCounterANoOutput.inputSchema).toBeUndefined();
    expect(incrementCounterANoOutput.outputSchema).toBeUndefined();
  });
});
