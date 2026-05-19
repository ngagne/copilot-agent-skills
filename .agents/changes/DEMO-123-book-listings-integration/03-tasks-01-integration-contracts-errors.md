# Task 1: Integration Contracts and Error Model

**Depends on**: None
**Estimated complexity**: Medium
**Type**: Feature

## Objective
Create foundational downstream types and standardized error model used across transformers,
service calls, and GraphQL resolver propagation.

## ⚠️ Important information
Before coding, Read FIRST -> Load [03-tasks-00-READBEFORE.md](03-tasks-00-READBEFORE.md)

## Files to Modify/Create
- `src/integrations/legacy-books/types.ts`
- `src/integrations/legacy-books/errors.ts`
- `src/integrations/legacy-books/index.ts` (optional)
- `.agents/changes/DEMO-123-book-listings-integration/PROGRESS.md`

## Detailed Steps
1. Update `PROGRESS.md` task 01 to `🔄 In Progress`.
2. Define downstream DTO types aligned with `openapi.yaml` (`BookResponse`, `ListingResponse`,
   `StoreResponse`) including inconsistent key casing.
3. Define normalized domain types consumed by resolver layer (book listing/store shapes).
4. Implement error class/envelope and mapping utilities for standard codes.
5. Export integration surface for downstream consumers.
6. Add focused unit tests for error helper behaviors if helpers include logic.
7. Run `npm run typecheck`.
8. Update `PROGRESS.md` task 01 to `✅ Completed`.
9. Commit with `feat: implement task 01 - legacy contracts and error taxonomy`.

## Acceptance Criteria
- [ ] DTO and domain types are explicit and strongly typed.
- [ ] Standard downstream error codes are centralized and reusable.
- [ ] No resolver/service file uses ad-hoc downstream error strings.
- [ ] Typecheck passes.

## Testing
- **Test file**: `test/integrations/legacy-books/errors.test.ts` (if needed)
- **Test cases**:
  - creates expected code/message pairs
  - preserves source cause/context metadata
  - classifies unknown failures as `DOWNSTREAM_UNEXPECTED`

## Notes
Keep this task code-only foundational; do not wire GraphQL schema/resolvers here.
