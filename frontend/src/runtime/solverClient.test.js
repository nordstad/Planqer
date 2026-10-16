import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SolverCancelledError,
  SolverTimeoutError,
  createSolverClient,
} from "./solverClient";

class FakeWorker {
  constructor() {
    this.posted = [];
    this.terminate = vi.fn();
  }

  postMessage(message, transfer = []) {
    this.posted.push({ message, transfer });
    if (message.type === "init" && FakeWorker.autoReady) this.emit({ type: "ready" });
  }

  emit(data) {
    this.onmessage({ data });
  }

  calls() {
    return this.posted.filter(({ message }) => message.type === "call");
  }
}

let workers;

function setup(options = {}) {
  workers = [];
  FakeWorker.autoReady = true;
  const onProgress = vi.fn();
  const client = createSolverClient({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    runtimeUrl: "/runtime/",
    bundleUrl: "/planqer.zip",
    onProgress,
    ...options,
  });
  return { client, onProgress };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("solver client", () => {
  it("creates the worker lazily and tells it where the runtime is", async () => {
    const { client } = setup();
    expect(workers).toHaveLength(0);

    const pending = client.call("catalogue", {});
    await flush();

    expect(workers).toHaveLength(1);
    expect(workers[0].posted[0].message).toEqual({
      type: "init",
      runtimeUrl: "/runtime/",
      bundleUrl: "/planqer.zip",
    });
    workers[0].emit({ id: 1, ok: true, result: { status: 200, body: {} } });
    await expect(pending).resolves.toEqual({ status: 200, body: {} });
  });

  it("transfers file bytes instead of copying them", async () => {
    const { client } = setup();
    const bytes = new Uint8Array([1, 2, 3]);

    client.call("cutlist_3d", { filename: "a.stl" }, bytes);
    await flush();

    const [{ message, transfer }] = workers[0].calls();
    expect(message.data).toBe(bytes.buffer);
    expect(transfer).toEqual([bytes.buffer]);
  });

  it("sends only the viewed bytes of a larger buffer", async () => {
    const { client } = setup();
    const view = new Uint8Array(new Uint8Array([9, 1, 2, 3]).buffer, 1, 3);

    client.call("cutlist_3d", {}, view);
    await flush();

    const sent = new Uint8Array(workers[0].calls()[0].message.data);
    expect([...sent]).toEqual([1, 2, 3]);
  });

  it("rejects with the worker's error message", async () => {
    const { client } = setup();

    const pending = client.call("catalogue", {});
    await flush();
    workers[0].emit({ id: 1, ok: false, error: "boom" });

    await expect(pending).rejects.toThrow("boom");
  });

  it("marks an operation failure for safe analytics classification", async () => {
    const { client } = setup();

    const pending = client.call("catalogue", {});
    await flush();
    workers[0].emit({ id: 1, ok: false, error: "boom" });

    await expect(pending).rejects.toMatchObject({ analyticsStage: "calculation" });
  });

  it("terminates the worker and rejects when the time limit passes", async () => {
    const { client } = setup({ timeoutMs: 5000 });

    const pending = client.call("tile_layout", {});
    const outcome = expect(pending).rejects.toBeInstanceOf(SolverTimeoutError);
    await flush();
    await vi.advanceTimersByTimeAsync(5000);

    await outcome;
    expect(workers[0].terminate).toHaveBeenCalled();
  });

  it("lets one call ask for a longer limit", async () => {
    const { client } = setup({ timeoutMs: 5000 });

    const pending = client.call("cutlist_3d", {}, undefined, { timeoutMs: 60000 });
    await flush();
    await vi.advanceTimersByTimeAsync(30000);
    expect(workers[0].terminate).not.toHaveBeenCalled();

    workers[0].emit({ id: 1, ok: true, result: { status: 200, body: {} } });
    await expect(pending).resolves.toBeDefined();
  });

  it("does not count the runtime download against the time limit", async () => {
    const { client } = setup({ timeoutMs: 5000 });
    FakeWorker.autoReady = false;

    const pending = client.call("catalogue", {});
    await vi.advanceTimersByTimeAsync(20000);
    expect(workers[0].terminate).not.toHaveBeenCalled();

    workers[0].emit({ type: "ready" });
    await flush();
    workers[0].emit({ id: 1, ok: true, result: { status: 200, body: {} } });
    await expect(pending).resolves.toBeDefined();
  });

  it("cancels on demand and starts a fresh worker for the next call", async () => {
    const { client } = setup();

    const first = client.call("tile_layout", {});
    const outcome = expect(first).rejects.toBeInstanceOf(SolverCancelledError);
    await flush();
    client.cancel();
    await outcome;

    expect(workers[0].terminate).toHaveBeenCalled();

    const second = client.call("catalogue", {});
    await flush();
    expect(workers).toHaveLength(2);
    workers[1].emit({ id: 1, ok: true, result: { status: 200, body: {} } });
    await expect(second).resolves.toBeDefined();
  });

  it("cancels through an AbortSignal", async () => {
    const { client } = setup();
    const controller = new AbortController();

    const pending = client.call("tile_layout", {}, undefined, {
      signal: controller.signal,
    });
    const outcome = expect(pending).rejects.toBeInstanceOf(SolverCancelledError);
    await flush();
    controller.abort();

    await outcome;
    expect(workers[0].terminate).toHaveBeenCalled();
  });

  it("does not start a worker for a signal that is already aborted", async () => {
    const { client } = setup();
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.call("catalogue", {}, undefined, { signal: controller.signal }),
    ).rejects.toBeInstanceOf(SolverCancelledError);
    expect(workers).toHaveLength(0);
  });

  it("can be cancelled while the runtime is still loading", async () => {
    const { client } = setup();
    FakeWorker.autoReady = false;

    const pending = client.call("catalogue", {});
    const outcome = expect(pending).rejects.toBeInstanceOf(SolverCancelledError);
    await flush();
    client.cancel();

    await outcome;
    expect(workers[0].calls()).toHaveLength(0);
  });

  it("rejects when the runtime fails to start, then tries again next time", async () => {
    const { client } = setup();
    FakeWorker.autoReady = false;

    const first = client.call("catalogue", {});
    const outcome = expect(first).rejects.toThrow("network down");
    await flush();
    workers[0].emit({ type: "init-failed", error: "network down" });
    await outcome;

    FakeWorker.autoReady = true;
    const second = client.call("catalogue", {});
    await flush();
    expect(workers).toHaveLength(2);
    workers[1].emit({ id: 1, ok: true, result: { status: 200, body: {} } });
    await expect(second).resolves.toBeDefined();
  });

  it("marks an initialization failure for safe analytics classification", async () => {
    const { client } = setup();
    FakeWorker.autoReady = false;

    const pending = client.call("catalogue", {});
    await flush();
    workers[0].emit({ type: "init-failed", error: "network down" });

    await expect(pending).rejects.toMatchObject({ analyticsStage: "initialization" });
  });

  it("rejects when the worker crashes", async () => {
    const { client } = setup();

    const pending = client.call("catalogue", {});
    const outcome = expect(pending).rejects.toThrow("out of memory");
    await flush();
    workers[0].onerror({ message: "out of memory" });

    await outcome;
    expect(workers[0].terminate).toHaveBeenCalled();
  });

  it("marks a worker crash for safe analytics classification", async () => {
    const { client } = setup();

    const pending = client.call("catalogue", {});
    await flush();
    workers[0].onerror({ message: "out of memory" });

    await expect(pending).rejects.toMatchObject({ analyticsStage: "worker" });
  });

  it("reports progress while a slow job runs, and stops when it ends", async () => {
    const { client, onProgress } = setup();

    const pending = client.call("tile_layout", {});
    await flush();
    await vi.advanceTimersByTimeAsync(3000);

    const ticks = onProgress.mock.calls.filter(([stage]) => stage === "solving");
    expect(ticks.map(([, detail]) => detail.elapsedMs)).toEqual([1000, 2000, 3000]);

    workers[0].emit({ id: 1, ok: true, result: { status: 200, body: {} } });
    await pending;
    onProgress.mockClear();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("passes the worker's start-up progress on", async () => {
    const { client, onProgress } = setup();

    client.call("catalogue", {});
    await flush();
    workers[0].emit({ type: "progress", stage: "loading-runtime" });

    expect(onProgress).toHaveBeenCalledWith("loading-runtime");
  });
});
