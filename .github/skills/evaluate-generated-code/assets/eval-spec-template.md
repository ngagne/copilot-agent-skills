---
title: Generated Code Evaluation
project_root: .
candidate_label: generated-code
report_output: .generated-code-eval/generated-code.report.html
results_output: .generated-code-eval/generated-code.results.json
severity_weights:
  informational: 1
  low: 2
  medium: 4
  high: 7
  critical: 10
---

# Generated Code Evaluation Spec

## Scope
- Evaluate the generated code in the current project root.
- Start from the referenced files first, then expand only when needed.

## Expected File Structure
- src/
- test/
- README.md

Exceptions:
- `README.md` may be omitted if the task was explicitly code-only.

## Global Exclusions
- Ignore formatting-only changes.
- Ignore snapshot churn unless snapshot updates were part of the request.
- Ignore lockfile noise unless dependency changes were required.

## Expectations

### EXP-001 - Expected files are present
Severity: medium
Expectation:
The generated output must create or update the expected files required by the task.

Code references:
- src/
- test/

Ignore when:
- The task explicitly requested analysis only with no file changes.

Scoring guidance:
- 100: all expected files or equivalent replacements are present.
- 50: some required files are present, but key gaps remain.
- 0: required files are missing.

### EXP-002 - Behavior matches the requested change
Severity: high
Expectation:
The implementation must satisfy the intended behavior described in the task, not just create placeholder code.

Code references:
- src/
- test/

Scoring guidance:
- 100: behavior is implemented and testable.
- 50: behavior is partial or ambiguous.
- 0: behavior is missing or contradicted by the code.

### EXP-003 - Tests or verification support the change
Severity: medium
Expectation:
The generated code should include or update tests, checks, or other verification artifacts when the task called for them.

Code references:
- test/

Ignore when:
- The original request explicitly excluded tests.

Scoring guidance:
- 100: verification is present and aligned with the change.
- 50: verification exists but misses important scenarios.
- 0: no meaningful verification was added.