/**
 * Defensive checks for strings that participate in composite keys. The
 * adapter documents these constraints in its README; this utility enforces
 * them at runtime so callers fail loudly instead of silently corrupting
 * range-query bounds.
 *
 * - `'#'` is the separator inside both PK (`<eventStoreId>#<aggregateId>`)
 *   and SK (`<padded-version>#<reducerVersion>`) values, so any of those
 *   parts containing `'#'` would make `eventStoreId#aggregateId` parsing
 *   ambiguous.
 *
 * - `'\uFFFF'` is the upper-bound terminator used by `sortKeyMaxForVersion`,
 *   so a `reducerVersion` containing it would extend past the bound and
 *   could be mis-included or excluded by `<= :maxSk` predicates.
 *   (Surrogate pairs encoding non-BMP code points use UTF-16 code units in
 *   the range 0xD800–0xDFFF, all strictly below 0xFFFF — so emoji and other
 *   non-BMP characters are safe; only literal `\uFFFF` is rejected.)
 */

const FORBIDDEN_REDUCER_VERSION_CHARS = ['#', '\uFFFF'] as const;

export const assertValidReducerVersion = (reducerVersion: string): void => {
  for (const char of FORBIDDEN_REDUCER_VERSION_CHARS) {
    if (reducerVersion.includes(char)) {
      const display = char === '#' ? "'#'" : "'\\uFFFF'";
      throw new Error(
        `DynamoDBSingleTableSnapshotStorageAdapter: reducerVersion must not contain ${display} (got ${JSON.stringify(reducerVersion)})`,
      );
    }
  }
};

export const assertValidAggregateId = (aggregateId: string): void => {
  if (aggregateId.includes('#')) {
    throw new Error(
      `DynamoDBSingleTableSnapshotStorageAdapter: aggregateId must not contain '#' (got ${JSON.stringify(aggregateId)})`,
    );
  }
};

export const assertValidEventStoreId = (eventStoreId: string): void => {
  if (eventStoreId.includes('#')) {
    throw new Error(
      `DynamoDBSingleTableSnapshotStorageAdapter: eventStoreId must not contain '#' (got ${JSON.stringify(eventStoreId)})`,
    );
  }
};
