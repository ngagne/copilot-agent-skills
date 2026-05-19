import fs from "fs/promises";
import os from "os";
import path from "path";
import { jest } from "@jest/globals";

import {
  collectGitHubEvents,
  createDefaultState,
  eventFingerprint,
  loadState,
  processEvent,
  saveState,
  withRetries,
} from "../loop.js";

function createLogger() {
  return {
    log: jest.fn().mockResolvedValue(undefined),
  };
}

describe("loop orchestrator", () => {
  test("loadState recovers interrupted actions from persisted in_progress state", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "loop-state-"));
    const stateFile = path.join(tempDir, "state.json");
    const state = createDefaultState("owner/repo");

    state.actions.demo = {
      status: "in_progress",
      event: { id: "1", source: "github", type: "demo" },
      updatedAt: "2026-03-24T00:00:00.000Z",
    };

    await saveState({ stateFile }, state);

    const loaded = await loadState({
      repo: "owner/repo",
      stateFile,
    });

    expect(loaded.actions.demo.status).toBe("interrupted");
    expect(loaded.actions.demo.recoveryNote).toContain("Recovered unfinished action");
  });

  test("withRetries honors retry-after hints and jitter before succeeding", async () => {
    const sleepFn = jest.fn().mockResolvedValue(undefined);
    let attempts = 0;

    const result = await withRetries(
      "github:getOpenPRs",
      async () => {
        attempts += 1;
        if (attempts === 1) {
          const error = new Error("rate limited");
          // @ts-expect-error test-only augmentation
          error.retryable = true;
          // @ts-expect-error test-only augmentation
          error.retryAfterMs = 5_000;
          throw error;
        }

        return "ok";
      },
      {
        retries: 3,
        baseDelayMs: 100,
        maxDelayMs: 10_000,
        sleepFn,
        randomFn: () => 0,
        logger: createLogger(),
        metrics: createDefaultState("owner/repo").metrics,
      }
    );

    expect(result).toBe("ok");
    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(sleepFn).toHaveBeenCalledWith(5_000);
  });

  test("collectGitHubEvents suppresses duplicate changes-requested events until the review cursor advances", async () => {
    const logger = createLogger();
    const pr = {
      number: 42,
      title: "Tighten retries",
      html_url: "https://example.test/pull/42",
      head: {
        ref: "feature/retries",
        sha: "abc123",
      },
      base: {
        repo: {
          full_name: "owner/repo",
        },
      },
    };
    const reviews = [
      {
        id: 2001,
        state: "CHANGES_REQUESTED",
        submitted_at: "2026-03-24T12:00:00.000Z",
      },
    ];
    const state = createDefaultState("owner/repo");
    const context = {
      config: {
        repo: "owner/repo",
      },
      state,
      logger,
      github: {
        enabled: true,
        getOpenPRs: jest.fn().mockResolvedValue([pr]),
        getPRReviews: jest.fn().mockResolvedValue(reviews),
      },
      jenkins: {
        enabled: false,
      },
    };

    const firstPass = await collectGitHubEvents(context);
    const secondPass = await collectGitHubEvents(context);

    expect(firstPass).toHaveLength(1);
    expect(secondPass).toHaveLength(0);
    expect(state.github.pulls["42"].cursor.reviewSummary.latestReviewId).toBe(2001);
  });

  test("processEvent skips already-completed events during replay", async () => {
    const state = createDefaultState("owner/repo");
    const event = {
      id: "github:pr:1:sha:review",
      source: "github",
      type: "github.pr.action-requested",
      occurredAt: "2026-03-24T12:00:00.000Z",
      payload: {},
    };
    const fingerprint = eventFingerprint(event);
    state.actions[fingerprint] = {
      status: "completed",
      event,
      updatedAt: "2026-03-24T12:01:00.000Z",
    };

    const context = {
      config: {
        stateFile: path.join(os.tmpdir(), `loop-${Date.now()}.json`),
        metricsFile: path.join(os.tmpdir(), `loop-${Date.now()}.metrics.json`),
      },
      state,
      logger: createLogger(),
    };

    await processEvent(event, context);

    expect(state.metrics.eventsDeduped).toBe(1);
    expect(state.actions[fingerprint].status).toBe("completed");
  });
});
