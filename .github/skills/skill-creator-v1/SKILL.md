---
name: skill-creator-v1
description: Create new skills, update existing skills, and evaluate how well a skill actually works. Use this skill whenever the user wants to scope a skill before writing it, revise a skill safely, run or improve evals, compare a candidate skill against a baseline, or optimize a skill description for triggering accuracy. Keep the user and agent aligned with explicit scope confirmation before drafting or revising.
metadata: 
  version: 2.0.0
---

# Skill Creator

Create new skills and iteratively improve existing ones.

At a high level, the workflow is:

- understand the skill's scope and purpose
- draft or revise the skill
- create eval prompts
- run candidate and baseline evaluations
- review outputs qualitatively and quantitatively
- improve the skill based on evidence
- optimize description triggering
- deliver the final skill folder

The exact order can flex, but for any substantive change the full eval loop is the default. Only skip to a lighter qualitative path when the user explicitly opts out.

## Terminology

Use these terms consistently:

- **user**: the human requesting the skill work and approving scope changes
- **agent**: the model using this skill to create or update the target skill
- **runtime**: the environment the agent is currently operating in (for example GitHub Copilot, Claude Code, or another agent runtime)
- **skill**: the Claude-style skill artifact being created or updated (`SKILL.md` plus bundled files)
- **candidate**: the skill version currently being tested
- **baseline**: the comparison version for evals (`without_skill` for a new skill, or `old_skill`/another agreed baseline for an update)
- **expectations**: the machine-checked eval conditions recorded in JSON artifacts
- **scope contract**: the structured, conversational agreement between the user and the agent about what this skill is for and what is out of scope

## Communicating with the user

Match the user's vocabulary and technical depth. In the default case:

- "evaluation" and "benchmark" are usually fine
- "JSON" and "expectation" may need a short explanation unless the user is clearly comfortable with them

When the user uses vague or overloaded terms, propose a more precise canonical term before proceeding.

Bad: "What do you want the account flow to do?"

Better: "When you say `account`, do you mean the customer record or the user login? Those imply different skill behavior."

If the user describes current behavior for an existing skill, check the files before accepting the claim. If the code disagrees, surface the contradiction explicitly and resolve it before moving on.

## Start with scope, not drafting

Do not draft, revise, or run evals until the scope contract is complete and confirmed.

### Research before asking

If an answer is plausibly recoverable from the existing skill, scripts, evals, or artifacts, inspect those files first. Ask the user only when meaningful ambiguity remains after inspection.

### Interview one question at a time

During scoping, ask exactly one unresolved design question at a time. Each question must include:

1. **Decision** — what branch of the design tree is being resolved
2. **Recommended answer** — your best default
3. **Rationale** — a short explanation grounded in the files, downstream workflow, or eval consequences

Wait for the user's answer before asking the next unresolved question.

### Maintain a conversational scope contract

Treat the scope contract as a conversational artifact, not a required file. Update the contract as decisions land.

Use this structure:

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

After each answer, record the resolved decision in concise canonical form. At major checkpoints — and always before drafting or revising `SKILL.md` — present the full scope contract and ask the user to confirm it.

For updates, the scope contract must also capture:

- behavior that must be preserved
- behavior that may change
- unacceptable regressions

### Exit condition for the interview phase

Do not draft or revise the skill until:

- every required scope-contract field is filled, and
- every remaining `open_question` is either resolved or explicitly deferred with a stated risk or assumption accepted by the user

If later evidence or eval results contradict an accepted scope assumption, reopen the scope contract, surface the contradiction, update the affected fields, and get renewed confirmation before continuing.

## Figuring out where the user is in the workflow

The user might be:

- starting a skill from scratch
- updating an existing skill
- repairing a broken eval loop
- comparing a candidate skill against a baseline
- optimizing description triggering

Figure out the current stage, then help them move to the next stage without skipping scope alignment.

## Writing or revising the skill

Once the scope contract is accepted, write or revise the skill artifact.

### Capture intent in the skill description

The `description` field in `SKILL.md` frontmatter is the primary trigger surface for Claude-style skills. It should say:

- what the skill helps accomplish
- when the skill should be used
- which user intents and contexts it covers

Descriptions should be somewhat "pushy" about valid trigger cases so the skill does not undertrigger.

### Anatomy of a skill

```text
skill-name/
├── SKILL.md
│   ├── YAML frontmatter (name, description required)
│   └── Markdown instructions
└── Bundled Resources
    ├── scripts/    - executable helpers for deterministic or repetitive work
    ├── references/ - additional docs read only when needed
    └── assets/     - templates and supporting files
```

### Progressive disclosure

Skills have three layers:

1. **Metadata** — name + description
2. **SKILL.md body** — loaded when the skill triggers
3. **Bundled resources** — read or executed as needed

Keep `SKILL.md` reasonably lean. If it grows large, add hierarchy and tell the agent where to look next.

### Writing patterns

- Prefer imperative instructions.
- Explain *why* a step matters instead of relying on rigid command language when possible.
- Focus on user intent and durable patterns, not brittle copies of one example.
- If multiple runtimes matter, describe the capability first and add short runtime-specific mappings only where behavior differs materially.

Example:

```markdown
Run candidate and baseline evaluations in parallel when the runtime supports helper agents (for example Copilot task agents or Claude subagents). If the runtime cannot do that, run them serially but keep the same workspace layout and grading steps.
```

### Existing-skill updates

When updating an existing skill:

1. preserve the original name unless the user explicitly wants a rename
2. inspect the current files before proposing behavioral changes
3. capture preserved behavior, allowed changes, and unacceptable regressions in the scope contract
4. snapshot the original skill before making substantive changes if you will need a baseline comparison

## Test cases and eval design

Do not write eval prompts until the scope contract is confirmed.

After that, create 2-3 realistic prompts that reflect what a real user would actually say. Share them with the user before running them.

Save prompts to `evals/evals.json`. The file can start with prompts and expected outputs; add `expectations` once the eval shape is clear.

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

This section is one continuous sequence. Do not stop halfway through unless the user explicitly interrupts or opts out of the full eval loop.

Put results in `<skill-name>-workspace/` as a sibling to the skill directory. Within the workspace, organize by iteration (`iteration-1/`, `iteration-2/`, etc.). Each eval gets its own directory.

### Step 1: Run candidate and baseline together when possible

For each eval:

- run the **candidate** skill
- run the **baseline** in the same overall evaluation wave when the runtime supports parallel helper agents

Use the current on-disk names for compatibility:

- `with_skill/outputs/` for the candidate
- `without_skill/outputs/` for a new-skill baseline
- `old_skill/outputs/` for an update baseline when comparing against the previous skill version

If the runtime supports helper agents, launch candidate and baseline runs in the same turn. If it does not, run them serially but preserve the same directory layout and downstream grading flow.

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

Do not just wait for runs to finish. Draft quantitative expectations while work is in flight, then explain them to the user.

Good expectations:

- are objectively verifiable
- have descriptive names
- distinguish genuine success from surface-level compliance

If the skill is inherently subjective, keep the expectation list small and rely more heavily on human review.

Update `eval_metadata.json` and `evals/evals.json` with the expectations once drafted.

### Step 3: Capture timing data when the runtime provides it

If a helper-agent completion notification includes `total_tokens` and `duration_ms`, save that immediately to `timing.json` in the run directory. Some runtimes expose this metadata only at completion time.

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

If the runtime does not expose timing data, do not invent it. Leave timing absent rather than fabricating measurements.

### Step 4: Grade, aggregate, analyze, and launch the reviewer

Once the runs are complete:

1. **Grade each run** — use `agents/grader.md` to evaluate each expectation against the outputs. Save results to `grading.json`. The expectations array must use `text`, `passed`, and `evidence`.
2. **Aggregate into a benchmark** — run:
   ```bash
   python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
   ```
   Put each candidate configuration before its baseline counterpart.
3. **Do an analyst pass** — read the benchmark data and surface patterns aggregate stats hide. See `agents/analyzer.md`.
4. **Launch the reviewer** — use `eval-viewer/generate_review.py` rather than building custom HTML. Pass `--previous-workspace` on later iterations. Only launch it after the iteration's outputs, grading, and benchmark artifacts are fully written; do not send the user to a page while files are still being generated or embedded.
5. **Tell the user what to review** — outputs plus benchmark if present.

If the runtime has a browser and `webbrowser.open()` works, you can start the review server once generation is complete. In headless environments, use `--static <output_path>` so the user can open the finished HTML manually.

### What the user sees in the reviewer

The reviewer shows:

- the prompt
- the produced outputs
- prior outputs for comparison on later iterations
- formal grades when available
- a feedback box
- benchmark data when `benchmark.json` exists

### Step 5: Read the feedback

When the user finishes reviewing, read `feedback.json` and the user's direct response. If `feedback.json` is empty and the user says there is no feedback, nothing to change, looks good, or an equivalent acceptance, treat that as approval and stop iterating. Do not invent another improvement pass when the user has not provided a specific complaint. Only focus improvements on the test cases where the user gave concrete negative feedback.

Kill the review server when you're done with it.

## Improving the skill

This is the core loop. Use the evidence from outputs, transcripts, expectations, benchmarks, and user feedback to improve the skill.

### How to think about improvements

1. **Generalize from the feedback.** Do not overfit to the handful of eval prompts.
2. **Keep the prompt lean.** Remove instructions that waste effort or encourage unproductive work.
3. **Explain the why.** Better rationale usually beats rigid shouting.
4. **Look for repeated work across test cases.** If multiple runs reinvent the same helper script, bundle that helper into the skill.

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
- the feedback is effectively empty, including cases where the user explicitly says "no feedback" or otherwise indicates approval without specific complaints
- you are no longer making meaningful progress

## Blind comparison

For a more rigorous A/B comparison between two versions, use the blind comparison flow in `agents/comparator.md` and `agents/analyzer.md`.

This is optional and requires helper agents.

## Description optimization

Treat description optimization as a normal phase of the workflow, not a hidden extra. However, be explicit that the current automated trigger-eval backend is Claude-specific.

### Step 1: Generate trigger eval queries

Create roughly 20 realistic queries split between should-trigger and should-not-trigger cases.

The best queries are concrete, detailed, and close to what a real user would type. Favor edge cases and near-misses over trivial examples.

### Step 2: Review the query set with the user

Use `assets/eval_review.html` to let the user edit and export the eval set before you run optimization.

### Step 3: Run the optimization loop

Use:

```bash
python -m scripts.run_loop \
  --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-skill> \
  --model <model-id-powering-this-session> \
  --max-iterations 5 \
  --verbose
```

This automation currently depends on the Claude CLI backend (`claude -p`) via the bundled scripts. Run it when that backend is available in the current runtime. If it is not available, prepare the eval set and explain the backend requirement instead of pretending the automated trigger optimization ran.

`scripts.run_loop` may open a live auto-refreshing HTML report before the optimization loop finishes. Treat that page as internal progress only. Do not show it to the user until the loop exits and the final HTML has been written. Prefer `--results-dir <dir>` so you can hand off the completed `report.html`, or regenerate a final static report from `results.json` with `python -m scripts.generate_report <results.json> -o <report.html>` before sharing it.

### How trigger optimization works

The scripts split the eval set into train and held-out test queries, evaluate trigger behavior repeatedly, propose description improvements, and select the best description by held-out performance to avoid overfitting.

### Step 4: Apply the best description

Take `best_description` from the loop output, update the skill frontmatter, and show the user the before/after result and scores.

## Delivery

The default and only end state is the updated skill folder on disk. Treat that folder as the deliverable and stop there.

## Runtime notes

### Runtimes with helper agents

When the runtime supports helper agents, use them for:

- parallel candidate/baseline runs
- grading
- blind comparison
- benchmark analysis

### Runtimes without helper agents

If helper agents are unavailable:

- run candidate and baseline serially when possible
- keep the same workspace layout
- preserve grading, benchmark, and review artifacts wherever the runtime allows
- if true baseline comparison is impossible, be explicit about the limitation

### Headless runtimes

If the runtime cannot open a browser, use the static reviewer output instead of a live local server.

## Reference files

Read these when relevant:

- `agents/grader.md` — how to evaluate expectations against outputs
- `agents/comparator.md` — how to run blind A/B comparisons
- `agents/analyzer.md` — how to analyze benchmark or blind-comparison results
- `references/schemas.md` — JSON structures for eval artifacts

## Operational reminder

Track the major phases in whatever todo or task list your runtime provides so you do not skip scope confirmation, eval generation, reviewer launch, feedback collection, or final delivery of the skill folder.
