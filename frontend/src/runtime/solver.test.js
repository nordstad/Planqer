import "../i18n";
const client = { call: vi.fn(), cancel: vi.fn() };
let options;
vi.mock("./solverClient", async (importOriginal) => ({
  ...(await importOriginal()),
  createSolverClient: (given) => {
    options = given;
    return client;
  },
}));

let solver;
let solverStatus;

afterEach(() => vi.unstubAllGlobals());

beforeEach(async () => {
  vi.stubGlobal("Worker", class {});
  vi.resetModules();
  vi.clearAllMocks();
  solver = await import("./solver");
  ({ solverStatus } = await import("./solverStatus"));
});

it("is busy while a call runs and idle again after it succeeds", async () => {
  let finish;
  client.call.mockReturnValue(new Promise((resolve) => (finish = resolve)));

  const pending = solver.solverCall("cutting_plan", {});
  expect(solverStatus.get().active).toBe(true);

  options.onProgress("loading-runtime");
  expect(solverStatus.get().stage).toBe("loading-runtime");

  finish({ status: 200, body: {} });
  await pending;
  expect(solverStatus.get().active).toBe(false);
});

it("is idle again after a call fails", async () => {
  client.call.mockRejectedValue(new Error("boom"));
  await expect(solver.solverCall("cutting_plan", {})).rejects.toThrow(/could not start/i);
  expect(solverStatus.get().active).toBe(false);
});

it("cancels the running calculation", async () => {
  client.call.mockResolvedValue({});
  await solver.solverCall("cutting_plan", {});
  solver.cancelSolver();
  expect(client.cancel).toHaveBeenCalled();
});

describe("errors the user can read", () => {
  let classes;
  beforeEach(async () => {
    classes = await import("./solverClient");
  });

  it("says a cancelled calculation was cancelled, in the chosen language", async () => {
    client.call.mockRejectedValue(new classes.SolverCancelledError());
    await expect(solver.solverCall("cutting_plan", {})).rejects.toThrow("Cancelled");
  });

  it("says how long a timed out calculation ran", async () => {
    client.call.mockRejectedValue(new classes.SolverTimeoutError(90000));
    await expect(solver.solverCall("cutting_plan", {})).rejects.toThrow(/90 seconds/);
  });

  it("does not show an engine failure's English text", async () => {
    client.call.mockRejectedValue(new Error("Pyodide init blew up at 0x1f"));
    await expect(solver.solverCall("cutting_plan", {})).rejects.toThrow(/could not start/i);
  });

  it("explains a browser without WebAssembly or workers", async () => {
    vi.stubGlobal("Worker", undefined);
    await expect(solver.solverCall("cutting_plan", {})).rejects.toThrow(/WebAssembly/);
    expect(client.call).not.toHaveBeenCalled();
  });
});
