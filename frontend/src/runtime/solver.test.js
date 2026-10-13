const client = { call: vi.fn(), cancel: vi.fn() };
let options;
vi.mock("./solverClient", () => ({
  createSolverClient: (given) => {
    options = given;
    return client;
  },
}));

let solver;
let solverStatus;

beforeEach(async () => {
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
  await expect(solver.solverCall("cutting_plan", {})).rejects.toThrow("boom");
  expect(solverStatus.get().active).toBe(false);
});

it("cancels the running calculation", async () => {
  client.call.mockResolvedValue({});
  await solver.solverCall("cutting_plan", {});
  solver.cancelSolver();
  expect(client.cancel).toHaveBeenCalled();
});
