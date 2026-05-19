#!/usr/bin/env node

/**
 * Autonomous SDLC event orchestrator
 * - Polls GitHub PRs and Jenkins build status
 * - Loads project plan files as bootstrap work items
 * - Persists state locally so runs can resume after interruption
 * - Emits durable JSONL logs and metrics snapshots for long-running monitoring
 * - Uses structured command specs instead of shell templates for CLI execution
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { pathToFileURL } from "url";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_INTERVAL_MS = 2 * 60 * 1000;
const DEFAULT_STATE_DIR = ".copilot-orchestrator";
const DEFAULT_RETRY_COUNT = 4;
const DEFAULT_RETRY_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRY_DELAY_MS = 30_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_LOG_FILE = "orchestrator.log.jsonl";
const DEFAULT_METRICS_FILE = "metrics.json";
const DEFAULT_COPILOT_PR_COMMAND = [
  "gh",
  "copilot",
  "suggest",
  "-t",
  "shell",
  "{PROMPT}",
];
const DEFAULT_COPILOT_PLAN_COMMAND = [
  "gh",
  "copilot",
  "suggest",
  "-t",
  "shell",
  "{PROMPT}",
];

function printUsage() {
  console.log(`
Usage:
  node loop.js [options]

Options:
  --repo <owner/repo>         GitHub repository to monitor (defaults to git origin)
  --plan <file>               Project plan file to ingest (repeatable)
  --interval-ms <number>      Polling interval in milliseconds
  --state-file <path>         Persistent state file path
  --log-file <path>           Durable JSONL log file path
  --metrics-file <path>       Durable metrics snapshot file path
  --jenkins-base <url>        Jenkins base URL
  --github-token <token>      GitHub token override
  --jenkins-user <user>       Jenkins username override
  --jenkins-token <token>     Jenkins token override
  --once                      Run a single polling cycle and exit
  --help                      Show this help message

Environment:
  GITHUB_TOKEN
  JENKINS_BASE
  JENKINS_USER
  JENKINS_TOKEN
  COPILOT_PR_COMMAND_ARGS     JSON array or object for the PR command spec
  COPILOT_PLAN_COMMAND_ARGS   JSON array or object for the plan command spec
`);
}

function parseArgs(argv) {
  const args = {
    planFiles: [],
    once: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    switch (value) {
      case "--repo":
        args.repo = argv[index + 1];
        index += 1;
        break;
      case "--plan":
        args.planFiles.push(argv[index + 1]);
        index += 1;
        break;
      case "--interval-ms":
        args.intervalMs = Number(argv[index + 1]);
        index += 1;
        break;
      case "--state-file":
        args.stateFile = argv[index + 1];
        index += 1;
        break;
      case "--log-file":
        args.logFile = argv[index + 1];
        index += 1;
        break;
      case "--metrics-file":
        args.metricsFile = argv[index + 1];
        index += 1;
        break;
      case "--jenkins-base":
        args.jenkinsBase = argv[index + 1];
        index += 1;
        break;
      case "--github-token":
        args.githubToken = argv[index + 1];
        index += 1;
        break;
      case "--jenkins-user":
        args.jenkinsUser = argv[index + 1];
        index += 1;
        break;
      case "--jenkins-token":
        args.jenkinsToken = argv[index + 1];
        index += 1;
        break;
      case "--once":
        args.once = true;
        break;
      case "--help":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${value}`);
    }
  }

  return args;
}

function repoSlug(repo) {
  return repo.replaceAll("/", "__");
}

function parseGitHubRepoFromRemote(remoteUrl) {
  const normalized = String(remoteUrl ?? "").trim();
  const match = normalized.match(
    /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/
  );

  if (!match) {
    throw new Error(
      `Could not determine GitHub repository from origin remote: ${normalized}`
    );
  }

  return `${match[1]}/${match[2]}`;
}

async function discoverRepoFromGit() {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["remote", "get-url", "origin"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(
        new Error(`Failed to inspect git origin remote: ${error.message}`)
      );
    });

    child.on("close", (code, signal) => {
      if (code !== 0) {
        reject(
          new Error(
            signal != null
              ? `git remote get-url origin exited via signal ${signal}`
              : stderr.trim() || "git remote get-url origin failed"
          )
        );
        return;
      }

      try {
        resolve(parseGitHubRepoFromRemote(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function commandSpecFromValue(value, fallbackArgs) {
  if (!value) {
    return {
      command: fallbackArgs[0],
      args: fallbackArgs.slice(1),
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(
      `Invalid command spec JSON: ${error.message}. Use a JSON array like ["gh","copilot","suggest","-t","shell","{PROMPT}"].`
    );
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new Error("Command spec array must not be empty.");
    }

    return {
      command: String(parsed[0]),
      args: parsed.slice(1).map((item) => String(item)),
    };
  }

  if (parsed && typeof parsed === "object") {
    if (!parsed.command || !Array.isArray(parsed.args)) {
      throw new Error(
        "Command spec object must include {\"command\": string, \"args\": string[] }."
      );
    }

    return {
      command: String(parsed.command),
      args: parsed.args.map((item) => String(item)),
      cwd: parsed.cwd ? String(parsed.cwd) : undefined,
      env: parsed.env && typeof parsed.env === "object" ? parsed.env : undefined,
    };
  }

  throw new Error("Command spec must be a JSON array or object.");
}

async function resolveConfig(cliArgs) {
  if (cliArgs.help) {
    printUsage();
    process.exit(0);
  }

  const repo = cliArgs.repo ?? (await discoverRepoFromGit());

  const stateFile =
    cliArgs.stateFile ??
    path.join(
      process.cwd(),
      DEFAULT_STATE_DIR,
      `${repoSlug(repo)}.state.json`
    );
  const stateDir = path.dirname(path.resolve(stateFile));

  return {
    repo,
    intervalMs: Number.isFinite(cliArgs.intervalMs)
      ? cliArgs.intervalMs
      : DEFAULT_INTERVAL_MS,
    stateFile: path.resolve(stateFile),
    logFile: path.resolve(
      cliArgs.logFile ?? path.join(stateDir, DEFAULT_LOG_FILE)
    ),
    metricsFile: path.resolve(
      cliArgs.metricsFile ?? path.join(stateDir, DEFAULT_METRICS_FILE)
    ),
    once: cliArgs.once,
    planFiles: cliArgs.planFiles.map((filePath) => path.resolve(filePath)),
    githubToken: cliArgs.githubToken ?? process.env.GITHUB_TOKEN,
    jenkinsBase: cliArgs.jenkinsBase ?? process.env.JENKINS_BASE,
    jenkinsUser: cliArgs.jenkinsUser ?? process.env.JENKINS_USER,
    jenkinsToken: cliArgs.jenkinsToken ?? process.env.JENKINS_TOKEN,
    copilotPrCommandSpec: commandSpecFromValue(
      process.env.COPILOT_PR_COMMAND_ARGS,
      DEFAULT_COPILOT_PR_COMMAND
    ),
    copilotPlanCommandSpec: commandSpecFromValue(
      process.env.COPILOT_PLAN_COMMAND_ARGS,
      DEFAULT_COPILOT_PLAN_COMMAND
    ),
  };
}

async function ensureDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readJsonIfExists(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function createDefaultMetrics() {
  return {
    cyclesStarted: 0,
    cyclesCompleted: 0,
    cyclesFailed: 0,
    collectorRuns: {},
    collectorErrors: {},
    eventsSeen: 0,
    eventsCompleted: 0,
    eventsFailed: 0,
    eventsIgnored: 0,
    eventsDeduped: 0,
    retriesAttempted: 0,
    retryExhausted: 0,
    githubRequests: 0,
    githubRateLimitHits: 0,
    jenkinsRequests: 0,
    commandRuns: 0,
    commandFailures: 0,
  };
}

function createDefaultState(repo) {
  return {
    version: 2,
    repo,
    lastCycleAt: null,
    lastFatalError: null,
    actions: {},
    projectPlans: {},
    github: {
      pulls: {},
    },
    jenkins: {
      builds: {},
    },
    metrics: createDefaultMetrics(),
  };
}

function recoverActionState(actions) {
  const recovered = {};

  for (const [key, action] of Object.entries(actions ?? {})) {
    if (action?.status === "in_progress") {
      recovered[key] = {
        ...action,
        status: "interrupted",
        updatedAt: new Date().toISOString(),
        recoveryNote: "Recovered unfinished action after restart.",
      };
      continue;
    }

    recovered[key] = action;
  }

  return recovered;
}

async function loadState(config) {
  const state = await readJsonIfExists(config.stateFile);
  const defaultState = createDefaultState(config.repo);

  if (!state) {
    return defaultState;
  }

  return {
    ...defaultState,
    ...state,
    repo: config.repo,
    actions: recoverActionState({
      ...defaultState.actions,
      ...(state.actions ?? {}),
    }),
    projectPlans: {
      ...defaultState.projectPlans,
      ...(state.projectPlans ?? {}),
    },
    github: {
      ...defaultState.github,
      ...(state.github ?? {}),
      pulls: {
        ...defaultState.github.pulls,
        ...(state.github?.pulls ?? {}),
      },
    },
    jenkins: {
      ...defaultState.jenkins,
      ...(state.jenkins ?? {}),
      builds: {
        ...defaultState.jenkins.builds,
        ...(state.jenkins?.builds ?? {}),
      },
    },
    metrics: {
      ...defaultState.metrics,
      ...(state.metrics ?? {}),
    },
  };
}

async function saveJsonFile(filePath, payload) {
  await ensureDirectory(filePath);
  const tempFile = `${filePath}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(tempFile, filePath);
}

async function saveState(config, state) {
  await saveJsonFile(config.stateFile, state);
}

async function saveMetrics(config, metrics) {
  await saveJsonFile(config.metricsFile, {
    updatedAt: new Date().toISOString(),
    metrics,
  });
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function eventFingerprint(event) {
  return sha256(JSON.stringify([event.source, event.type, event.id]));
}

function isRetryableError(error) {
  if (!error) return false;
  if (error.retryable) return true;

  const message = String(error.message ?? "");
  return (
    message.includes("timed out") ||
    message.includes("ECONNRESET") ||
    message.includes("ENOTFOUND") ||
    message.includes("429") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  );
}

function incrementMetric(metrics, key, delta = 1) {
  metrics[key] = (metrics[key] ?? 0) + delta;
}

function incrementMapMetric(metrics, key, subkey, delta = 1) {
  metrics[key] = metrics[key] ?? {};
  metrics[key][subkey] = (metrics[key][subkey] ?? 0) + delta;
}

function formatConsoleMeta(meta) {
  if (!meta || Object.keys(meta).length === 0) {
    return "";
  }

  const compact = Object.entries(meta)
    .map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" ");

  return compact ? ` ${compact}` : "";
}

function createLogger(config) {
  return {
    async log(level, message, meta = {}) {
      const entry = {
        at: new Date().toISOString(),
        level,
        message,
        ...meta,
      };

      const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
      console[method](`[${level}] ${message}${formatConsoleMeta(meta)}`);

      try {
        await ensureDirectory(config.logFile);
        await fs.appendFile(config.logFile, `${JSON.stringify(entry)}\n`, "utf8");
      } catch (error) {
        console.error(`[error] Failed to append log entry: ${error.message}`);
      }
    },
  };
}

function calculateRetryDelayMs({
  attempt,
  baseDelayMs,
  maxDelayMs,
  retryAfterMs,
  randomFn = Math.random,
}) {
  const exponentialDelayMs = Math.min(
    maxDelayMs,
    baseDelayMs * 2 ** Math.max(0, attempt - 1)
  );
  const floorDelayMs = Math.max(exponentialDelayMs, retryAfterMs ?? 0);
  const jitterWindowMs = Math.max(250, Math.floor(floorDelayMs * 0.2));
  return floorDelayMs + Math.floor(randomFn() * jitterWindowMs);
}

async function withRetries(taskName, operation, options = {}) {
  const retries = options.retries ?? DEFAULT_RETRY_COUNT;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_RETRY_DELAY_MS;
  const logger = options.logger;
  const metrics = options.metrics;
  const sleepFn = options.sleepFn ?? sleep;
  const randomFn = options.randomFn ?? Math.random;

  let attempt = 0;
  let lastError;

  while (attempt < retries) {
    attempt += 1;

    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt >= retries || !isRetryableError(error)) {
        break;
      }

      incrementMetric(metrics ?? {}, "retriesAttempted");
      const delayMs = calculateRetryDelayMs({
        attempt,
        baseDelayMs,
        maxDelayMs,
        retryAfterMs: error.retryAfterMs,
        randomFn,
      });

      await logger?.log("warn", "Retrying failed operation", {
        taskName,
        attempt,
        retries,
        delayMs,
        reason: error.message,
        retryAfterMs: error.retryAfterMs ?? null,
      });

      await sleepFn(delayMs);
    }
  }

  if (lastError) {
    incrementMetric(metrics ?? {}, "retryExhausted");
  }

  throw lastError;
}

function parseRetryAfter(headers) {
  const value = headers.get("retry-after");
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, timestamp - Date.now());
}

function buildHttpError(url, response, text) {
  const error = new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 400)}`);
  error.statusCode = response.status;
  error.retryable = response.status >= 500 || response.status === 429;

  const rateRemaining = response.headers.get("x-ratelimit-remaining");
  const rateReset = response.headers.get("x-ratelimit-reset");
  const retryAfterMs = parseRetryAfter(response.headers);

  if (response.status === 403 && rateRemaining === "0") {
    const resetMs = rateReset ? Math.max(0, Number(rateReset) * 1_000 - Date.now()) : null;
    error.retryable = true;
    error.retryAfterMs = resetMs ?? retryAfterMs ?? DEFAULT_RETRY_DELAY_MS;
    error.rateLimited = true;
  } else if (retryAfterMs != null) {
    error.retryAfterMs = retryAfterMs;
  }

  return error;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const metrics = options.metrics;

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (options.service === "github") {
      incrementMetric(metrics ?? {}, "githubRequests");
    }

    if (options.service === "jenkins") {
      incrementMetric(metrics ?? {}, "jenkinsRequests");
    }

    if (!response.ok) {
      const text = await response.text();
      const error = buildHttpError(url, response, text);
      if (error.rateLimited && options.service === "github") {
        incrementMetric(metrics ?? {}, "githubRateLimitHits");
      }
      throw error;
    }

    return response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error(`Request timed out for ${url}`);
      timeoutError.retryable = true;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function createGitHubClient(config, runtime) {
  return {
    enabled: Boolean(config.githubToken),
    async getOpenPRs() {
      if (!config.githubToken) {
        throw new Error("GitHub is not configured. Set GITHUB_TOKEN.");
      }

      const url = `https://api.github.com/repos/${config.repo}/pulls?state=open`;
      return withRetries(
        "github:getOpenPRs",
        () =>
          fetchJson(url, {
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${config.githubToken}`,
              "User-Agent": "autonomous-sdlc-orchestrator",
            },
            service: "github",
            metrics: runtime.metrics,
          }),
        runtime
      );
    },
    async getPRReviews(prNumber) {
      if (!config.githubToken) {
        throw new Error("GitHub is not configured. Set GITHUB_TOKEN.");
      }

      const url = `https://api.github.com/repos/${config.repo}/pulls/${prNumber}/reviews`;
      return withRetries(
        `github:getPRReviews:${prNumber}`,
        () =>
          fetchJson(url, {
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${config.githubToken}`,
              "User-Agent": "autonomous-sdlc-orchestrator",
            },
            service: "github",
            metrics: runtime.metrics,
          }),
        runtime
      );
    },
  };
}

function createJenkinsClient(config, runtime) {
  return {
    enabled: Boolean(
      config.jenkinsBase && config.jenkinsUser && config.jenkinsToken
    ),
    async getBranchStatus(branchName) {
      if (!config.jenkinsBase || !config.jenkinsUser || !config.jenkinsToken) {
        throw new Error(
          "Jenkins is not configured. Set JENKINS_BASE, JENKINS_USER, and JENKINS_TOKEN."
        );
      }

      const url = `${config.jenkinsBase}/job/${encodeURIComponent(branchName)}/lastBuild/api/json`;
      return withRetries(
        `jenkins:getBranchStatus:${branchName}`,
        () =>
          fetchJson(url, {
            headers: {
              Authorization: `Basic ${Buffer.from(
                `${config.jenkinsUser}:${config.jenkinsToken}`
              ).toString("base64")}`,
            },
            service: "jenkins",
            metrics: runtime.metrics,
          }),
        runtime
      );
    },
  };
}

function buildPrPrompt(pr, reasons) {
  return [
    `Review and act on GitHub pull request #${pr.number} in ${pr.base.repo.full_name}.`,
    `PR title: ${pr.title}`,
    `Branch: ${pr.head.ref}`,
    `Reasons: ${reasons.join("; ")}`,
    "Use the GitHub CLI to inspect the PR, address requested changes or failing CI, and prepare the next appropriate action.",
  ].join(" ");
}

function buildPlanPrompt(plan) {
  return [
    `Execute the project plan described in ${plan.path}.`,
    `Plan summary hash: ${plan.hash}.`,
    "Read the file contents, determine the next implementation steps, and use GitHub CLI or local tooling as needed to carry out the plan.",
  ].join(" ");
}

function renderCommandSpec(spec, replacements) {
  const replace = (value) =>
    Object.entries(replacements).reduce(
      (current, [key, replacement]) =>
        current.replaceAll(`{${key}}`, String(replacement)),
      String(value)
    );

  return {
    command: replace(spec.command),
    args: (spec.args ?? []).map(replace),
    cwd: spec.cwd ? replace(spec.cwd) : undefined,
    env: spec.env
      ? Object.fromEntries(
          Object.entries(spec.env).map(([key, value]) => [key, replace(value)])
        )
      : undefined,
  };
}

async function runCommand(spec, label, context) {
  incrementMetric(context.state.metrics, "commandRuns");

  await context.logger.log("info", "Starting command", {
    label,
    command: spec.command,
    args: spec.args,
    cwd: spec.cwd ?? process.cwd(),
  });

  return new Promise((resolve) => {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd ?? process.cwd(),
      env: {
        ...process.env,
        ...(spec.env ?? {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", async (error) => {
      incrementMetric(context.state.metrics, "commandFailures");
      await context.logger.log("error", "Command failed to launch", {
        label,
        error: error.message,
      });
      resolve({ ok: false, error: error.message, stdout, stderr });
    });

    child.on("close", async (code, signal) => {
      if (stdout.trim()) {
        await context.logger.log("info", "Command stdout", {
          label,
          stdout: stdout.trim(),
        });
      }

      if (stderr.trim()) {
        await context.logger.log("warn", "Command stderr", {
          label,
          stderr: stderr.trim(),
        });
      }

      if (code === 0) {
        await context.logger.log("info", "Command completed", {
          label,
          code,
        });
        resolve({ ok: true, stdout, stderr, code, signal });
        return;
      }

      incrementMetric(context.state.metrics, "commandFailures");
      const errorMessage =
        signal != null
          ? `Exited via signal ${signal}`
          : `Exited with code ${code}`;
      await context.logger.log("error", "Command failed", {
        label,
        code,
        signal,
        error: errorMessage,
      });
      resolve({
        ok: false,
        error: errorMessage,
        stdout,
        stderr,
        code,
        signal,
      });
    });
  });
}

function createGitHubCursor(pr, reviews = [], jenkinsStatus = null) {
  const latestReview = [...reviews]
    .filter((review) => review?.id != null)
    .sort((left, right) => Number(left.id) - Number(right.id))
    .at(-1);

  const states = reviews.map((review) => review.state ?? "UNKNOWN");

  return {
    headSha: pr.head.sha,
    branch: pr.head.ref,
    title: pr.title,
    url: pr.html_url,
    baseRepo: pr.base.repo.full_name,
    reviewSummary: {
      latestReviewId: latestReview?.id ?? null,
      latestReviewState: latestReview?.state ?? null,
      latestReviewSubmittedAt: latestReview?.submitted_at ?? null,
      reviewCount: reviews.length,
      reviewStatesDigest: sha256(JSON.stringify(states)),
      changesRequested: states.some(
        (state) => String(state).toLowerCase() === "changes_requested"
      ),
    },
    jenkinsSummary: {
      buildId: jenkinsStatus?.id ?? null,
      buildNumber: jenkinsStatus?.number ?? null,
      result: jenkinsStatus?.result ?? null,
      timestamp: jenkinsStatus?.timestamp ?? null,
      url: jenkinsStatus?.url ?? null,
    },
    lastSeenAt: new Date().toISOString(),
  };
}

function createJenkinsCursor(status) {
  return {
    buildId: status?.id ?? null,
    buildNumber: status?.number ?? null,
    result: status?.result ?? null,
    timestamp: status?.timestamp ?? null,
    url: status?.url ?? null,
    checkedAt: new Date().toISOString(),
  };
}

async function collectProjectPlanEvents(context) {
  const events = [];

  for (const planPath of context.config.planFiles) {
    try {
      const content = await fs.readFile(planPath, "utf8");
      const hash = sha256(content);
      const planState = context.state.projectPlans[planPath];

      if (planState?.hash === hash && planState?.status === "processed") {
        continue;
      }

      events.push({
        id: `project-plan:${planPath}:${hash}`,
        source: "project-plans",
        type: "project-plan.requested",
        occurredAt: new Date().toISOString(),
        payload: {
          path: planPath,
          hash,
        },
      });
    } catch (error) {
      await context.logger.log("error", "Failed to read plan file", {
        planPath,
        error: error.message,
      });
    }
  }

  return events;
}

async function collectGitHubEvents(context) {
  if (!context.github.enabled) {
    await context.logger.log("warn", "Skipping GitHub collector because it is not configured");
    return [];
  }

  const prs = await context.github.getOpenPRs();
  const events = [];

  for (const pr of prs) {
    const [reviewsResult, jenkinsResult] = await Promise.allSettled([
      context.github.getPRReviews(pr.number),
      context.jenkins.enabled
        ? context.jenkins.getBranchStatus(pr.head.ref)
        : Promise.resolve(null),
    ]);

    const reviews =
      reviewsResult.status === "fulfilled" ? reviewsResult.value : null;
    const jenkinsStatus =
      jenkinsResult.status === "fulfilled" ? jenkinsResult.value : null;

    if (reviewsResult.status === "rejected") {
      await context.logger.log("error", "Failed to fetch PR reviews", {
        prNumber: pr.number,
        error: reviewsResult.reason.message,
      });
    }

    if (jenkinsResult.status === "rejected") {
      await context.logger.log("error", "Failed to fetch Jenkins status for branch", {
        branch: pr.head.ref,
        error: jenkinsResult.reason.message,
      });
    }

    const previousPrState = context.state.github.pulls[String(pr.number)] ?? {};
    const currentCursor = createGitHubCursor(pr, reviews ?? [], jenkinsStatus);
    const previousCursor = previousPrState.cursor ?? null;
    const reasons = [];

    if (
      currentCursor.reviewSummary.changesRequested &&
      (
        previousCursor?.headSha !== currentCursor.headSha ||
        previousCursor?.reviewSummary?.latestReviewId !==
          currentCursor.reviewSummary.latestReviewId ||
        previousCursor?.reviewSummary?.changesRequested !== true
      )
    ) {
      reasons.push("review changes requested");
    }

    context.state.github.pulls[String(pr.number)] = {
      ...previousPrState,
      cursor: currentCursor,
      lastSeenAt: currentCursor.lastSeenAt,
      title: pr.title,
      url: pr.html_url,
      branch: pr.head.ref,
      baseRepo: pr.base.repo.full_name,
    };

    if (reasons.length === 0) {
      continue;
    }

    events.push({
      id: `github:pr:${pr.number}:${currentCursor.headSha}:${currentCursor.reviewSummary.latestReviewId ?? currentCursor.reviewSummary.reviewStatesDigest}`,
      source: "github",
      type: "github.pr.action-requested",
      occurredAt: new Date().toISOString(),
      payload: {
        pr,
        reviews,
        jenkinsStatus,
        reasons,
        cursor: currentCursor,
      },
    });
  }

  return events;
}

async function collectJenkinsEvents(context) {
  if (!context.jenkins.enabled) {
    await context.logger.log("warn", "Skipping Jenkins collector because it is not configured");
    return [];
  }

  const events = [];
  const trackedPulls = Object.entries(context.state.github.pulls);

  for (const [prNumber, pullState] of trackedPulls) {
    if (!pullState.branch) {
      continue;
    }

    try {
      const status = await context.jenkins.getBranchStatus(pullState.branch);
      const previousBuild = context.state.jenkins.builds[pullState.branch] ?? {};
      const currentCursor = createJenkinsCursor(status);

      context.state.jenkins.builds[pullState.branch] = {
        ...previousBuild,
        cursor: currentCursor,
      };

      if (
        currentCursor.result === "FAILURE" &&
        (
          previousBuild.cursor?.buildId !== currentCursor.buildId ||
          previousBuild.cursor?.result !== currentCursor.result
        )
      ) {
        events.push({
          id: `jenkins:pr:${prNumber}:${pullState.branch}:${currentCursor.buildId ?? "unknown"}:${currentCursor.result ?? "UNKNOWN"}`,
          source: "jenkins",
          type: "jenkins.build.failed",
          occurredAt: new Date().toISOString(),
          payload: {
            prNumber: Number(prNumber),
            branch: pullState.branch,
            title: pullState.title,
            url: pullState.url,
            baseRepo: pullState.baseRepo ?? context.config.repo,
            status,
            cursor: currentCursor,
          },
        });
      }
    } catch (error) {
      await context.logger.log("error", "Failed to fetch cached Jenkins branch status", {
        branch: pullState.branch,
        error: error.message,
      });
    }
  }

  return events;
}

const collectors = [
  {
    name: "project-plans",
    collect: collectProjectPlanEvents,
  },
  {
    name: "github",
    collect: collectGitHubEvents,
  },
  {
    name: "jenkins",
    collect: collectJenkinsEvents,
  },
];

const handlers = {
  async "project-plan.requested"(event, context) {
    const plan = event.payload;
    const prompt = buildPlanPrompt(plan);
    const command = renderCommandSpec(context.config.copilotPlanCommandSpec, {
      PROMPT: prompt,
      PLAN_PATH: plan.path,
    });
    const result = await runCommand(command, `plan ${plan.path}`, context);

    context.state.projectPlans[plan.path] = {
      hash: plan.hash,
      status: result.ok ? "processed" : "failed",
      lastProcessedAt: new Date().toISOString(),
      lastError: result.ok ? null : result.error,
    };

    if (!result.ok) {
      throw new Error(result.error);
    }
  },
  async "github.pr.action-requested"(event, context) {
    const { pr, reasons } = event.payload;
    const prompt = buildPrPrompt(pr, reasons);
    const command = renderCommandSpec(context.config.copilotPrCommandSpec, {
      PROMPT: prompt,
      PR_NUMBER: String(pr.number),
      REPO: pr.base.repo.full_name,
    });
    const result = await runCommand(command, `PR #${pr.number}`, context);

    if (!result.ok) {
      throw new Error(result.error);
    }
  },
  async "jenkins.build.failed"(event, context) {
    const { prNumber, branch, title, baseRepo } = event.payload;
    const prompt = [
      `Investigate Jenkins build failure for branch ${branch} in ${baseRepo}.`,
      `Associated pull request: #${prNumber}.`,
      title ? `PR title: ${title}.` : "",
      "Use GitHub CLI to inspect the PR, identify likely causes, and take the next appropriate action.",
    ]
      .filter(Boolean)
      .join(" ");
    const command = renderCommandSpec(context.config.copilotPrCommandSpec, {
      PROMPT: prompt,
      PR_NUMBER: String(prNumber),
      REPO: baseRepo,
    });
    const result = await runCommand(
      command,
      `Jenkins failure for PR #${prNumber}`,
      context
    );

    if (!result.ok) {
      throw new Error(result.error);
    }
  },
};

async function runCollector(collector, context) {
  incrementMapMetric(context.state.metrics, "collectorRuns", collector.name);

  try {
    const events = await collector.collect(context);
    return { collector: collector.name, events };
  } catch (error) {
    incrementMapMetric(context.state.metrics, "collectorErrors", collector.name);
    await context.logger.log("error", "Collector failed", {
      collector: collector.name,
      error: error.message,
    });
    return { collector: collector.name, events: [], error };
  }
}

async function persistRuntimeArtifacts(context) {
  await saveState(context.config, context.state);
  await saveMetrics(context.config, context.state.metrics);
}

async function processEvent(event, context) {
  incrementMetric(context.state.metrics, "eventsSeen");

  const fingerprint = eventFingerprint(event);
  const existing = context.state.actions[fingerprint];

  if (existing?.status === "completed") {
    incrementMetric(context.state.metrics, "eventsDeduped");
    await context.logger.log("info", "Skipping already-completed event", {
      eventType: event.type,
      eventId: event.id,
      fingerprint,
    });
    return;
  }

  const handler = handlers[event.type];
  if (!handler) {
    incrementMetric(context.state.metrics, "eventsIgnored");
    await context.logger.log("warn", "No handler registered for event", {
      eventType: event.type,
      eventId: event.id,
    });
    context.state.actions[fingerprint] = {
      status: "ignored",
      event,
      updatedAt: new Date().toISOString(),
    };
    await persistRuntimeArtifacts(context);
    return;
  }

  const previousAttempts = existing?.attempts ?? 0;
  context.state.actions[fingerprint] = {
    status: "in_progress",
    event,
    attempts: previousAttempts + 1,
    updatedAt: new Date().toISOString(),
  };
  await persistRuntimeArtifacts(context);

  try {
    await handler(event, context);
    incrementMetric(context.state.metrics, "eventsCompleted");
    context.state.actions[fingerprint] = {
      status: "completed",
      event,
      attempts: previousAttempts + 1,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    incrementMetric(context.state.metrics, "eventsFailed");
    await context.logger.log("error", "Event processing failed", {
      eventType: event.type,
      eventId: event.id,
      error: error.message,
    });
    context.state.actions[fingerprint] = {
      status: "failed",
      event,
      attempts: previousAttempts + 1,
      error: error.message,
      updatedAt: new Date().toISOString(),
    };
  }

  await persistRuntimeArtifacts(context);
}

async function runCycle(context) {
  incrementMetric(context.state.metrics, "cyclesStarted");
  await context.logger.log("info", "Starting polling cycle", {
    repo: context.config.repo,
  });

  const collectorResults = [];
  for (const collector of collectors) {
    collectorResults.push(await runCollector(collector, context));
  }

  const events = collectorResults.flatMap((result) => result.events);
  events.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

  for (const event of events) {
    await processEvent(event, context);
  }

  context.state.lastCycleAt = new Date().toISOString();
  incrementMetric(context.state.metrics, "cyclesCompleted");
  await persistRuntimeArtifacts(context);

  const summary = collectorResults
    .map((result) => `${result.collector}:${result.events.length}`)
    .join(", ");
  await context.logger.log("info", "Completed polling cycle", {
    repo: context.config.repo,
    summary: summary || "none",
  });
}

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));
  const config = await resolveConfig(cliArgs);
  const state = await loadState(config);
  const logger = createLogger(config);
  const runtime = {
    logger,
    metrics: state.metrics,
  };

  const context = {
    config,
    state,
    logger,
    github: createGitHubClient(config, runtime),
    jenkins: createJenkinsClient(config, runtime),
  };

  do {
    try {
      await runCycle(context);
    } catch (error) {
      incrementMetric(context.state.metrics, "cyclesFailed");
      throw error;
    }

    if (config.once) {
      break;
    }

    await context.logger.log("info", "Sleeping before next cycle", {
      intervalMs: config.intervalMs,
    });
    await sleep(config.intervalMs);
  } while (true);
}

async function handleFatalError(error) {
  console.error(`[fatal] ${error.stack ?? error.message}`);

  try {
    const cliArgs = parseArgs(process.argv.slice(2));
    const config = await resolveConfig(cliArgs);
    const state = await loadState(config);
    state.lastFatalError = {
      message: error.message,
      at: new Date().toISOString(),
    };
    incrementMetric(state.metrics, "cyclesFailed");
    await saveState(config, state);
    await saveMetrics(config, state.metrics);
    const logger = createLogger(config);
    await logger.log("error", "Fatal orchestrator error", {
      error: error.message,
    });
  } catch {
    // Best effort only.
  }

  process.exit(1);
}

const isEntrypoint =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isEntrypoint) {
  main().catch(handleFatalError);
}

export {
  calculateRetryDelayMs,
  collectGitHubEvents,
  commandSpecFromValue,
  createDefaultMetrics,
  createDefaultState,
  createGitHubCursor,
  createJenkinsCursor,
  eventFingerprint,
  isRetryableError,
  loadState,
  processEvent,
  recoverActionState,
  renderCommandSpec,
  resolveConfig,
  runCycle,
  saveState,
  sha256,
  withRetries,
};
