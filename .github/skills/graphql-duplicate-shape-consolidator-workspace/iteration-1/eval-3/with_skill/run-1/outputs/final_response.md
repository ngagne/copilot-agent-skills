No exact duplicates were present to consolidate.

I did not merge near matches because the GraphQL shapes differ semantically:
- `Account` vs `AccountView`: `status` is deprecated only in `AccountView`.
- `FilterInput` vs `SearchInput`: `limit` has different default values (`10` vs `20`).

Those directive/default-value differences are intentional schema behavior, so they must remain separate.
