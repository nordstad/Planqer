// What the solver is doing right now, for the one status bar that shows it.
// A plain store with the subscribe/get pair React's useSyncExternalStore wants;
// get() returns the same object until something changes.

const IDLE = Object.freeze({ active: false, stage: null, elapsedMs: 0 });

export function createSolverStatus() {
  let snapshot = IDLE;
  let running = 0;
  const listeners = new Set();

  function set(next) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  return {
    get: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      running += 1;
      set({ active: true, stage: snapshot.stage, elapsedMs: 0 });
    },
    progress(stage, { elapsedMs = 0 } = {}) {
      if (running > 0) set({ active: true, stage, elapsedMs });
    },
    finish() {
      running = Math.max(0, running - 1);
      if (running === 0) set(IDLE);
    },
  };
}

export const solverStatus = createSolverStatus();
