import { createSolverStatus } from "./solverStatus";

it("is idle until a call starts", () => {
  const status = createSolverStatus();
  expect(status.get()).toEqual({ active: false, stage: null, elapsedMs: 0 });
});

it("follows the worker's stages while a call is running", () => {
  const status = createSolverStatus();
  status.start();
  status.progress("loading-runtime");
  expect(status.get()).toMatchObject({ active: true, stage: "loading-runtime" });
  status.progress("solving", { elapsedMs: 3000 });
  expect(status.get()).toEqual({ active: true, stage: "solving", elapsedMs: 3000 });
});

it("stays active until every overlapping call has finished", () => {
  const status = createSolverStatus();
  status.start();
  status.start();
  status.finish();
  expect(status.get().active).toBe(true);
  status.finish();
  expect(status.get()).toEqual({ active: false, stage: null, elapsedMs: 0 });
});

it("tells subscribers about changes and stops after unsubscribe", () => {
  const status = createSolverStatus();
  const seen = vi.fn();
  const unsubscribe = status.subscribe(seen);
  status.start();
  expect(seen).toHaveBeenCalledTimes(1);
  unsubscribe();
  status.finish();
  expect(seen).toHaveBeenCalledTimes(1);
});

it("returns the same snapshot until something changes, as React requires", () => {
  const status = createSolverStatus();
  expect(status.get()).toBe(status.get());
});
