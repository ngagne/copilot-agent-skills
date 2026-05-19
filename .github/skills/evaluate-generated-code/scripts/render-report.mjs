#!/usr/bin/env node

import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { pathToFileURL } from "url";

const DEFAULT_WEIGHTS = {
  informational: 1,
  low: 2,
  medium: 4,
  high: 7,
  critical: 10,
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "informational"];

function parseArgs(argv) {
  const args = {
    open: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    switch (value) {
      case "--input":
      case "-i":
        args.input = argv[index + 1];
        index += 1;
        break;
      case "--output":
      case "-o":
        args.output = argv[index + 1];
        index += 1;
        break;
      case "--open":
        args.open = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${value}`);
    }
  }

  return args;
}

function printUsage() {
  console.log(`Usage:\n  node render-report.mjs --input <results.json> [--output <report.html>] [--open]`);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeExpectations(results) {
  return (results.expectations ?? []).map((expectation) => {
    const severity = String(expectation.severity ?? "medium").toLowerCase();
    const score = Number(expectation.score ?? 0);
    const status = expectation.status ?? inferStatus(score, expectation.ignoreReason);
    return {
      ...expectation,
      severity,
      score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
      status,
      evidence: Array.isArray(expectation.evidence) ? expectation.evidence : [],
      relatedReferences: Array.isArray(expectation.relatedReferences)
        ? expectation.relatedReferences
        : [],
    };
  });
}

function inferStatus(score, ignoreReason) {
  if (ignoreReason) {
    return "ignored";
  }
  if (score >= 90) {
    return "pass";
  }
  if (score >= 40) {
    return "partial";
  }
  return "fail";
}

function computeSummary(expectations, severityWeights) {
  let weightedScoreSum = 0;
  let weightSum = 0;

  const counts = {
    pass: 0,
    partial: 0,
    fail: 0,
    ignored: 0,
  };

  for (const expectation of expectations) {
    counts[expectation.status] = (counts[expectation.status] ?? 0) + 1;
    if (expectation.status === "ignored") {
      continue;
    }

    const weight = severityWeights[expectation.severity] ?? DEFAULT_WEIGHTS[expectation.severity] ?? 1;
    weightedScoreSum += expectation.score * weight;
    weightSum += weight;
  }

  return {
    counts,
    weightedOverall: weightSum === 0 ? null : Number((weightedScoreSum / weightSum).toFixed(2)),
    contributingWeight: weightSum,
  };
}

function formatScore(score) {
  return score == null ? "n/a" : `${score.toFixed(2)}%`;
}

function severityRank(severity) {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

function buildEvidenceHtml(evidence, projectRoot) {
  if (!evidence.length) {
    return "<p class=\"muted\">No concrete evidence recorded.</p>";
  }

  const items = evidence.map((item) => {
    const labelParts = [item.path ?? "unknown path"];
    if (item.startLine != null) {
      labelParts.push(item.endLine != null && item.endLine !== item.startLine
        ? `lines ${item.startLine}-${item.endLine}`
        : `line ${item.startLine}`);
    }

    const note = item.note ? `<div class=\"evidence-note\">${escapeHtml(item.note)}</div>` : "";
    const href = item.path
      ? pathToFileURL(path.resolve(projectRoot, item.path)).href
      : null;
    const label = escapeHtml(labelParts.join(" - "));

    return `<li>${href ? `<a href=\"${href}\">${label}</a>` : label}${note}</li>`;
  });

  return `<ul class=\"evidence-list\">${items.join("")}</ul>`;
}

function buildReferencesHtml(references, projectRoot) {
  if (!references.length) {
    return "";
  }

  const items = references.map((reference) => {
    const href = pathToFileURL(path.resolve(projectRoot, reference)).href;
    return `<li><a href=\"${href}\">${escapeHtml(reference)}</a></li>`;
  });

  return `
    <div class=\"references\">
      <div class=\"label\">Related References</div>
      <ul>${items.join("")}</ul>
    </div>
  `;
}

function buildHtml(results) {
  const severityWeights = {
    ...DEFAULT_WEIGHTS,
    ...(results.severityWeights ?? {}),
  };
  const expectations = normalizeExpectations(results).sort((left, right) => {
    const severityDelta = severityRank(left.severity) - severityRank(right.severity);
    if (severityDelta !== 0) {
      return severityDelta;
    }
    return left.score - right.score;
  });
  const summary = computeSummary(expectations, severityWeights);
  const notes = Array.isArray(results.summary?.notes) ? results.summary.notes : [];
  const projectRoot = results.projectRoot ?? process.cwd();
  const specHref = results.specPath ? pathToFileURL(results.specPath).href : null;

  const expectationCards = expectations.map((expectation) => {
    const scoreClass = expectation.status;
    const ignoreBlock = expectation.ignoreReason
      ? `<div class=\"ignore-reason\"><strong>Ignored because:</strong> ${escapeHtml(expectation.ignoreReason)}</div>`
      : "";

    return `
      <article class=\"card finding ${scoreClass}\">
        <div class=\"finding-header\">
          <div>
            <div class=\"eyebrow\">${escapeHtml(expectation.id ?? "Expectation")}</div>
            <h2>${escapeHtml(expectation.title ?? "Untitled expectation")}</h2>
          </div>
          <div class=\"score-cluster\">
            <span class=\"severity severity-${escapeHtml(expectation.severity)}\">${escapeHtml(expectation.severity)}</span>
            <span class=\"score\">${escapeHtml(String(expectation.score))}%</span>
          </div>
        </div>
        <p class=\"summary\">${escapeHtml(expectation.summary ?? "")}</p>
        <p class=\"rationale\">${escapeHtml(expectation.rationale ?? "")}</p>
        ${ignoreBlock}
        <div class=\"evidence\">
          <div class=\"label\">Evidence</div>
          ${buildEvidenceHtml(expectation.evidence, projectRoot)}
        </div>
        ${buildReferencesHtml(expectation.relatedReferences, projectRoot)}
      </article>
    `;
  });

  const notesSection = notes.length
    ? `<section class=\"card notes\"><h2>Notes</h2><ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul></section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(results.reportTitle ?? "Generated Code Evaluation")}</title>
  <style>
    :root {
      --bg: #f3efe7;
      --surface: #fffdf8;
      --surface-strong: #fff;
      --border: #d8cfbf;
      --text: #1d1b17;
      --muted: #665f54;
      --accent: #ad4f1a;
      --pass: #2e7d59;
      --partial: #b56d11;
      --fail: #b33a34;
      --ignored: #6a7280;
      --critical: #7e1717;
      --high: #9d3412;
      --medium: #95610a;
      --low: #336b6b;
      --informational: #4a5a78;
      --shadow: 0 16px 40px rgba(34, 28, 19, 0.08);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background:
        radial-gradient(circle at top left, rgba(173, 79, 26, 0.12), transparent 30%),
        linear-gradient(180deg, #f8f3ea 0%, var(--bg) 100%);
      color: var(--text);
    }

    a { color: var(--accent); }

    .page {
      max-width: 1100px;
      margin: 0 auto;
      padding: 40px 24px 72px;
    }

    .hero {
      background: linear-gradient(140deg, rgba(255,255,255,0.92), rgba(255,247,235,0.92));
      border: 1px solid var(--border);
      border-radius: 24px;
      box-shadow: var(--shadow);
      padding: 28px;
      margin-bottom: 24px;
    }

    .hero-top {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      flex-wrap: wrap;
    }

    h1 {
      margin: 0 0 8px;
      font-size: clamp(2rem, 4vw, 3.2rem);
      line-height: 1.05;
    }

    .subtitle, .meta, .muted {
      color: var(--muted);
    }

    .grade-panel {
      min-width: 240px;
      background: rgba(29, 27, 23, 0.04);
      border-radius: 20px;
      padding: 18px 20px;
    }

    .grade-label {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.75rem;
      color: var(--muted);
      margin-bottom: 6px;
    }

    .grade-value {
      font-size: clamp(2rem, 5vw, 3rem);
      font-weight: 700;
      line-height: 1;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
      margin-top: 22px;
    }

    .metric {
      background: var(--surface-strong);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 16px;
    }

    .metric .label {
      font-size: 0.8rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 8px;
    }

    .metric .value {
      font-size: 1.8rem;
      font-weight: 700;
    }

    .card {
      background: rgba(255, 253, 248, 0.94);
      border: 1px solid var(--border);
      border-radius: 22px;
      box-shadow: var(--shadow);
    }

    .notes {
      padding: 20px 24px;
      margin-bottom: 24px;
    }

    .notes h2 {
      margin-top: 0;
    }

    .findings {
      display: grid;
      gap: 18px;
    }

    .finding {
      padding: 22px 24px 24px;
      border-left: 8px solid var(--border);
    }

    .finding.pass { border-left-color: var(--pass); }
    .finding.partial { border-left-color: var(--partial); }
    .finding.fail { border-left-color: var(--fail); }
    .finding.ignored { border-left-color: var(--ignored); }

    .finding-header {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .finding-header h2 {
      margin: 4px 0 0;
      font-size: 1.55rem;
    }

    .eyebrow, .label {
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }

    .score-cluster {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    .severity,
    .score {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 0.85rem;
      font-weight: 700;
      border: 1px solid transparent;
    }

    .severity-critical { background: rgba(126, 23, 23, 0.12); color: var(--critical); }
    .severity-high { background: rgba(157, 52, 18, 0.12); color: var(--high); }
    .severity-medium { background: rgba(149, 97, 10, 0.12); color: var(--medium); }
    .severity-low { background: rgba(51, 107, 107, 0.12); color: var(--low); }
    .severity-informational { background: rgba(74, 90, 120, 0.12); color: var(--informational); }
    .score { background: rgba(29, 27, 23, 0.08); color: var(--text); }

    .summary {
      font-size: 1.05rem;
      margin-bottom: 10px;
    }

    .rationale {
      margin-top: 0;
      line-height: 1.6;
    }

    .ignore-reason {
      margin: 14px 0;
      padding: 12px 14px;
      border-radius: 14px;
      background: rgba(106, 114, 128, 0.1);
      color: var(--ignored);
    }

    .evidence-list,
    .references ul,
    .notes ul {
      margin: 10px 0 0;
      padding-left: 20px;
    }

    .evidence-list li,
    .references li,
    .notes li {
      margin-bottom: 8px;
      line-height: 1.5;
    }

    .evidence-note {
      margin-top: 4px;
      color: var(--muted);
    }

    .footer {
      margin-top: 24px;
      color: var(--muted);
      font-size: 0.92rem;
    }

    @media (max-width: 720px) {
      .page { padding: 20px 14px 40px; }
      .hero, .finding, .notes { padding: 18px; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div class="hero-top">
        <div>
          <div class="eyebrow">Generated Code Evaluation</div>
          <h1>${escapeHtml(results.reportTitle ?? "Generated Code Evaluation")}</h1>
          <p class="subtitle">Candidate: ${escapeHtml(results.candidateLabel ?? "unnamed candidate")}</p>
          <p class="meta">Project root: ${escapeHtml(projectRoot)}</p>
          <p class="meta">Spec: ${specHref ? `<a href="${specHref}">${escapeHtml(results.specPath)}</a>` : escapeHtml(results.specPath ?? "")}</p>
          <p class="meta">Generated: ${escapeHtml(results.generatedAt ?? "")}</p>
        </div>
        <div class="grade-panel">
          <div class="grade-label">Weighted Overall Grade</div>
          <div class="grade-value">${formatScore(summary.weightedOverall)}</div>
          <p class="muted">Computed from non-ignored findings using severity weights.</p>
        </div>
      </div>

      <div class="summary-grid">
        <div class="metric">
          <div class="label">Pass</div>
          <div class="value">${summary.counts.pass}</div>
        </div>
        <div class="metric">
          <div class="label">Partial</div>
          <div class="value">${summary.counts.partial}</div>
        </div>
        <div class="metric">
          <div class="label">Fail</div>
          <div class="value">${summary.counts.fail}</div>
        </div>
        <div class="metric">
          <div class="label">Ignored</div>
          <div class="value">${summary.counts.ignored}</div>
        </div>
      </div>
    </section>

    ${notesSection}

    <section class="findings">
      ${expectationCards.join("\n")}
    </section>

    <p class="footer">Severity weights: ${escapeHtml(JSON.stringify(severityWeights))}</p>
  </main>
</body>
</html>`;
}

async function ensureDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

function openFile(targetPath) {
  const absolutePath = path.resolve(targetPath);
  const platform = process.platform;

  let command;
  let args;

  if (platform === "darwin") {
    command = "open";
    args = [absolutePath];
  } else if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", absolutePath];
  } else {
    command = "xdg-open";
    args = [absolutePath];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", reject);
    child.unref();
    resolve();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = path.resolve(args.input);
  const raw = await fs.readFile(inputPath, "utf8");
  const results = JSON.parse(raw);
  const outputPath = path.resolve(
    args.output ?? inputPath.replace(/\.json$/i, ".html")
  );

  const html = buildHtml(results);
  await ensureDirectory(outputPath);
  await fs.writeFile(outputPath, html, "utf8");

  if (args.open) {
    await openFile(outputPath);
  }

  console.log(JSON.stringify({
    input: inputPath,
    output: outputPath,
    reportUrl: pathToFileURL(outputPath).href,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});