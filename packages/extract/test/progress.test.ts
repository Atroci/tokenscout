import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emitProgress,
  withProgressPhase,
  type ProgressEvent,
  type ProgressListener,
} from "../src/progress.js";

test("emitProgress: listener failures never abort the caller", () => {
  assert.doesNotThrow(() =>
    emitProgress(
      () => {
        throw new Error("renderer failed");
      },
      { phase: "run", status: "started" },
    ),
  );
});

test("emitProgress: rejected thenables are observed defensively", async () => {
  let called = false;
  const listener = (async () => {
    called = true;
    throw new Error("async renderer failed");
  }) as unknown as ProgressListener;

  emitProgress(listener, { phase: "run", status: "started" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(called, true);
});

test("withProgressPhase: emits started then completed with merged detail", async () => {
  const events: ProgressEvent[] = [];
  const result = await withProgressPhase(
    (event) => events.push(event),
    {
      phase: "discovery",
      url: "https://example.com",
      detail: { method: "links" },
    },
    async () => ["/", "/about"],
    (pages) => ({ pages: pages.length }),
  );

  assert.deepEqual(result, ["/", "/about"]);
  assert.deepEqual(
    events.map((event) => `${event.phase}.${event.status}`),
    ["discovery.started", "discovery.completed"],
  );
  assert.deepEqual(events[1].detail, { method: "links", pages: 2 });
  assert.equal(Number.isInteger(events[1].elapsedMs), true);
  assert.ok((events[1].elapsedMs ?? -1) >= 0);
});

test("withProgressPhase: emits failed and preserves the action error", async () => {
  const events: ProgressEvent[] = [];
  const failure = new Error("navigation failed");

  await assert.rejects(
    withProgressPhase(
      (event) => events.push(event),
      { phase: "viewport", url: "https://example.com", breakpoint: 390 },
      () => {
        throw failure;
      },
    ),
    (error) => error === failure,
  );

  assert.deepEqual(
    events.map((event) => `${event.phase}.${event.status}`),
    ["viewport.started", "viewport.failed"],
  );
  assert.equal(events[1].error, "navigation failed");
  assert.equal(Number.isInteger(events[1].elapsedMs), true);
  assert.ok((events[1].elapsedMs ?? -1) >= 0);
});
