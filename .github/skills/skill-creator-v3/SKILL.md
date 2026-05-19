---
name: skill-creator-v3
description: Create, revise, and evaluate skills. Use this skill to scope before drafting, update a skill safely, run or improve evals, compare a candidate against a baseline, or optimize description triggering. Confirm scope explicitly before drafting or revising.
metadata:
  version: "3.0.0"
---

# Skill Creator

Create new skills and iteratively improve existing ones.

Typical flow: scope the skill, draft or revise it, create eval prompts, run candidate and baseline evals, review outputs qualitatively and quantitatively, improve from evidence, optimize description triggering, and deliver the final skill folder. Order can flex, but for substantive changes the full eval loop is the default. Use a lighter qualitative path only if the user explicitly opts out.

## Terminology

Use these terms consistently:

- **user** - the human requesting the skill work and approving scope changes
- **agent** - the model using this skill to create or update the target skill
- **runtime** - the environment the agent is operating in, such as GitHub Copilot or Claude Code
- **skill** - the Agent Skill artifact being created or updated: `SKILL.md` plus bundled files
- **candidate** - the skill version currently being tested
- **baseline** - the comparison version for evals: `without_skill` for a new skill, or `old_skill` or another agreed baseline for an update
- **expectations** - machine-checked eval conditions stored in JSON artifacts
- **scope contract** - the structured conversational agreement about what the skill is for and what it excludes

## Communicating with the user

Match the user's vocabulary and technical depth. "Evaluation" and "benchmark" are usually fine; briefly explain "JSON" and "expectation" unless the user clearly does not need it.

When the user uses vague or overloaded terms, first restate them in more precise canonical language. Example: instead of asking what an "account flow" should do, ask whether `account` means the customer record or the user login, since those imply different skill behavior.

If the user describes current behavior for an existing skill, inspect the files before accepting the claim. If the code disagrees, surface the contradiction and resolve it before moving on.

## Start with scope, not drafting

Do not draft, revise, or run evals until the scope contract is complete and confirmed.

### Research before asking

If the answer is plausibly recoverable from the existing skill, scripts, evals, or artifacts, inspect those first. Ask the user only when meaningful ambiguity remains.

### Interview one question at a time

During scoping, ask exactly one unresolved design question at a time. Each question must include:

1. **Decision** - which branch of the design tree is being resolved
2. **Recommended answer** - your best default
3. **Rationale** - a short explanation grounded in the files, downstream workflow, or eval consequences

Wait for the user's answer before asking the next unresolved question.

### Maintain a conversational scope contract

Treat the scope contract as a conversational artifact, not a required file. Track:

- `goal`
- `problem_statement`
- `in_scope`
- `out_of_scope`
- `primary_user_prompts`
- `expected_outputs`
- `authoring_runtime`
- `eval_backend`
- `success_criteria`
- `open_questions`
- `decision_log`

After each answer, record the resolved decision in concise canonical form. At major checkpoints, and always before drafting or revising `SKILL.md`, present the full scope contract and ask the user to confirm it.

For updates, also capture:

- behavior that must be preserved
- behavior that may change
- unacceptable regressions

### Exit condition for the interview phase

Do not draft or revise the skill until every required scope-contract field is filled and every remaining `open_question` is either resolved or explicitly deferred with a stated risk or assumption the user accepts.

If later evidence or eval results contradict an accepted scope assumption, reopen the scope contract, surface the contradiction, update the affected fields, and get renewed confirmation before continuing.

## Figuring out where the user is in the workflow

The user may be starting a skill, updating one, repairing a broken eval loop, comparing a candidate against a baseline, or optimizing description triggering. Identify the current stage, then move them to the next one without skipping scope alignment.

## Writing or revising the skill

Once the scope contract is accepted, write or revise the skill artifact.

### Capture intent in the skill description

The `description` field in `SKILL.md` frontmatter is the primary trigger surface for Agent Skills. It should say what the skill helps accomplish, when to use it, and which user intents and contexts it covers. Be somewhat "pushy" about valid trigger cases so the skill does not undertrigger.

### Directory structure and frontmatter must match the spec

```text
skill-name/
├── SKILL.md      # required: YAML frontmatter + Markdown instructions
├── scripts/      # optional: executable helpers
├── references/   # optional: docs loaded on demand
├── assets/       # optional: templates and static resources
└── ...
```

`SKILL.md` must start with YAML frontmatter followed by a Markdown body. Start from the Agent Skills spec, then apply these stricter repository rules:

- required: `name`, `description`, `metadata.version`
- allowed top-level keys: `name`, `description`, `metadata`
- no extra top-level frontmatter keys
- `name` must be 1-64 characters, use lowercase letters, numbers, and single hyphens only, avoid leading, trailing, or consecutive hyphens, and exactly match the parent directory name
- `description` must be 1-1024 characters and describe both what the skill does and when to use it
- do not use `license`, `compatibility`, or `allowed-tools`
- `metadata` must be a string-to-string mapping and include a `version` string
- for a brand-new skill, initialize `metadata.version` to `"1.0.0"`
- for updates, bump `metadata.version` with semver: patch for fixes, wording improvements, and behavior-preserving clarifications; minor for backward-compatible capability additions or meaningful workflow expansions; major for intentionally breaking or significantly narrowing behavior

Default to this minimal frontmatter:

```yaml
---
name: example-skill
description: Explain what the skill does and when to use it.
metadata:
  version: "1.0.0"
---
```

The Markdown body has no fixed schema, but it should contain the instructions the agent actually needs, usually step-by-step guidance, concrete examples, and important edge cases.

### Progressive disclosure

Skills have three layers:

1. **Metadata** - name and description
2. **SKILL.md body** - loaded when the skill triggers
3. **Bundled resources** - read or executed as needed

Keep `SKILL.md` under 500 lines and preferably under 5000 tokens. If it grows too large, move detail into focused files under `references/`, `scripts/`, or `assets/`, and tell the agent exactly when to load them. Use relative paths from the skill root and keep references shallow when possible, ideally one level down from `SKILL.md`.

### Validation is mandatory

Before delivering a skill:

1. run `python scripts/quick_validate.py <skill-dir>` to enforce this repo's frontmatter contract
2. fix every violation before continuing

A passing eval loop or a good qualitative review is not enough if the skill still violates the local validator.

### Writing patterns

- Prefer imperative instructions.
- Explain why a step matters instead of relying on rigid command language when possible.
- Focus on user intent and durable patterns, not brittle copies of one example.
- If multiple runtimes matter, describe the capability first and add short runtime-specific mappings only where behavior differs materially.

Example: "Run candidate and baseline evaluations in parallel when the runtime supports helper agents. Otherwise run them serially, but keep the workspace layout and grading steps the same."

### Existing-skill updates

When updating an existing skill:

1. preserve the original name unless the user explicitly wants a rename
2. if the skill is renamed, rename the parent directory so it exactly matches the new `name`
3. inspect the current files before proposing behavioral changes
4. capture preserved behavior, allowed changes, and unacceptable regressions in the scope contract
5. snapshot the original skill before substantive changes if you will need a baseline comparison

## Test cases and eval design

Do not write eval prompts until the scope contract is confirmed.

After that, create 2-3 realistic prompts that sound like what a real user would say. Share them with the user before running them.

Save prompts to `evals/evals.json`. Start with prompts and expected outputs; add `expectations` once the eval shape is clear.

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "User's task prompt",
      "expected_output": "Description of the expected result",
      "files": [],
      "expectations": []
    }
  ]
}
```

See `references/schemas.md` for the full schemas.

## Running and evaluating test cases

Treat this as one continuous sequence. Do not stop halfway through unless the user explicitly interrupts or opts out of the full eval loop.

Put results in `<skill-name>-workspace/` beside the skill directory. Inside it, organize by iteration (`iteration-1/`, `iteration-2/`, and so on). Each eval gets its own directory.

### Step 1: Run candidate and baseline together when possible

For each eval, run the **candidate** skill and, when the runtime supports parallel helper agents, run the **baseline** in the same evaluation wave.

Use these on-disk names for compatibility:

- `with_skill/outputs/` for the candidate
- `without_skill/outputs/` for a new-skill baseline
- `old_skill/outputs/` for an update baseline against the previous skill version

If helper agents are unavailable, run candidate and baseline serially but preserve the same directory layout and downstream grading flow.

Write an `eval_metadata.json` for each eval. Use a descriptive eval name instead of only `eval-0`, `eval-1`, and so on.

```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name-here",
  "prompt": "The user's task prompt",
  "expectations": []
}
```

### Step 2: Draft expectations while runs are in progress

Do not wait idly for runs to finish. Draft quantitative expectations while work is in flight, then explain them to the user.

Good expectations:

- are objectively verifiable
- have descriptive names
- distinguish genuine success from surface-level compliance

If the skill is inherently subjective, keep the expectation list short and rely more on human review.

Update `eval_metadata.json` and `evals/evals.json` once the expectations are drafted.

### Step 3: Capture timing data when available

If a helper-agent completion notification includes `total_tokens` and `duration_ms`, save them immediately to `timing.json` in the run directory. Some runtimes expose this only at completion time.

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

If the runtime does not expose timing data, leave timing absent rather than inventing it.

### Step 4: Grade, aggregate, analyze, and launch the reviewer

Once the runs finish:

1. **Grade each run** with `agents/grader.md` and save results to `grading.json`. Each expectation must use `text`, `passed`, and `evidence`.
2. **Aggregate into a benchmark** with `python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>`. List each candidate configuration before its baseline counterpart.
3. **Do an analyst pass** by reading the benchmark data and surfacing patterns aggregate stats hide. See `agents/analyzer.md`.
4. **Launch the reviewer** with `eval-viewer/generate_review.py` instead of custom HTML. Pass `--previous-workspace` on later iterations. Launch it only after the iteration's outputs, grading, and benchmark artifacts are fully written.
5. **Tell the user what to review** - outputs plus benchmark, if present.

If the runtime has a browser and `webbrowser.open()` works, start the review server once generation finishes. In headless environments, use `--static <output_path>` so the user can open the finished HTML manually.

### What the user sees in the reviewer

The reviewer shows the prompt, produced outputs, prior outputs for comparison on later iterations, formal grades when available, a feedback box, and benchmark data when `benchmark.json` exists.

### Step 5: Read the feedback

When review is done, read `feedback.json` and the user's direct response. If `feedback.json` is empty and the user says there is no feedback, nothing to change, looks good, or equivalent acceptance, treat that as approval and stop iterating. Do not invent another improvement pass without a specific complaint. Focus changes only on test cases with concrete negative feedback.

Kill the review server when finished.

## Improving the skill

This is the core loop. Use outputs, transcripts, expectations, benchmarks, and user feedback to improve the skill.

### How to think about improvements

1. **Generalize from the feedback.** Do not overfit to the small eval set.
2. **Keep the prompt lean.** Remove instructions that waste effort or encourage unproductive work.
3. **Explain the why.** Better rationale usually beats rigid shouting.
4. **Look for repeated work across test cases.** If multiple runs reinvent the same helper script, bundle it into the skill.

### Iteration loop

After improving the skill:

1. apply the improvement
2. rerun the eval set into a new iteration directory
3. compare candidate vs baseline again
4. relaunch the reviewer, with previous workspace if available
5. collect feedback
6. improve again only if the user gave specific feedback that justifies another pass

Stop when:

- the user says they are happy
- feedback is effectively empty, including explicit "no feedback" or equivalent approval without specific complaints
- you are no longer making meaningful progress

## Blind comparison

For a stricter A/B comparison between two versions, use the blind comparison flow in `agents/comparator.md` and `agents/analyzer.md`. This is optional and requires helper agents.

## Description optimization

Treat description optimization as a normal phase. Do it directly in the current runtime with helper agents; do not rely on bundled Python automation for this flow.

### Step 1: Generate trigger eval queries

Create about 20 realistic queries split between should-trigger and should-not-trigger cases. Favor concrete, detailed prompts and near-misses over trivial examples.

### Step 2: Review the query set with the user

Use `assets/eval_review.html` so the user can edit and export the eval set before optimization runs.

### Step 3: Run the optimization loop

Run the loop directly with helper agents in the active runtime:

1. split the eval set into train and held-out test queries, stratified between should-trigger and should-not-trigger cases
2. use one helper agent to propose a new description from the current description, the skill content, the train failures, and prior attempts
3. do **not** show held-out test results to the helper agent proposing the next description
4. use helper agents to evaluate the current description against the query set by checking whether the runtime actually invokes the skill for each query
5. run multiple trials for noisy queries when needed so you can measure trigger rate instead of trusting a single run
6. record the per-iteration train and test results in workspace artifacts so you can compare iterations and explain your choice to the user
7. repeat until you hit the user-approved stopping point or stop making meaningful progress

If the runtime cannot spawn helper agents, explain that the automated trigger-optimization loop is unavailable there and fall back to a manual qualitative description pass instead of pretending you ran the full optimization.

### How trigger optimization works

The optimization loop should split the eval set into train and held-out test queries, evaluate trigger behavior repeatedly, propose description improvements from the train failures only, and select the best description by held-out performance to avoid overfitting.

### Step 4: Apply the best description

Take `best_description` from the loop output, update the skill frontmatter, and show the user the before/after description and scores.

## Delivery

The default and only end state is the updated skill folder on disk. Treat that folder as the deliverable and stop there.

## Runtime notes

### Runtimes with helper agents

When helper agents are available, use them for parallel candidate/baseline runs, grading, blind comparison, benchmark analysis, and trigger-description optimization.

### Runtimes without helper agents

If helper agents are unavailable:

- run candidate and baseline serially when possible
- keep the same workspace layout
- preserve grading, benchmark, and review artifacts wherever the runtime allows
- do manual description optimization instead of claiming you ran the full trigger loop
- if true baseline comparison is impossible, say so explicitly

### Headless runtimes

If the runtime cannot open a browser, use the static reviewer output instead of a live local server.

## Reference files

Read these only when relevant:

- `agents/grader.md` - how to evaluate expectations against outputs
- `agents/comparator.md` - how to run blind A/B comparisons
- `agents/analyzer.md` - how to analyze benchmark or blind-comparison results
- `references/schemas.md` - JSON structures for eval artifacts

## Operational reminder

Track major phases in the runtime's todo or task system so you do not skip scope confirmation, eval generation, reviewer launch, feedback collection, or final delivery.
