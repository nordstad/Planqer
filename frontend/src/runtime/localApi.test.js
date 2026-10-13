import { describe, expect, it, vi } from "vitest";
import { createLocalApi } from "./localApi";
import { createMemoryDb } from "./memoryDb";

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
