# Baseline eval result

## What I changed
- No schema changes were applied in this baseline run.

## What I skipped
- Skipped consolidating `AuthorPublic` and `WriterPublic` because keeping both type names preserves client-facing compatibility.
- Skipped consolidating `ReportSummary` and `ReportSnapshot` for the same compatibility reason.

## Notes
- The schema contains two exact duplicate shape pairs:
  - `AuthorPublic` / `WriterPublic`
  - `ReportSummary` / `ReportSnapshot`
- These are safe consolidation candidates, but this run preserved the public API surface by default.
