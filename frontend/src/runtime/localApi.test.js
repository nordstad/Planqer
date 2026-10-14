import { describe, expect, it, vi } from "vitest";
import { createLocalApi } from "./localApi";
import { createMemoryDb } from "./memoryDb";
import { track } from "../utils/analytics";

vi.mock("../utils/analytics", () => ({ track: vi.fn() }));

// The save rules and diagrams run in Python; the real ones are exercised by
// tests/parity/contract.parity.test.js. Here they are stood in for.
function setup({ image = "data:image/svg+xml;base64,PHN2Zy8+" } = {}) {
  const call = vi.fn(async (op, payload) =>
    op === "saved_request"
      ? { status: 200, body: { values: payload.body } }
      : { status: 200, body: { image } },
  );
  let counter = 0;
  const api = createLocalApi({
    db: createMemoryDb(),
    call,
    newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    clock: () => 1_700_000_000_000,
  });
  return { api, call };
}

describe("local api routing", () => {
  it.each([
    ["GET", "/admin/users"],
    ["GET", "/auth/me"],
    ["POST", "/cutting-plans"],
    ["DELETE", "/settings"],
    ["POST", "/projects/abc/image"],
  ])("leaves %s %s to someone else", async (method, path) => {
    const { api } = setup();

    expect(await api.handle(method, path)).toBeNull();
  });
});

describe("local api timestamps", () => {
  it("never ties, even when the clock does not move", async () => {
    const { api } = setup();

    const first = (await api.handle("POST", "/project-groups", { name: "A" })).body;
    const second = (await api.handle("POST", "/project-groups", { name: "B" })).body;
    const list = (await api.handle("GET", "/project-groups")).body;

    expect(second.updated_at > first.updated_at).toBe(true);
    expect(list.map((group) => group.name)).toEqual(["B", "A"]);
  });
});

describe("local api images", () => {
  it("hands back the stored data URL for the transport to turn into a file", async () => {
    const { api } = setup();
    const project = (
      await api.handle("POST", "/projects", {
        name: "Shelves", parts_data: {}, board_lengths: [], saw_blade_width: 3, optimization_result: {},
      })
    ).body;

    const reply = await api.handle("GET", `/projects/${project.id}/image`);

    expect(reply).toEqual({
      status: 200,
      image: "data:image/svg+xml;base64,PHN2Zy8+",
      name: "Shelves",
    });
  });

  it("says so when nothing was drawn", async () => {
    const { api } = setup({ image: null });
    const project = (
      await api.handle("POST", "/projects", { name: "Plain", optimization_result: {} })
    ).body;

    const reply = await api.handle("GET", `/projects/${project.id}/image`);

    expect(reply.status).toBe(404);
    expect(reply.body.detail).toBe("No diagram was saved with this cutlist");
  });
});

describe("local api validation", () => {
  it("returns the server's own validation error untouched", async () => {
    const detail = [{ type: "missing", loc: ["body", "name"], msg: "Field required" }];
    const call = vi.fn(async () => ({ status: 422, body: { detail } }));
    const api = createLocalApi({ db: createMemoryDb(), call });

    const reply = await api.handle("POST", "/projects", {});

    expect(reply).toEqual({ status: 422, body: { detail } });
  });
});

describe("memory db", () => {
  it("copies records, as IndexedDB does", async () => {
    const db = createMemoryDb();
    const record = { id: "a", list: [1] };

    await db.put("things", record);
    record.list.push(2);
    const stored = await db.get("things", "a");
    stored.list.push(3);

    expect((await db.get("things", "a")).list).toEqual([1]);
  });
});

describe("local api: the user's own catalogue entries", () => {
  // The rules run in Python (tests/test_local_api_catalogue_admin.py holds them
  // to the server). Here the operation is stood in for, keeping what matters:
  // what it is asked, and what the browser does with the change it returns.
  function catalogueSetup(answer) {
    const call = vi.fn(async (op, payload) => {
      if (op === "catalogue_admin") return answer(payload);
      return { status: 200, body: { values: payload.body } };
    });
    const api = createLocalApi({ db: createMemoryDb(), call });
    return { api, call };
  }

  const put = (product_id, extra = {}) => ({
    status: 200,
    body: { result: { product: { id: product_id } }, change: { put: { product_id, hidden: false, data: "{}", ...extra } } },
  });

  it("lists with the catalogue being edited and the stored entries", async () => {
    const { api, call } = catalogueSetup(() => ({ status: 200, body: { result: [], change: null } }));

    const reply = await api.handle("GET", "/admin/catalogue", undefined, { params: { catalogue: "NO" } });

    expect(reply).toEqual({ status: 200, body: [] });
    expect(call).toHaveBeenCalledWith("catalogue_admin", { action: "list", catalogue: "NO", entries: [] });
  });

  it("answers 201 for a new entry and keeps what the operation says to keep", async () => {
    const { api } = catalogueSetup(() => put("local:regel:48x98"));

    const reply = await api.handle("POST", "/admin/catalogue", { type: "regel" });

    expect(reply.status).toBe(201);
    expect(await api.entries()).toEqual([{ product_id: "local:regel:48x98", hidden: false, data: "{}" }]);
  });

  it("sends the stored entries with the next request", async () => {
    const { api, call } = catalogueSetup((payload) =>
      payload.action === "add" ? put("local:regel:48x98") : { status: 200, body: { result: [], change: null } },
    );
    await api.handle("POST", "/admin/catalogue", { type: "regel" });
    await api.handle("GET", "/admin/catalogue");

    expect(call).toHaveBeenLastCalledWith("catalogue_admin", {
      action: "list",
      entries: [{ product_id: "local:regel:48x98", hidden: false, data: "{}" }],
    });
  });

  it.each([
    ["PUT", "/admin/catalogue/se%3Aregel%3A45x95", "update", { lengths: [2400] }],
    ["POST", "/admin/catalogue/se%3Aregel%3A45x95/hide", "hide", undefined],
    ["POST", "/admin/catalogue/se%3Aregel%3A45x95/restore", "restore", undefined],
  ])("reads the product id out of %s %s", async (method, path, action, body) => {
    const { api, call } = catalogueSetup(() => put("se:regel:45x95"));

    const reply = await api.handle(method, path, body);

    expect(reply.status).toBe(200);
    expect(call).toHaveBeenCalledWith(
      "catalogue_admin",
      expect.objectContaining({ action, product_id: "se:regel:45x95", ...(body ? { body } : {}) }),
    );
  });

  it("passes the suggestion's source and country along", async () => {
    const { api, call } = catalogueSetup(() => ({ status: 200, body: { result: { url: "u" }, change: null } }));

    const reply = await api.handle("GET", "/admin/catalogue/se%3Aregel%3A45x95/suggestion", undefined, {
      params: { catalogue: "SE", source: "https://example.com", country: "SE" },
    });

    expect(reply.body).toEqual({ url: "u" });
    expect(call).toHaveBeenCalledWith("catalogue_admin", expect.objectContaining({
      action: "suggest", catalogue: "SE", source: "https://example.com", country: "SE",
    }));
  });

  it("answers 204 and forgets the entry on reset", async () => {
    const { api } = catalogueSetup((payload) =>
      payload.action === "reset"
        ? { status: 200, body: { result: null, change: { delete: "local:regel:48x98" } } }
        : put("local:regel:48x98"),
    );
    await api.handle("POST", "/admin/catalogue", {});

    const reply = await api.handle("DELETE", "/admin/catalogue/local%3Aregel%3A48x98");

    expect(reply).toEqual({ status: 204, body: null });
    expect(await api.entries()).toEqual([]);
  });

  it("passes a refusal through and stores nothing", async () => {
    const { api } = catalogueSetup(() => ({ status: 409, body: { detail: "This product already exists; edit it instead" } }));

    const reply = await api.handle("POST", "/admin/catalogue", {});

    expect(reply).toEqual({ status: 409, body: { detail: "This product already exists; edit it instead" } });
    expect(await api.entries()).toEqual([]);
  });

  it("keeps a hidden built-in hidden across reads", async () => {
    const { api } = catalogueSetup(() => put("se:regel:45x95", { hidden: true, data: null }));
    await api.handle("POST", "/admin/catalogue/se%3Aregel%3A45x95/hide");
    expect(await api.entries()).toEqual([{ product_id: "se:regel:45x95", hidden: true, data: null }]);
  });
});

describe("local api analytics", () => {
  it.each([
    ["/projects", "board"],
    ["/sheet-projects", "sheet"],
    ["/tile-projects", "tile"],
  ])("counts a saved %s project by tool, nothing else", async (path, tool) => {
    const { api } = setup();
    track.mockClear();

    await api.handle("POST", path, { name: "Kitchen", optimization_result: {} });

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("project_saved", { tool });
  });

  it("does not count a rejected save", async () => {
    const { api, call } = setup();
    call.mockResolvedValueOnce({ status: 422, body: { detail: [] } });
    track.mockClear();

    await api.handle("POST", "/projects", {});

    expect(track).not.toHaveBeenCalled();
  });
});
