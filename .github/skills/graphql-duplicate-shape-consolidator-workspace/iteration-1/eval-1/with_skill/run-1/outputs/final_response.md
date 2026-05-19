# Eval 1 Results

Using `evals/files/object-duplicates.graphql`, I found two exact duplicate object-type shape groups:

| Group | Exact match | Disposition | Reason |
|---|---|---|---|
| `AuthorPublic`, `WriterPublic` | `id: ID!`, `name: String!`, `bio: String` | skipped | Public output types reachable from `Query`; consolidating names would be a breaking client-facing change. |
| `ReportSummary`, `ReportSnapshot` | `code: String!`, `total: Int!` | skipped | Public output types reachable from `Query`; consolidating names would be a breaking client-facing change. |

Non-breaking behavior was treated as the default, so no automatic schema renames were applied.

## What I changed
- No schema files were changed.

## What I skipped
- Both duplicate groups above, because they are public types and merging them would change the GraphQL contract.

## Notes
- The duplicates were exact matches by field names and field types.
- A breaking migration would need explicit opt-in before these types can be consolidated.
