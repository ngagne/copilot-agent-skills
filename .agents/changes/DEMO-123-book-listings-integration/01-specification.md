# Specification: Book Listings Downstream Integration

- **JIRA**: DEMO-123
- **Status**: Draft for review
- **Date**: 2026-03-01

## Overview
This change introduces a read-only integration from the GraphQL API to a legacy downstream HTTP
system described in `openapi.yaml`. The integration must enrich existing `Book` records with
listing data sourced by ISBN, while preserving current GraphQL behavior for unrelated fields.

The downstream contract is inconsistent and loosely typed, so the integration must normalize data
at the boundary. Transformations must produce strongly typed domain values with strict validation,
including ISO datetime normalization, yes/no mapping to booleans, and numeric parsing of decimal
price values.

The GraphQL contract will expose the new capability through `Book` fields rather than mirroring
downstream endpoints. The implementation must provide predictable, standardized error semantics,
resilient downstream communication (timeouts and retries), and complete Jest coverage with mocks
and fixtures only.

## Functional Requirements
### Core Functionality
- Add a dedicated `isbn` field to the GraphQL `Book` type and backing data model.
- Enrich `Book` with a new non-null `listings` field resolved through the downstream integration.
- Resolve listings by matching internal book records to downstream `/books/{isbn}` using `Book.isbn`.
- Include store information on each listing, sourced from downstream `/stores/{id}`.
- Convert downstream payload fields into domain-appropriate types:
  - `created_at` (`MM/DD/YYYY HH:mm:ss`) -> strict ISO datetime string.
  - `isInStock` / `active` (`yes`/`no`) -> boolean; invalid values -> `null`.
  - Numeric string fields (including price) -> `number` with decimal support.
- Keep existing queries and mutations available; extend behavior rather than replacing API surface.

### Edge Cases
- Downstream 404 for a known ISBN returns `null` at the downstream-book lookup layer and results in
  an empty/non-error listing outcome at `Book.listings` resolution where applicable.
- Missing or malformed downstream fields fail validation and map to standardized downstream
  validation errors rather than leaking raw parsing exceptions.
- Missing store records for listing store IDs result in an empty `listings` array outcome for that
  parent book resolution, without crashing overall book resolution.
- Retry behavior is limited to retryable failures (network errors and 5xx responses only).

## Non-Functional Requirements
- **Performance**:
  - Downstream requests use bounded timeout (`3s` default).
  - Retry policy defaults to `maxRetries=2` with exponential backoff and jitter.
  - Retry is disabled for client errors (4xx).
- **Security**:
  - Treat downstream payloads as untrusted input.
  - Do not expose raw downstream internals in GraphQL responses.
- **Compatibility**:
  - Existing GraphQL operations remain backward compatible.
  - New fields are additive to schema and data model.
- **Maintainability**:
  - Encapsulate downstream IO in a dedicated service layer.
  - Centralize transform/validation logic in typed mappers.
  - Centralize downstream error taxonomy and mapping rules.
  - Include request-scoped store caching/batching to avoid duplicate store fetches for repeated
    `storeID` values within the same GraphQL request.

## Integration Points
- `openapi.yaml`: Source of truth for downstream operations and payload shapes.
- `src/integrations/legacy-books/*`: Service, transform, types, and error model modules.
- `src/schemas/schema.graphql`: Additive `Book`/listing/store schema exposure.
- `src/resolvers.ts`: `Book.listings` and related resolver wiring with clean error propagation.
- `test/*.test.ts`: Unit coverage for transforms, service behavior, and resolver integration points.

## Constraints and Assumptions
### Constraints
- Planning and artifact generation are limited to files under `.agents/*` for this phase.
- No real downstream HTTP calls in automated tests.
- Resolver tests must follow current unit-style resolver invocation pattern.

### Assumptions
- Downstream API remains read-only and aligned with the provided OpenAPI document.
- Internal book records can be updated to include stable ISBN values.
- Valid downstream data is expected on happy paths, but validation paths remain required.

## Out of Scope
- Introducing new GraphQL operations that directly mirror downstream OpenAPI endpoints.
- Creating write/update/delete integrations against downstream systems.
- UI/client-side updates beyond GraphQL contract exposure.
- Infrastructure-level resiliency components beyond service-level timeout/retry policy.

## Success Criteria
- `Book` includes a dedicated `isbn` field and non-null `listings` exposure in GraphQL.
- Listings include store object data derived from downstream store lookups.
- Store lookup misses (`404`) do not throw at the GraphQL boundary and yield an empty `listings`
  array for the relevant parent book response path.
- Repeated store lookups within a single resolver request path are deduplicated via request-scoped
  caching/batching behavior.
- Transform layer enforces strict parsing and typed normalization for all targeted fields.
- Standardized downstream error model is used consistently across service and resolvers.
- Jest coverage includes:
  - transform unit tests (with snapshots),
  - service tests (mocked HTTP),
  - resolver tests (mocked service, unit style),
  - local contract fixture tests (happy + malformed payloads).
- No tests perform real network calls.

## Open Questions
- None at specification level.
