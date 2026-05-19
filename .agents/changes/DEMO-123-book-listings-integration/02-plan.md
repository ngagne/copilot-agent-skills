# Implementation Plan: Book Listings Downstream Integration

- **JIRA**: DEMO-123
- **Status**: Draft
- **Date**: 2026-03-01
- **Depends on**: [01-specification.md](01-specification.md)

## Overview
Implement a new legacy-books integration layer that fetches downstream book and store data by ISBN,
normalizes downstream payloads into strict domain types, and exposes listings through the existing
GraphQL `Book` type. The technical approach separates concerns into service I/O, transformation,
error taxonomy, and resolver wiring to keep failures isolated and testable.

The resolver contract remains unit-testable and deterministic by injecting dependencies and mocking
all downstream I/O in tests. Request-scoped caching/batching is used during listing resolution to
avoid duplicate store lookups when multiple listings reference the same store ID.

## Architecture Changes
- Add `src/integrations/legacy-books/` module set:
  - `types.ts` for downstream DTOs and normalized domain types.
  - `errors.ts` for standardized downstream error taxonomy and helper constructors.
  - `transformers.ts` for strict, defensive normalization/parsing.
  - `service.ts` for downstream HTTP orchestration with timeout/retry and OpenAPI operation mapping.
- Extend GraphQL schema:
  - Add `Book.isbn: String!`.
  - Add non-null `Book.listings: [BookListing!]!`.
  - Add `BookListing` and `Store` types with correct nullability.
- Update resolver wiring:
  - `Book.listings` resolver uses `Book.isbn` and service methods.
  - Request-scoped store cache/batch map in resolver context to deduplicate store calls.
  - Error mapping keeps GraphQL output stable (`[]` on store 404 path; null/empty as specified).
- Expand Jest test structure with fixture-driven contract coverage and snapshots.

## Implementation Steps
### Step 1: Integration Contracts and Error Model
**Files to modify/create**:
- `src/integrations/legacy-books/types.ts` - downstream DTO + domain types
- `src/integrations/legacy-books/errors.ts` - error codes/classes + mapping utilities
- `src/integrations/legacy-books/index.ts` - integration exports (optional barrel)

**Technical approach**:
Define OpenAPI-aligned payload types for `BookResponse`, `ListingResponse`, and `StoreResponse`, then
separate normalized domain entities consumed by resolvers. Implement a standard error envelope with
codes: `DOWNSTREAM_NOT_FOUND`, `DOWNSTREAM_TIMEOUT`, `DOWNSTREAM_UNAVAILABLE`,
`DOWNSTREAM_INVALID_PAYLOAD`, `DOWNSTREAM_UNEXPECTED`.

**Dependencies**: None.

### Step 2: Transformation and Validation Layer
**Files to modify/create**:
- `src/integrations/legacy-books/transformers.ts` - mapping + defensive parsing
- `src/integrations/legacy-books/types.ts` - any refinement from parser results
- `test/integrations/legacy-books/fixtures/*.json` - contract fixtures

**Technical approach**:
Implement pure transformer functions that parse strict datetime (`MM/DD/YYYY HH:mm:ss` -> ISO),
convert yes/no to boolean|null, and numeric strings to numbers (decimals supported). Validate required
fields and emit `DOWNSTREAM_INVALID_PAYLOAD` for malformed shapes.

**Dependencies**: Step 1.

### Step 3: Downstream Service with Resiliency
**Files to modify/create**:
- `src/integrations/legacy-books/service.ts` - HTTP calls, retries, timeout, error mapping
- `src/integrations/legacy-books/constants.ts` - base URL/timeouts/retry defaults (optional)

**Technical approach**:
Build `LegacyBooksService` methods mapped to OpenAPI operations:
- `fetchBookByIsbn(isbn)` from `GET /books/{isbn}`
- `fetchStoreById(id)` from `GET /stores/{id}`
Service applies timeout (3s), maxRetries=2, exponential backoff with jitter, retries only for
network/5xx failures, and standardized error mapping.

**Dependencies**: Step 1, Step 2.

### Step 4: GraphQL Schema, Data, and Resolver Integration
**Files to modify/create**:
- `src/schemas/schema.graphql` - add `isbn`, `Book.listings`, `BookListing`, `Store`
- `src/resolvers.ts` - add isbn to in-memory books; implement `Book.listings`
- `src/server.ts` (if needed) - context wiring for request-scoped cache and service injection

**Technical approach**:
Extend in-memory book data with `isbn`, keeping existing API compatibility. Add `Book.listings`
resolver that fetches book payload by ISBN, transforms listings, resolves stores through
request-scoped dedupe cache, and returns non-null `[]` fallback per specification for 404/miss
paths where required.

**Dependencies**: Step 2, Step 3.

### Step 5: Test Implementation (Unit + Snapshot + Mocked Service/Resolvers)
**Files to modify/create**:
- `test/integrations/legacy-books/transformers.test.ts`
- `test/integrations/legacy-books/service.test.ts`
- `test/resolvers.test.ts` (extend existing suite)
- `test/integrations/legacy-books/fixtures/*.json`
- `test/integrations/legacy-books/__snapshots__/*.snap`

**Technical approach**:
Create deterministic tests with mocked fetch/service dependencies only (no network). Add snapshot
coverage for transformed payloads and resolver/error shapes, plus explicit assertions for retry,
timeout, 404/null semantics, invalid payload handling, and request-scoped store dedupe behavior.

**Dependencies**: Step 4.

### Step 6: Finalization and Delivery Artifacts
**Files to modify/create**:
- `.agents/changes/DEMO-123-book-listings-integration/04-commit-msg.md`
- `.agents/changes/DEMO-123-book-listings-integration/05-gitlab-mr.md`

**Technical approach**:
Produce final user-impact commit message and MR description templates aligned with implemented
behavior and examples.

**Dependencies**: Step 5.

## Testing Strategy
- **Unit tests**:
  - Transformer parsing/mapping for valid + malformed inputs.
  - Error mapping helpers and classification utilities.
- **Integration tests**:
  - Service tests with mocked HTTP and retry/timeout simulation.
  - Resolver tests with mocked service and request-scoped cache behavior.
- **Manual testing**:
  - Query `books { id isbn listings { ... } }` against local server.
  - Verify stable behavior for downstream missing/404 and malformed fixture scenarios.

## Risks and Mitigations
- **Risk**: Date parsing ambiguity for non-ISO input.
  **Mitigation**: Strict parser with explicit format guard and invalid payload errors.
- **Risk**: Retry behavior causing long tail latency.
  **Mitigation**: Bounded timeout, fixed retry cap, retry only on retryable classes.
- **Risk**: Resolver-level N+1 store requests.
  **Mitigation**: Request-scoped store cache/batch map.
- **Risk**: GraphQL contract drift from resolver implementation.
  **Mitigation**: Schema-resolver parity tests and resolver snapshot tests.

## Rollout Considerations
- Additive GraphQL schema changes only; existing operations remain available.
- No feature flag required for this demo environment.
- Backward compatibility preserved for existing clients that do not request new fields.
- Monitor downstream error rates and timeout frequency post-deploy.
