# Task 3: Service Layer with Timeout and Retries

**Depends on**: Task 1, Task 2
**Estimated complexity**: High
**Type**: Feature

## Objective
Implement `LegacyBooksService` that maps OpenAPI operations to methods, applies resiliency policy,
and returns normalized domain data with standardized errors.

## ⚠️ Important information
Before coding, Read FIRST -> Load [03-tasks-00-READBEFORE.md](03-tasks-00-READBEFORE.md)

## Files to Modify/Create
- `src/integrations/legacy-books/service.ts`
- `src/integrations/legacy-books/constants.ts` (optional)
- `test/integrations/legacy-books/service.test.ts`
- `test/integrations/legacy-books/__snapshots__/service.test.ts.snap` (if used)
- `.agents/changes/DEMO-123-book-listings-integration/PROGRESS.md`

## Detailed Steps
1. Update `PROGRESS.md` task 03 to `🔄 In Progress`.
2. Implement service methods:
   - `fetchBookByIsbn(isbn)` -> maps `GET /books/{isbn}`
   - `fetchStoreById(id)` -> maps `GET /stores/{id}`
3. Add HTTP utility with timeout (`3s`) and retry (`2`) using exponential backoff + jitter.
4. Retry only on retryable failures (network + 5xx).
5. Map 404 to `DOWNSTREAM_NOT_FOUND`; map timeout/availability/unexpected accordingly.
6. Ensure service returns normalized values via transformer layer.
7. Add tests with mocked `fetch` covering retry matrix and code mapping.
8. Run `npm run test -- service.test.ts` and `npm run typecheck`.
9. Update `PROGRESS.md` task 03 to `✅ Completed`.
10. Commit with `feat: implement task 03 - resilient legacy books service`.

## Acceptance Criteria
- [ ] Service covers both downstream operations in `openapi.yaml`.
- [ ] Timeout/retry behavior matches specification defaults.
- [ ] 404 and malformed payload paths map to standard codes.
- [ ] No test performs a real network call.

## Testing
- **Test file**: `test/integrations/legacy-books/service.test.ts`
- **Test cases**:
  - returns transformed book data on 200
  - retries network/5xx and stops after cap
  - does not retry 4xx
  - maps 404 to `DOWNSTREAM_NOT_FOUND`
  - maps timeout to `DOWNSTREAM_TIMEOUT`

## Notes
Keep HTTP orchestration and transform responsibilities separated to simplify future changes.
