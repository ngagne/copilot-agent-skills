# Results JSON Format

Write the evaluation output to JSON before rendering the HTML report.

## Required Shape

```json
{
  "reportTitle": "Generated code evaluation",
  "candidateLabel": "agent-output",
  "projectRoot": "/absolute/path/to/project",
  "specPath": "/absolute/path/to/spec.md",
  "generatedAt": "2026-04-17T12:00:00.000Z",
  "severityWeights": {
    "informational": 1,
    "low": 2,
    "medium": 4,
    "high": 7,
    "critical": 10
  },
  "summary": {
    "notes": [
      "Optional caveat or assumption"
    ]
  },
  "expectations": [
    {
      "id": "EXP-001",
      "title": "Retry logic is bounded",
      "severity": "high",
      "score": 100,
      "status": "pass",
      "summary": "Bounded backoff and Retry-After handling are both present.",
      "rationale": "The implementation caps delay and honors retryAfterMs before sleeping.",
      "ignoreReason": null,
      "evidence": [
        {
          "path": "loop.js",
          "startLine": 386,
          "endLine": 397,
          "note": "The delay is the max of exponential backoff and Retry-After."
        }
      ],
      "relatedReferences": [
        "loop.js",
        "test/loop.test.ts"
      ]
    }
  ]
}
```

## Field Notes

### Top-level fields

- `reportTitle`: Human-readable title shown in the HTML report.
- `candidateLabel`: Short label for the generated code under review.
- `projectRoot`: Absolute path to the evaluated project root.
- `specPath`: Absolute path to the markdown spec used as the rubric.
- `generatedAt`: ISO timestamp.
- `severityWeights`: Weight map used for the overall score.
- `summary.notes`: Optional assumptions, caveats, or scope notes.

### Expectation fields

- `id`: Unique expectation identifier from the spec.
- `title`: Short title from the spec.
- `severity`: One of `informational`, `low`, `medium`, `high`, `critical`.
- `score`: Integer from 0 to 100.
- `status`: `pass`, `partial`, `fail`, or `ignored`.
- `summary`: One-line result.
- `rationale`: Short explanation grounded in code evidence.
- `ignoreReason`: Required when `status` is `ignored`, otherwise `null`.
- `evidence`: Array of concrete supporting references.
- `relatedReferences`: Optional list of spec references or nearby files worth inspecting.

### Evidence item fields

- `path`: Path relative to the project root.
- `startLine`: Optional 1-based start line.
- `endLine`: Optional 1-based end line.
- `note`: Short explanation of what the evidence shows.

## Default Severity Weights

Use these unless the spec overrides them:

```json
{
  "informational": 1,
  "low": 2,
  "medium": 4,
  "high": 7,
  "critical": 10
}
```

## Weighted Overall Grade

The renderer computes the overall grade from non-ignored expectations only:

$$
\text{overall} = \frac{\sum (\text{score}_i \times \text{weight}_i)}{\sum \text{weight}_i}
$$

Ignored findings remain visible in the report but contribute no weight.