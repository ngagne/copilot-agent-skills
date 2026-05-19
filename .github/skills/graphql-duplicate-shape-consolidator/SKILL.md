---
name: graphql-duplicate-shape-consolidator
description: Detect and consolidate duplicate GraphQL object and input type shapes (same fields with same types) while defaulting to non-breaking changes. Use when asked to deduplicate GraphQL schema types, reduce repeated GraphQL type definitions, or consolidate duplicate schema shapes safely.
metadata:
  version: "1.0.0"
---

# GraphQL Duplicate Shape Consolidator

Use this skill when a user wants to reduce duplicate GraphQL schema shapes and keep schema maintenance easier over time.

## What this skill does

1. Finds duplicate GraphQL **object** and **input object** type shapes.
2. Consolidates safely when possible with code edits.
3. Defaults to **non-breaking** behavior and requires explicit approval for breaking merges.
4. Reports what was consolidated, what was skipped, and why.

## Scope and safety defaults

- Compare object types only with object types, and input object types only with input object types.
- Use exact-shape matching only:
  - same field names
  - same field types (including nullability and list nesting)
  - same field arguments for object fields
- Treat mismatched directives, deprecations, descriptions, implemented interfaces, or default values as **not exact** by default. Skip those groups unless the user asks otherwise.
- Never introduce breaking API changes unless the user explicitly opts in.

## Workflow

### 1) Confirm constraints

Before editing:

- Confirm the user still allows auto-consolidation edits.
- Confirm breaking policy (default: no breaking changes).
- Confirm whether to include both object and input object types (default: yes, separate groups).

### 2) Discover and parse schema files

- Locate GraphQL SDL files (commonly `**/*.graphql`, `**/*.gql`, or inline schema sources).
- Parse schema definitions and references.
- Build a normalized signature per type:
  - type kind (`object` or `input`)
  - sorted field signatures
  - canonicalized type strings

### 3) Detect duplicate groups

- Group types by `(kind, signature)`.
- Keep only groups with 2+ types.
- Exclude root operation types (`Query`, `Mutation`, `Subscription`) from consolidation targets.

### 4) Classify each group by risk

For each duplicate group, classify candidates:

- **Safe to auto-consolidate**:
  - type is not publicly reachable from root operations, or
  - merge can happen in internal-only schema modules where client contracts are unaffected
- **Potentially breaking**:
  - any rename/retype of publicly reachable output or input types

When policy is non-breaking, skip potentially breaking groups and report them.

### 5) Apply consolidations for safe groups

For each safe group:

1. Choose a canonical type name:
   - prefer most-referenced type
   - tie-break by existing usage stability (then lexical order)
2. Rewrite references from duplicate types to canonical type.
3. Remove duplicate definitions that become unreferenced.
4. Update related resolver/model mapping code if names changed internally.
5. Keep behavior unchanged.

### 6) Handle non-breaking-only mode for public duplicates

If a duplicate group is public and merging would break API contracts:

- Do not rewrite public type names.
- Instead consolidate shared implementation code where possible:
  - extract shared TypeScript/domain interfaces or mapper helpers
  - keep SDL contract stable
- Report explicit optional follow-up for user-approved breaking migration.

### 7) Validate and summarize

- Ensure schema still parses and all references resolve.
- Keep edits minimal and targeted.
- Provide a summary table:
  - duplicate group
  - canonical candidate
  - action (`merged`, `implementation-only`, `skipped`)
  - reason
  - breaking risk

## Output expectations

When this skill runs, the final response should include:

1. Files changed.
2. Consolidations performed.
3. Skipped duplicate groups with reasons.
4. Any groups requiring explicit breaking-change approval.

## Example user intents this skill should handle

- "Find duplicate GraphQL types with the same shape and consolidate them."
- "Reduce duplicate schema type definitions without breaking clients."
- "Detect repeated input types and merge safe duplicates."

## Guardrails

- Do not merge object types with input object types.
- Do not treat near matches as duplicates.
- Do not silently make breaking API changes.
- If no safe consolidations exist, return a clear no-op report with actionable next steps.

