import "../i18n";

const client = { call: vi.fn(), cancel: vi.fn() };
vi.mock("./solverClient", async (importOriginal) => ({
  ...(await importOriginal()),
  createSolverClient: () => client,
}));
vi.mock("../utils/analytics", async (importOriginal) => ({
  ...(await importOriginal()),
  track: vi.fn(),
}));

let solver;
let track;
let classes;

beforeEach(async () => {
  vi.stubGlobal("Worker", class {});
  vi.resetModules();
  vi.clearAllMocks();
  solver = await import("./solver");
  classes = await import("./solverClient");
  ({ track } = await import("../utils/analytics"));
});

afterEach(() => vi.unstubAllGlobals());

const ok = { status: 200, body: {} };

it("counts a finished board calculation with a size bucket, never the parts", async () => {
  client.call.mockResolvedValue(ok);
  await solver.solverCall("cutting_plan", { parts: { 270: 4, 179: 8, 90: 16 } });
  expect(track).toHaveBeenCalledTimes(1);
  expect(track).toHaveBeenCalledWith("solve_completed", { tool: "board", size: "21-50" });
});

it("counts sheet parts by their quantity", async () => {
  client.call.mockResolvedValue(ok);
  await solver.solverCall("sheet_optimization", { parts: { a: { quantity: 3 }, b: { quantity: 4 } } });
  expect(track).toHaveBeenCalledWith("solve_completed", { tool: "sheet", size: "6-20" });
});

it("leaves the size out where there are no parts, as for tiles", async () => {
  client.call.mockResolvedValue(ok);
  await solver.solverCall("tile_layout", { room: {} });
  expect(track).toHaveBeenCalledWith("solve_completed", { tool: "tile" });
});

it("counts an imported model by its kind", async () => {
  client.call.mockResolvedValue(ok);
  await solver.solverCall("cutlist_3d", {}, new Uint8Array(1));
  await solver.solverCall("cutlist_step", {}, new Uint8Array(1));
  expect(track).toHaveBeenCalledWith("model_imported", { type: "stl" });
  expect(track).toHaveBeenCalledWith("model_imported", { type: "step" });
  expect(track).toHaveBeenCalledWith("solve_completed", { tool: "model" });
});

it("counts a rejected request as failed, without its message", async () => {
  client.call.mockResolvedValue({ status: 422, body: { detail: "secret" } });
  await solver.solverCall("cutting_plan", { parts: { 1: 1 } });
  expect(track).toHaveBeenCalledWith("solve_failed", { tool: "board", reason: "rejected" });
  expect(track).not.toHaveBeenCalledWith("solve_completed", expect.anything());
});

it("counts a timeout, but not a cancel", async () => {
  client.call.mockRejectedValueOnce(new classes.SolverTimeoutError(30000));
  await expect(solver.solverCall("cutting_plan", {})).rejects.toThrow();
  expect(track).toHaveBeenCalledWith("solve_failed", { tool: "board", reason: "timeout" });

  track.mockClear();
  client.call.mockRejectedValueOnce(new classes.SolverCancelledError());
  await expect(solver.solverCall("cutting_plan", {})).rejects.toThrow();
  expect(track).not.toHaveBeenCalled();
});

it("counts an engine that cannot start", async () => {
  client.call.mockRejectedValue(Object.assign(new Error("boom"), { analyticsStage: "calculation" }));
  await expect(solver.solverCall("tile_layout", {})).rejects.toThrow();
  expect(track).toHaveBeenCalledWith("runtime_error", {
    reason: "engine",
    tool: "tile",
    stage: "calculation",
  });
});

it("leaves the stage out when the failure did not come from the engine", async () => {
  client.call.mockRejectedValue(new Error("not classified"));
  await expect(solver.solverCall("tile_layout", {})).rejects.toThrow();
  expect(track).toHaveBeenCalledWith("runtime_error", { reason: "engine", tool: "tile" });
});

it("counts a browser that cannot run the demo", async () => {
  vi.stubGlobal("Worker", undefined);
  await expect(solver.solverCall("tile_layout", {})).rejects.toThrow();
  expect(track).toHaveBeenCalledWith("runtime_error", {
    reason: "unsupported",
    tool: "tile",
  });
});

it("ignores internal calls such as drawing a saved diagram", async () => {
  client.call.mockResolvedValue(ok);
  await solver.solverCall("saved_diagram", {});
  expect(track).not.toHaveBeenCalled();
});
