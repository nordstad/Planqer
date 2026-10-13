// Main-thread side of the solver worker. It owns the time limit and cancel:
// the server's 30 second limit and async task API do not exist in the browser,
// and a Web Worker cannot be interrupted, so the only way to stop a solve is
// to terminate the worker. A new one is created on the next call. If more than
// one call is in flight, they all fail together when that happens.

export class SolverTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`The calculation took longer than ${timeoutMs / 1000} seconds`);
    this.name = "SolverTimeoutError";
  }
}

export class SolverCancelledError extends Error {
  constructor() {
    super("The calculation was cancelled");
    this.name = "SolverCancelledError";
  }
}

const PROGRESS_INTERVAL_MS = 1000;

function transferable(data) {
  const whole =
    data.byteOffset === 0 && data.byteLength === data.buffer.byteLength;
  return whole ? data.buffer : data.slice().buffer;
}

export function createSolverClient({
  createWorker,
  runtimeUrl,
  bundleUrl,
  timeoutMs = 30000,
  onProgress = () => {},
}) {
  let session = null;

  function stop(entry) {
    clearTimeout(entry.timer);
    clearInterval(entry.ticker);
  }

  function fail(current, error) {
    if (session === current) session = null;
    current.worker.terminate();
    current.rejectReady(error);
    for (const entry of current.pending.values()) {
      stop(entry);
      entry.reject(error);
    }
    current.pending.clear();
  }

  function receive(current, message) {
    if (message.type === "progress") {
      onProgress(message.stage);
    } else if (message.type === "ready") {
      current.resolveReady();
    } else if (message.type === "init-failed") {
      fail(current, new Error(message.error));
    } else if (current.pending.has(message.id)) {
      const entry = current.pending.get(message.id);
      current.pending.delete(message.id);
      stop(entry);
      if (message.ok) entry.resolve(message.result);
      else entry.reject(new Error(message.error));
    }
  }

  function open() {
    if (session) return session;
    const current = { worker: createWorker(), pending: new Map(), nextId: 1 };
    current.ready = new Promise((resolve, reject) => {
      current.resolveReady = resolve;
      current.rejectReady = reject;
    });
    current.ready.catch(() => {});
    current.worker.onmessage = ({ data }) => receive(current, data);
    current.worker.onerror = (event) =>
      fail(current, new Error(event.message || "The solver stopped working"));
    current.worker.onmessageerror = () =>
      fail(current, new Error("The solver sent an unreadable reply"));
    session = current;
    current.worker.postMessage({ type: "init", runtimeUrl, bundleUrl });
    return current;
  }

  async function call(op, payload, data, options = {}) {
    const { timeoutMs: limit = timeoutMs, signal } = options;
    if (signal?.aborted) throw new SolverCancelledError();

    const current = open();
    const abort = () => fail(current, new SolverCancelledError());
    signal?.addEventListener("abort", abort, { once: true });
    try {
      await current.ready;
      if (session !== current) throw new SolverCancelledError();

      // The limit covers the calculation, not the one-off runtime download.
      return await new Promise((resolve, reject) => {
        const id = current.nextId++;
        const startedAt = Date.now();
        const entry = { resolve, reject };
        entry.timer = setTimeout(
          () => fail(current, new SolverTimeoutError(limit)),
          limit,
        );
        entry.ticker = setInterval(
          () => onProgress("solving", { elapsedMs: Date.now() - startedAt }),
          PROGRESS_INTERVAL_MS,
        );
        current.pending.set(id, entry);
        const buffer = data ? transferable(data) : undefined;
        current.worker.postMessage(
          { type: "call", id, op, payload, data: buffer },
          buffer ? [buffer] : [],
        );
      });
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  function cancel() {
    if (session) fail(session, new SolverCancelledError());
  }

  return { call, cancel };
}
