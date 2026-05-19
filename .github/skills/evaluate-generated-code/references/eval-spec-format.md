# Evaluation Spec Format

This skill expects the user to provide a markdown file that describes what the generated code should satisfy, what should be ignored, and which files matter.

The spec should live wherever the user prefers, but the intended usage is to run the evaluation from the root of the project being checked.

## Recommended Structure

Use YAML frontmatter plus the sections below.

```md
---
title: Loop Orchestrator Evaluation
project_root: .
candidate_label: copilot-generated-loop
report_output: .generated-code-eval/loop-evaluation.report.html
results_output: .generated-code-eval/loop-evaluation.results.json
severity_weights:
  informational: 1
  low: 2
  medium: 4
  high: 7
  critical: 10
---

# Generated Code Evaluation Spec

## Scope
- Evaluate only the current project root.
- Favor the referenced files first.

## Expected File Structure
- loop.js
- test/
  - loop.test.ts
- .copilot-orchestrator/

Exceptions:
- `.copilot-orchestrator/` may be absent if persistence is intentionally disabled for a one-shot prototype.

## Global Exclusions
- Ignore formatting-only differences.
- Ignore lockfile churn unless dependency changes are part of the request.

## Expectations

### EXP-001 - Retry delay is bounded
Severity: high
Expectation:
Retry delay must be capped and must respect `Retry-After` when present.

Code references:
- loop.js

Ignore when:
- Retry logic was intentionally moved into another module with equivalent behavior.

Scoring guidance:
- 100: bounded backoff and Retry-After support are both present.
- 50: one exists but the other is missing or ambiguous.
- 0: neither behavior exists.

### EXP-002 - State is persisted safely
Severity: medium
Expectation:
State must be saved atomically so interrupted writes do not leave a partial state file.

Code references:
- loop.js
```

## Required Sections

### Frontmatter

Recommended keys:

- `title`: Report title.
- `project_root`: Root folder to evaluate. `.` is valid when the command is run from the project root.
- `candidate_label`: Short label for the generated code being audited.
- `report_output`: Optional HTML output path.
- `results_output`: Optional JSON output path.
- `severity_weights`: Optional override for weighted grading.

### Scope

Describe the review boundary. This helps avoid evaluating unrelated code.

### Expected File Structure

List the files and folders that are expected to exist. This section can be partial. It does not need to be a full tree dump.

If exceptions exist, add them immediately below as `Exceptions:` bullets.

### Global Exclusions

List things that should not count against the generated code. Examples:

- formatting-only changes
- generated snapshots
- docs updates that were out of scope
- dependency noise unrelated to the task

### Expectations

Each expectation should use this shape:

```md
### EXP-001 - Short title
Severity: high
Expectation:
Clear statement of what the code must do.

Code references:
- src/example.ts
- test/example.test.ts

Ignore when:
- Optional condition that makes this expectation not applicable.

Scoring guidance:
- 100: what full compliance looks like.
- 50: what partial compliance looks like.
- 0: what failure looks like.
```

## Severity Levels

Use one of:

- `informational`
- `low`
- `medium`
- `high`
- `critical`

## Writing Guidance

- Prefer behavior over implementation trivia.
- Add code references for the files a reviewer should inspect first.
- Use `Ignore when` only for genuine exceptions, not as a way to soften the rubric.
- Keep expectations distinct so each one can receive a meaningful 0-100 score.