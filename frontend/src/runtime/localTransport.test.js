import { describe, expect, it, vi } from "vitest";
import { createLocalTransport } from "./localTransport";

const API = "http://localhost:8002/api";

function setup(reply = { status: 200, body: { ok: true } }) {
  const call = vi.fn(async () => reply);
  return { call, transport: createLocalTransport({ call }) };
}

describe("local transport: solver routes", () => {
  it.each([
    ["/cutting-plans", "cutting_plan"],
    ["/sheet-optimization", "sheet_optimization"],
    ["/tile-layout", "tile_layout"],
  ])("sends POST %s to the %s operation", async (path, op) => {
    const { call, transport } = setup();
    const payload = { parts: { 100: 1 } };

    const response = await transport.post(`${API}${path}`, payload, {
      timeout: 15000,
    });

    expect(call).toHaveBeenCalledWith(op, payload, undefined, expect.anything());
    expect(response).toMatchObject({ status: 200, data: { ok: true } });
  });

  it("answers with the body, like an axios response", async () => {
    const { transport } = setup({ status: 200, body: { optimal_board_length: 200 } });

    const { data } = await transport.post(`${API}/cutting-plans`, {});

    expect(data).toEqual({ optimal_board_length: 200 });
  });

  it("leaves the time limit generous for WebAssembly, which is slower", async () => {
    const { call, transport } = setup();

    await transport.post(`${API}/tile-layout`, {}, { timeout: 30000 });

    expect(call.mock.calls[0][3]).toEqual({ timeoutMs: 90000 });
  });

  it("works with a path-only URL as well as a full one", async () => {
    const { call, transport } = setup();

    await transport.post("/api/cutting-plans", {});

    expect(call.mock.calls[0][0]).toBe("cutting_plan");
  });
});

describe("local transport: errors", () => {
  it("fails like axios, with the status and the endpoint's detail", async () => {
    const { transport } = setup({ status: 400, body: { detail: "Too many parts" } });

    const error = await transport.post(`${API}/cutting-plans`, {}).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.response.status).toBe(400);
    expect(error.response.data).toEqual({ detail: "Too many parts" });
    expect(error.message).toContain("400");
  });

  it("keeps the validation list the form shows to the user", async () => {
    const detail = [{ type: "missing", loc: ["body", "parts"], msg: "Field required" }];
    const { transport } = setup({ status: 422, body: { detail } });

    const error = await transport.post(`${API}/cutting-plans`, {}).catch((e) => e);

    expect(error.response.data.detail).toEqual(detail);
  });

  it("passes a timeout or cancel from the solver through unchanged", async () => {
    const timeout = new Error("The calculation took longer than 90 seconds");
    const transport = createLocalTransport({ call: vi.fn().mockRejectedValue(timeout) });

    await expect(transport.post(`${API}/tile-layout`, {})).rejects.toBe(timeout);
  });

  it("says plainly when a route is not part of the demo", async () => {
    const { call, transport } = setup();

    const error = await transport.get(`${API}/admin/users`).catch((e) => e);

    expect(error.response.status).toBe(404);
    expect(error.response.data.detail).toMatch(/not available/i);
    expect(call).not.toHaveBeenCalled();
  });
});

describe("local transport: model files", () => {
  function upload(fields) {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([1, 2, 3])], "shelf.stl"));
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return form;
  }

  it("sends the file as bytes and the form fields as options", async () => {
    const { call, transport } = setup();

    await transport.post(
      `${API}/3d-cutlist`,
      upload({ units: "cm", round_precision: "2", project_name: "Shelf" }),
      { timeout: 60000 },
    );

    const [op, options, data, callOptions] = call.mock.calls[0];
    expect(op).toBe("cutlist_3d");
    expect(options).toEqual({
      filename: "shelf.stl",
      units: "cm",
      round_precision: 2,
      project_name: "Shelf",
    });
    expect([...data]).toEqual([1, 2, 3]);
    expect(callOptions).toEqual({ timeoutMs: 180000 });
  });

  it("routes STEP files to their own operation, with the defaults", async () => {
    const { call, transport } = setup();

    await transport.post(`${API}/step-cutlist`, upload({}), { timeout: 120000 });

    const [op, options] = call.mock.calls[0];
    expect(op).toBe("cutlist_step");
    expect(options).toMatchObject({ filename: "shelf.stl", units: "mm", round_precision: 1 });
  });
});

describe("local transport: catalogue", () => {
  it("asks for the chosen country and never reports 'not modified'", async () => {
    const { call, transport } = setup({ status: 200, body: { products: [] } });

    const response = await transport.get(`${API}/catalogue/`, {
      params: { country: "SE" },
      headers: { "If-None-Match": '"abc"' },
      validateStatus: (status) => status === 200 || status === 304,
    });

    expect(call.mock.calls[0].slice(0, 2)).toEqual(["catalogue", { country: "SE" }]);
    expect(response).toMatchObject({ status: 200, data: { products: [] } });
    expect(response.headers.etag).toBeUndefined();
  });

  it("works without a country", async () => {
    const { call, transport } = setup({ status: 200, body: {} });

    await transport.get(`${API}/catalogue/`);

    expect(call.mock.calls[0].slice(0, 2)).toEqual(["catalogue", {}]);
  });
});

describe("local transport: saved projects, groups and settings", () => {
  function withStore(result) {
    const call = vi.fn();
    const handle = vi.fn(async () => result);
    return { call, handle, transport: createLocalTransport({ call, handle }) };
  }

  it("answers from the local store, with the route stripped of /api and slashes", async () => {
    const { handle, transport } = withStore({ status: 200, body: [{ id: "a" }] });

    const response = await transport.get(`${API}/project-groups/`);

    expect(handle).toHaveBeenCalledWith("GET", "/project-groups", undefined);
    expect(response).toMatchObject({ status: 200, data: [{ id: "a" }] });
  });

  it("passes the request body on", async () => {
    const { handle, transport } = withStore({ status: 200, body: {} });

    await transport.put(`${API}/projects/abc`, { name: "Renamed" });

    expect(handle).toHaveBeenCalledWith("PUT", "/projects/abc", { name: "Renamed" });
  });

  it("fails like axios when the store says no", async () => {
    const { transport } = withStore({ status: 404, body: { detail: "Project not found" } });

    const error = await transport.delete(`${API}/projects/abc`).catch((e) => e);

    expect(error.response.status).toBe(404);
    expect(error.response.data).toEqual({ detail: "Project not found" });
  });

  it("turns a stored diagram into a file the caller can download", async () => {
    const { transport } = withStore({
      status: 200,
      image: "data:image/svg+xml;base64,PHN2Zy8+",
      name: "Shelves",
    });

    const response = await transport.get(`${API}/projects/abc/image`, { responseType: "blob" });

    expect(response.data).toBeInstanceOf(Blob);
    expect(response.data.type).toBe("image/svg+xml");
    expect(await response.data.text()).toBe("<svg/>");
  });

  it("does not ask the store about solver routes", async () => {
    const { call, handle, transport } = withStore({ status: 200, body: {} });
    call.mockResolvedValue({ status: 200, body: { ok: true } });

    await transport.post(`${API}/cutting-plans`, {});

    expect(handle).not.toHaveBeenCalled();
  });

  it("still says a route is not part of the demo when the store does not know it", async () => {
    const { transport } = withStore(null);

    const error = await transport.get(`${API}/admin/users`).catch((e) => e);

    expect(error.response.status).toBe(404);
    expect(error.response.data.detail).toMatch(/not available in the demo/i);
  });
});
