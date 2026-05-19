# Task 2: Transformers and Contract Fixtures

**Depends on**: Task 1
**Estimated complexity**: High
**Type**: Feature

## Objective
Build strict transformation/validation functions from downstream payloads to domain objects and
establish fixture corpus for happy-path and malformed contract examples.

## ⚠️ Important information
Before coding, Read FIRST -> Load [03-tasks-00-READBEFORE.md](03-tasks-00-READBEFORE.md)

## Files to Modify/Create
- `src/integrations/legacy-books/transformers.ts`
- `test/integrations/legacy-books/transformers.test.ts`
- `test/integrations/legacy-books/fixtures/book-response.valid.json`
- `test/integrations/legacy-books/fixtures/book-response.malformed.json`
- `test/integrations/legacy-books/fixtures/store-response.valid.json`
- `test/integrations/legacy-books/fixtures/store-response.malformed.json`
- `test/integrations/legacy-books/__snapshots__/transformers.test.ts.snap`
- `.agents/changes/DEMO-123-book-listings-integration/PROGRESS.md`

## Detailed Steps
1. Update `PROGRESS.md` task 02 to `🔄 In Progress`.
2. Implement strict date parser for `MM/DD/YYYY HH:mm:ss` with deterministic ISO output.
3. Implement yes/no parser returning `boolean | null` for invalid values.
4. Implement numeric parser supporting decimal numeric strings.
5. Compose payload transformers with required-field validation and typed outputs.
6. Add fixture-driven tests for valid/malformed inputs and explicit error code assertions.
7. Add snapshot tests for transformed listing/store outputs.
8. Run `npm run test -- transformers.test.ts` and `npm run typecheck`.
9. Update `PROGRESS.md` task 02 to `✅ Completed`.
10. Commit with `feat: implement task 02 - strict legacy payload transformers`.

## Acceptance Criteria
- [ ] All required field transformations are implemented and typed.
- [ ] Invalid contract shapes map to `DOWNSTREAM_INVALID_PAYLOAD`.
- [ ] Snapshot output is stable and readable.
- [ ] Fixture set includes happy + malformed cases.

## Testing
- **Test file**: `test/integrations/legacy-books/transformers.test.ts`
- **Test cases**:
  - valid listing transforms include ISO date and numeric price
  - invalid date format fails with invalid payload error
  - invalid yes/no maps to `null`
  - malformed object shape throws standardized error

## Notes
Prefer pure functions with no side effects to maximize reuse and testability.
