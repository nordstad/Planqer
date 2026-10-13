import { describe, expect, it, vi } from "vitest";
import manifest from "./manifest.json";
import { createSolverRuntime } from "./solverRuntime";

function fakePyodide(reply = JSON.stringify({ status: 200, body: { ok: true } })) {
  const callLocalApi = Object.assign(vi.fn(() => reply), { destroy: vi.fn() });
  return {
    callLocalApi,
    loadPackage: vi.fn(async () => {}),
    unpackArchive: vi.fn(),
    runPython: vi.fn((code) =>
      code.includes("getsitepackages") ? "/lib/site-packages" : undefined,
    ),
    globals: { get: vi.fn(() => callLocalApi) },
  };
}

function setup(overrides = {}) {
  const pyodide = overrides.pyodide ?? fakePyodide();
  const options = {
    loadPyodide: vi.fn(async () => pyodide),
    runtimeUrl: "/runtime/",
    bundleUrl: "/planqer.zip",
    manifest,
    fetchBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
    onProgress: vi.fn(),
    ...overrides,
  };
  delete options.pyodide;
  return { pyodide, options, runtime: createSolverRuntime(options) };
}

describe("solver runtime", () => {
  it("starts from the self-hosted runtime, never a CDN", async () => {
    const { runtime, options } = setup();

    await runtime.init();

    expect(options.loadPyodide).toHaveBeenCalledWith({ indexURL: "/runtime/" });
  });

  it("installs pydantic and pyyaml before unpacking the solvers", async () => {
    const { runtime, pyodide, options } = setup();

    await runtime.init();

    const names = pyodide.loadPackage.mock.calls[0][0];
    expect(names).toEqual(expect.arrayContaining(["pydantic", "pyyaml"]));
    expect(names).not.toEqual(expect.arrayContaining(["numpy"]));
    expect(options.fetchBytes).toHaveBeenCalledWith("/planqer.zip");
    expect(pyodide.unpackArchive).toHaveBeenCalledWith(
      new Uint8Array([1, 2, 3]),
      "zip",
      { extractDir: "/lib/site-packages" },
    );
  });

  it("reports progress through start-up", async () => {
    const { runtime, options } = setup();

    await runtime.init();

    expect(options.onProgress.mock.calls.map(([stage]) => stage)).toEqual([
      "loading-runtime",
      "loading-solvers",
      "ready",
    ]);
  });

  it("returns the parsed reply from local_api", async () => {
    const reply = JSON.stringify({ status: 422, body: { detail: "bad" } });
    const { runtime, pyodide } = setup({ pyodide: fakePyodide(reply) });

    const result = await runtime.call("cutting_plan", { parts: { 100: 1 } });

    expect(result).toEqual({ status: 422, body: { detail: "bad" } });
    expect(pyodide.callLocalApi).toHaveBeenCalledWith(
      "cutting_plan",
      JSON.stringify({ parts: { 100: 1 } }),
      undefined,
    );
    expect(pyodide.callLocalApi.destroy).toHaveBeenCalled();
  });

  it("hands file bytes to Python without encoding them as JSON", async () => {
    const { runtime, pyodide } = setup();
    const bytes = new Uint8Array([7, 8, 9]);

    await runtime.call("cutlist_step", { filename: "a.step" }, bytes);

    expect(pyodide.callLocalApi.mock.calls[0][2]).toBe(bytes);
  });

  it("starts once however many calls arrive together", async () => {
    const { runtime, options } = setup();

    await Promise.all([
      runtime.call("catalogue", {}),
      runtime.call("catalogue", {}),
    ]);

    expect(options.loadPyodide).toHaveBeenCalledTimes(1);
  });

  it("retries start-up after a failure instead of staying broken", async () => {
    const pyodide = fakePyodide();
    const loadPyodide = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue(pyodide);
    const { runtime } = setup({ pyodide, loadPyodide });

    await expect(runtime.call("catalogue", {})).rejects.toThrow("network down");
    await expect(runtime.call("catalogue", {})).resolves.toMatchObject({
      status: 200,
    });
  });

  describe("model packages", () => {
    it("are not loaded for the solvers or STEP files", async () => {
      const { runtime, pyodide } = setup();

      await runtime.call("cutting_plan", {});
      await runtime.call("cutlist_step", {}, new Uint8Array([1]));

      expect(pyodide.loadPackage).toHaveBeenCalledTimes(1);
      expect(pyodide.unpackArchive).toHaveBeenCalledTimes(1);
    });

    it("load on the first STL import, with progress", async () => {
      const { runtime, pyodide, options } = setup({
        fetchBytes: vi.fn(async () => new Uint8Array([1])),
      });

      await runtime.call("cutlist_3d", {}, new Uint8Array([5]));

      expect(pyodide.loadPackage).toHaveBeenLastCalledWith(["numpy", "scipy"]);
      const wheels = options.fetchBytes.mock.calls
        .map(([url]) => url)
        .filter((url) => url.endsWith(".whl"));
      expect(wheels).toEqual([
        "/runtime/networkx-3.7-py3-none-any.whl",
        "/runtime/trimesh-5.1.1-py3-none-any.whl",
      ]);
      expect(pyodide.unpackArchive).toHaveBeenCalledWith(
        expect.anything(),
        "wheel",
      );
      const stages = options.onProgress.mock.calls.map(([stage]) => stage);
      expect(stages.slice(-2)).toEqual([
        "loading-model-packages",
        "model-packages-ready",
      ]);
    });

    it("load only once across STL imports", async () => {
      const { runtime, pyodide } = setup();

      await Promise.all([
        runtime.call("cutlist_3d", {}, new Uint8Array([1])),
        runtime.call("cutlist_3d", {}, new Uint8Array([2])),
      ]);
      await runtime.call("cutlist_3d", {}, new Uint8Array([3]));

      const modelLoads = pyodide.loadPackage.mock.calls.filter(([names]) =>
        names.includes("scipy"),
      );
      expect(modelLoads).toHaveLength(1);
    });

    it("can be retried after a failed download", async () => {
      const { runtime, pyodide } = setup();
      pyodide.loadPackage
        .mockImplementationOnce(async () => {})
        .mockRejectedValueOnce(new Error("offline"));

      await expect(
        runtime.call("cutlist_3d", {}, new Uint8Array([1])),
      ).rejects.toThrow("offline");
      await expect(
        runtime.call("cutlist_3d", {}, new Uint8Array([1])),
      ).resolves.toMatchObject({ status: 200 });
    });
  });
});
