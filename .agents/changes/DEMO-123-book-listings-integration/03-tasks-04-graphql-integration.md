# Task 4: GraphQL Schema and Resolver Integration

**Depends on**: Task 2, Task 3
**Estimated complexity**: High
**Type**: Feature

## Objective
Expose the downstream integration through GraphQL `Book` fields by adding `isbn` and non-null
`listings`, including store object resolution with request-scoped dedupe behavior.

## ⚠️ Important information
Before coding, Read FIRST -> Load [03-tasks-00-READBEFORE.md](03-tasks-00-READBEFORE.md)

## Files to Modify/Create
- `src/schemas/schema.graphql`
- `src/resolvers.ts`
- `src/server.ts` (if resolver context wiring is required)
- `.agents/changes/DEMO-123-book-listings-integration/PROGRESS.md`

## Detailed Steps
1. Update `PROGRESS.md` task 04 to `🔄 In Progress`.
2. Extend `Book` SDL with `isbn: String!` and `listings: [BookListing!]!`.
3. Add SDL types for `BookListing` and `Store` with agreed nullability.
4. Update in-memory `books` data to include stable `isbn` values.
5. Implement `Book.listings` resolver using injected `LegacyBooksService`.
6. Add request-scoped store lookup cache/batch map to avoid repeated store requests.
7. Implement 404/missing store handling to return empty `listings` array per specification.
8. Run `npm run typecheck` and targeted resolver tests.
9. Update `PROGRESS.md` task 04 to `✅ Completed`.
10. Commit with `feat: implement task 04 - graphql listings exposure`.

## Acceptance Criteria
- [ ] GraphQL schema exposes additive `isbn` + `listings` fields.
- [ ] Existing queries/mutations remain compatible.
- [ ] `Book.listings` always resolves to non-null array.
- [ ] Repeated store IDs in one request do not trigger duplicate service calls.

## Testing
- **Test file**: `test/resolvers.test.ts`
- **Test cases**:
  - book resolver returns listings when service returns data
  - missing downstream/store paths return `[]`
  - request-scoped dedupe minimizes repeated store fetches
  - error mapping to GraphQL shape is stable

## Notes
Avoid exposing downstream DTO fields directly; only expose normalized domain shape.
