// The saved projects, groups and settings of the demo, kept in the browser.
//
// This mirrors the server's routes (routes/projects.py, sheet_projects.py,
// tile_projects.py, project_groups.py, settings.py) for a single local user.
// What a request may contain is decided by the server's own pydantic models,
// run in the worker through the `saved_request` operation, and a stored diagram
// is drawn by the `saved_diagram` operation. This file only persists and
// answers in the server's shapes. tests/parity/contract.parity.test.js holds it
// to what the real API answered for the same scripted requests.
//
// `db` has list/get/put/delete(store, ...); `call(op, payload)` is the solver's.

import { track } from "../utils/analytics";

const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";
const SETTINGS_ID = "00000000-0000-4000-8000-000000000002";
const NOT_FOUND = "Project not found";
const deleted = (what) => ({ message: `${what} deleted successfully` });

const DEFAULT_SETTINGS = {
  default_board_lengths: [3000, 3600, 5000],
  default_saw_blade_width: 3,
  default_currency: "SEK",
  default_vat_rate: 25,
  default_prices_include_vat: true,
  preferred_algorithm: "auto",
  preferred_units: "mm",
  preferred_language: null,
  spare_margin_percent: 10,
  catalogue_country: "auto",
};
const LEGACY_BOARD_LENGTHS = [300, 360, 500];

// Python's idea of "has a value": null, 0, "", [] and {} are all empty. The
// server stores nothing for an empty price list or plan, so the browser must too.
const filled = (value) =>
  value !== null &&
  value !== undefined &&
  value !== false &&
  value !== 0 &&
  value !== "" &&
  !(Array.isArray(value) && value.length === 0) &&
  !(typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0);
const orNull = (value) => (filled(value) ? value : null);

const sent = (values, field) => Object.hasOwn(values, field);
const given = (values, field) => sent(values, field) && values[field] !== null;

// For each kind of project: where it lives, what the server calls it when it is
// missing, how a new one is built from validated values, how an edit applies,
// and how its diagram is drawn.
const PROJECT_KINDS = {
  board: {
    path: "/projects",
    store: "projects",
    missing: NOT_FOUND,
    deleted: "Project",
    label: "cutlist",
    fromValues: (v) => ({
      project_group_id: v.project_group_id,
      name: v.name,
      parts_data: v.parts_data,
      board_lengths: v.board_lengths,
      saw_blade_width: v.saw_blade_width,
      material_type: v.material_type || v.product?.name || "",
      board_thickness: v.board_thickness,
      board_width: v.board_width,
      board_costs: orNull(v.board_costs),
      product: v.product ?? null,
      optimization_result: v.optimization_result,
    }),
    edit: (record, v) => {
      for (const field of [
        "name", "parts_data", "board_lengths", "saw_blade_width", "material_type",
        "board_thickness", "board_width", "optimization_result",
      ]) {
        if (given(v, field)) record[field] = v[field];
      }
      if (sent(v, "project_group_id")) record.project_group_id = v.project_group_id;
      if (sent(v, "board_costs")) record.board_costs = orNull(v.board_costs);
      if (sent(v, "product")) record.product = v.product ?? null;
    },
    // A rename or a change to the plan or the kerf changes the diagram; other
    // edits keep the stored one.
    redraws: (v) => given(v, "name") || given(v, "saw_blade_width") || given(v, "optimization_result"),
    diagram: (record, v) => ({
      kind: "board",
      name: record.name,
      saw_blade_width: record.saw_blade_width,
      optimization_result: given(v, "optimization_result")
        ? v.optimization_result
        : record.optimization_result ?? {},
    }),
  },
  sheet: {
    path: "/sheet-projects",
    store: "sheet_projects",
    missing: "Sheet project not found",
    deleted: "Sheet project",
    label: "sheet layout",
    fromValues: (v) => ({
      project_group_id: v.project_group_id,
      name: v.name,
      parts_data: v.parts_data,
      sheet_width: v.sheet_width,
      sheet_height: v.sheet_height,
      kerf_width: v.kerf_width,
      material_type: v.material_type,
      sheet_thickness: v.sheet_thickness,
      algorithm: v.algorithm ?? null,
      allow_rotation: v.allow_rotation,
      pricing: orNull(v.pricing),
      product: v.product ?? null,
      optimization_result: orNull(v.optimization_result),
    }),
    edit: (record, v) => {
      for (const field of [
        "name", "parts_data", "sheet_width", "sheet_height", "kerf_width",
        "material_type", "sheet_thickness", "allow_rotation", "optimization_result",
      ]) {
        if (given(v, field)) record[field] = v[field];
      }
      if (sent(v, "project_group_id")) record.project_group_id = v.project_group_id;
      if (sent(v, "algorithm")) record.algorithm = v.algorithm ?? null;
      if (sent(v, "pricing")) record.pricing = orNull(v.pricing);
      if (sent(v, "product")) record.product = v.product ?? null;
    },
    redraws: () => true,
    diagram: (record, v) => ({
      kind: "sheet",
      name: record.name,
      optimization_result: given(v, "optimization_result")
        ? v.optimization_result
        : record.optimization_result,
    }),
  },
  tile: {
    path: "/tile-projects",
    store: "tile_projects",
    missing: "Tile project not found",
    deleted: "Tile project",
    label: "tile layout",
    fromValues: (v) => ({
      project_group_id: v.project_group_id,
      name: v.name,
      surface_data: v.surface_data,
      tile_data: v.tile_data,
      bond_data: v.bond_data,
      options_data: v.options_data || {},
      layout_result: orNull(v.layout_result),
      pricing: orNull(v.pricing),
    }),
    edit: (record, v) => {
      for (const field of [
        "name", "surface_data", "tile_data", "bond_data", "options_data", "layout_result",
      ]) {
        if (given(v, field)) record[field] = v[field];
      }
      if (sent(v, "project_group_id")) record.project_group_id = v.project_group_id;
      if (sent(v, "pricing")) record.pricing = orNull(v.pricing);
    },
    redraws: () => true,
    diagram: (record) => ({
      kind: "tile",
      name: record.name,
      surface_data: record.surface_data,
      layout_result: record.layout_result,
    }),
  },
};

const byNewest = (a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0);

const reply = (status, body) => ({ status, body });
const fail = (status, detail) => reply(status, { detail });

export function createLocalApi({
  db,
  call,
  newId = () => globalThis.crypto.randomUUID(),
  clock = () => Date.now(),
}) {
  // Strictly increasing, so "most recently changed first" has no ties.
  let lastTick = 0;
  const now = () => {
    lastTick = Math.max(clock(), lastTick + 1);
    return new Date(lastTick).toISOString();
  };

  // Validate what the user wants to save, with the server's own models.
  async function validated(kind, mode, body) {
    const { status, body: result } = await call("saved_request", { kind, mode, body: body ?? {} });
    return status === 200 ? { values: result.values } : { error: reply(status, result) };
  }

  async function drawn(payload) {
    const { status, body } = await call("saved_diagram", payload);
    return status === 200 ? body.image : null;
  }

  async function checkGroup(groupId) {
    if (groupId === null || groupId === undefined) return null;
    return (await db.get("groups", groupId)) ? null : fail(404, NOT_FOUND);
  }

  /* ── settings ── */

  async function settings(method, body) {
    let record = await db.get("settings", SETTINGS_ID);
    if (!record) {
      record = { id: SETTINGS_ID, user_id: LOCAL_USER_ID, ...DEFAULT_SETTINGS };
    }
    if (method === "PUT") {
      const { values, error } = await validated("settings", "update", body);
      if (error) return error;
      for (const [field, value] of Object.entries(values)) {
        if (value !== null) record[field] = value;
      }
    }
    if (JSON.stringify(record.default_board_lengths) === JSON.stringify(LEGACY_BOARD_LENGTHS)) {
      record.default_board_lengths = [...DEFAULT_SETTINGS.default_board_lengths];
    }
    await db.put("settings", record);
    return reply(200, record);
  }

  /* ── project groups ── */

  const groupOf = (record) => record;

  async function groups(method, id, body) {
    if (method === "GET" && !id) {
      return reply(200, (await db.list("groups")).sort(byNewest).map(groupOf));
    }
    if (method === "POST") {
      const { values, error } = await validated("group", "create", body);
      if (error) return error;
      const stamp = now();
      const record = {
        id: newId(),
        name: values.name,
        created_at: stamp,
        updated_at: stamp,
        spare_margin_percent: values.spare_margin_percent ?? null,
      };
      await db.put("groups", record);
      return reply(200, record);
    }

    const record = await db.get("groups", id);
    if (!record) return fail(404, NOT_FOUND);

    if (method === "PUT") {
      const { values, error } = await validated("group", "update", body);
      if (error) return error;
      record.name = values.name;
      if (sent(values, "spare_margin_percent")) record.spare_margin_percent = values.spare_margin_percent;
      record.updated_at = now();
      await db.put("groups", record);
      return reply(200, record);
    }

    if (method === "DELETE") {
      // Its cutlists go with it, as on the server.
      for (const { store } of Object.values(PROJECT_KINDS)) {
        for (const project of await db.list(store)) {
          if (project.project_group_id === id) await db.delete(store, project.id);
        }
      }
      await db.delete("groups", id);
      return reply(200, deleted("Project"));
    }
    return null;
  }

  /* ── projects (board, sheet and tile share one shape of route) ── */

  async function projects(kind, method, id, isImage, body) {
    const spec = PROJECT_KINDS[kind];

    if (!id) {
      if (method === "GET") {
        return reply(200, (await db.list(spec.store)).sort(byNewest));
      }
      if (method !== "POST") return null;
      const { values, error } = await validated(kind, "create", body);
      if (error) return error;
      const missingGroup = await checkGroup(values.project_group_id);
      if (missingGroup) return missingGroup;
      const record = { id: newId(), ...spec.fromValues(values) };
      record.cutlist_image = await drawn(spec.diagram(record, values));
      record.has_svg_image = Boolean(record.cutlist_image);
      record.created_at = record.updated_at = now();
      await db.put(spec.store, record);
      track("project_saved", { tool: kind });
      return reply(200, record);
    }

    if (isImage && method !== "GET") return null;
    const record = await db.get(spec.store, id);
    if (!record) return fail(404, spec.missing);

    if (isImage) return image(record, spec);
    if (method === "GET") return reply(200, record);

    if (method === "PUT") {
      const { values, error } = await validated(kind, "update", body);
      if (error) return error;
      const missingGroup = await checkGroup(values.project_group_id);
      if (missingGroup) return missingGroup;
      spec.edit(record, values);
      if (spec.redraws(values)) {
        record.cutlist_image = await drawn(spec.diagram(record, values));
        record.has_svg_image = Boolean(record.cutlist_image);
      }
      record.updated_at = now();
      await db.put(spec.store, record);
      return reply(200, record);
    }

    if (method === "DELETE") {
      await db.delete(spec.store, id);
      return reply(200, deleted(spec.deleted));
    }
    return null;
  }

  // The diagram as the data URL it is stored as; the transport turns it into a
  // file. Only the stored kinds (SVG, or PNG) are served.
  function image(record, spec) {
    const stored = record.cutlist_image;
    if (!stored || !stored.trim()) {
      return fail(404, `No diagram was saved with this ${spec.label}`);
    }
    if (!/^data:image\/(svg\+xml|png);base64,/.test(stored)) {
      return fail(422, `Saved ${spec.label} image is not a supported image`);
    }
    return { status: 200, image: stored, name: record.name };
  }

  /* ── the user's own catalogue entries ── */

  // A stored entry is keyed by its product id; `id` is the key the store and
  // the backup use, the rest is what the server keeps per product.
  const entryOf = ({ product_id, hidden, data }) => ({ product_id, hidden, data });

  async function entries() {
    return (await db.list("catalogue_entries")).map(entryOf);
  }

  const CATALOGUE_ACTIONS = {
    "GET ": "list",
    "POST ": "add",
    "PUT id": "update",
    "POST id/hide": "hide",
    "POST id/restore": "restore",
    "GET id/suggestion": "suggest",
    "DELETE id": "reset",
  };
  const CATALOGUE_STATUS = { add: 201, reset: 204 };

  async function catalogue(method, rest, body, params = {}) {
    const [id, tail] = rest.map(decodeURIComponent);
    const action = CATALOGUE_ACTIONS[`${method} ${id === undefined ? "" : `id${tail ? `/${tail}` : ""}`}`];
    if (!action || rest.length > 2) return null;

    const { status, body: answer } = await call("catalogue_admin", {
      action,
      catalogue: params.catalogue,
      entries: await entries(),
      product_id: id,
      body,
      source: params.source,
      country: params.country,
    });
    if (status !== 200) return reply(status, answer);

    const { change } = answer;
    if (change?.put) await db.put("catalogue_entries", { id: change.put.product_id, ...change.put });
    if (change?.delete) await db.delete("catalogue_entries", change.delete);
    return reply(CATALOGUE_STATUS[action] ?? 200, answer.result);
  }

  /* ── routing ── */

  // Answers a request, or returns null when this is not one of its routes.
  async function handle(method, path, body, config) {
    const parts = path.split("/").filter(Boolean);
    const [resource, id, tail] = parts;

    if (resource === "admin" && id === "catalogue") {
      return catalogue(method, parts.slice(2), body, config?.params);
    }

    if (resource === "settings" && parts.length === 1) {
      return method === "GET" || method === "PUT" ? settings(method, body) : null;
    }
    if (resource === "project-groups" && parts.length <= 2) {
      return groups(method, id, body);
    }
    const kind = Object.keys(PROJECT_KINDS).find((k) => PROJECT_KINDS[k].path === `/${resource}`);
    if (kind && parts.length <= 3 && (tail === undefined || tail === "image")) {
      return projects(kind, method, id, tail === "image", body);
    }
    return null;
  }

  return { handle, entries };
}
