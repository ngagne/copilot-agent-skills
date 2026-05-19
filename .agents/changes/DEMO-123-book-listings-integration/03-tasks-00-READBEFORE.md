# Task Boot Context (Read Before Any Task)

- **JIRA**: DEMO-123
- **Change Folder**: `.agents/changes/DEMO-123-book-listings-integration/`
- **Date**: 2026-03-01
- **Status**: Active

## Required Reading Order
1. `00.jira-request.txt`
2. `01-specification.md`
3. `02-plan.md`
4. This file
5. The specific `03-tasks-XX-*.md` assigned to you

## Goal Summary
Implement a read-only legacy downstream integration that enriches GraphQL `Book` records with
non-null `listings` resolved by `Book.isbn`, including store details and strict payload
normalization.

## Non-Negotiable Constraints
- Do not perform real downstream HTTP calls in tests.
- Keep resolver tests unit-style with mocked dependencies.
- Maintain backward compatibility for existing GraphQL operations.
- Use standardized downstream error taxonomy.
- Implement request-scoped store caching/batching in initial version.

## Standard Error Codes
- `DOWNSTREAM_NOT_FOUND`
- `DOWNSTREAM_TIMEOUT`
- `DOWNSTREAM_UNAVAILABLE`
- `DOWNSTREAM_INVALID_PAYLOAD`
- `DOWNSTREAM_UNEXPECTED`

## Required Behaviors
- Add `Book.isbn: String!`.
- Add `Book.listings: [BookListing!]!` (non-null; return `[]` when appropriate).
- Include listing store object.
- Parse `created_at` strictly to ISO datetime.
- Parse `yes`/`no` to boolean; invalid values -> `null`.
- Parse numeric strings (including decimals like price) to `number`.
- Timeout `3s`, retries `2`, exponential backoff + jitter, retry only network/5xx.

## Working Agreements For Coding Agent
- Update `PROGRESS.md` before and after each task.
- Keep changes scoped to task objective.
- Add/adjust tests in same task.
- Run `npm run typecheck`, `npm run lint`, and `npm run test` before closing tasks touching code.

## Tracking File
Use `PROGRESS.md` in this folder for status tracking.
