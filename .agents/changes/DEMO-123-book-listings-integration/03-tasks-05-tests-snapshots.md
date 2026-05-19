# Task 5: Full Jest Coverage and Snapshot Stabilization

**Depends on**: Task 3, Task 4
**Estimated complexity**: Medium
**Type**: Testing

## Objective
Complete and stabilize comprehensive tests across transformers, service, and resolvers with local
fixtures and snapshots, ensuring no network calls and deterministic behavior.

## ⚠️ Important information
Before coding, Read FIRST -> Load [03-tasks-00-READBEFORE.md](03-tasks-00-READBEFORE.md)

## Files to Modify/Create
- `test/integrations/legacy-books/transformers.test.ts`
- `test/integrations/legacy-books/service.test.ts`
- `test/resolvers.test.ts`
- `test/integrations/legacy-books/fixtures/*.json`
- `test/integrations/legacy-books/__snapshots__/*.snap`
- `.agents/changes/DEMO-123-book-listings-integration/PROGRESS.md`

## Detailed Steps
1. Update `PROGRESS.md` task 05 to `🔄 In Progress`.
2. Ensure fixture-driven tests cover happy + malformed payload variants.
3. Add/refresh snapshots for transformed output and resolver/error shapes.
4. Ensure service tests fully mock HTTP and assert no live calls.
5. Add assertions for cache/dedupe behavior in resolver tests.
6. Run `npm run test`, `npm run typecheck`, and `npm run lint`.
7. Fix flaky snapshots or nondeterministic data generation.
8. Update `PROGRESS.md` task 05 to `✅ Completed`.
9. Commit with `test: implement task 05 - coverage for legacy integration`.

## Acceptance Criteria
- [ ] Transformer, service, and resolver test suites pass locally.
- [ ] Snapshot coverage exists for both transform outputs and resolver/error shapes.
- [ ] Fixture corpus includes malformed payloads.
- [ ] No tests perform real HTTP requests.

## Testing
- **Test file**: `test/integrations/legacy-books/transformers.test.ts`
- **Test file**: `test/integrations/legacy-books/service.test.ts`
- **Test file**: `test/resolvers.test.ts`
- **Test cases**:
  - all required scenarios from specification success criteria
  - deterministic snapshots for normalized output
  - 404/timeout/retry semantics

## Notes
Prefer explicit assertions alongside snapshots to avoid over-reliance on snapshot diffs.
