# Baseline Eval Result

I found **no exact duplicate shapes** to consolidate in `non-exact-shapes.graphql`.

Why the near matches were **not** merged:
- `Account.status` vs `AccountView.status`: `AccountView.status` has `@deprecated(reason: "Use state instead")`, so the field definitions are not identical.
- `FilterInput.limit` vs `SearchInput.limit`: the default values differ (`10` vs `20`), so the inputs are not exact duplicates.

Result: **only exact duplicates would be consolidated; none were present here.**
