# Eval Result

Scanned `input-duplicates.graphql` for duplicate **input object** types.

| Duplicate group | Fields match | Action | Reason |
|---|---:|---|---|
| `CreateBookInput`, `NewBookInput`, `InternalCreateBookInput` | Yes | Skipped | Merging would change public input type names and risk breaking API contracts. No safe non-breaking consolidation was applied. |

No schema edits were made.
