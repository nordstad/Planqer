// Export and import of everything Lite keeps in this browser, as one
// versioned JSON file. It works on the same small db interface as the store, so
// it is tested against memoryDb.js and runs on IndexedDB.
//
// Import merges: records in the file are written over records with the same id,
// and everything else in the browser stays. All import writes commit together
// or roll back together. Records and group references are checked before writing.
// Conflict confirmation and preview freshness are separate concerns.
//
// A backup from a self-hosted server (`partsible backup`) is a SQLite archive and
// is not importable here.

import { STORES } from "./indexedDb";
import { solverCall } from "./solver";

export const BACKUP_FORMAT = 1;
const APP = "partsible-lite";

// `code` is for the UI to translate; the message is only for developers.
export class BackupError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "BackupError";
    this.code = code;
  }
}

export async function exportBackup(db, { now = new Date(), appVersion = null } = {}) {
  const stores = {};
  for (const store of STORES) stores[store] = await db.list(store);
  return {
    app: APP,
    format: BACKUP_FORMAT,
    exported_at: now.toISOString(),
    app_version: appVersion,
    stores,
  };
}

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function parse(content) {
  if (typeof content !== "string") return content;
  try {
    return JSON.parse(content);
  } catch {
    throw new BackupError("notBackup", "The file is not JSON");
  }
}

function validate(backup) {
  if (!isRecord(backup) || backup.app !== APP || !isRecord(backup.stores)) {
    throw new BackupError("notBackup", "Not a Partsible Lite backup");
  }
  if (Number.isInteger(backup.format) && backup.format > BACKUP_FORMAT) {
    throw new BackupError("tooNew", "Made by a newer version of Lite");
  }
  if (backup.format !== BACKUP_FORMAT) {
    throw new BackupError("invalid", "Unsupported backup format");
  }
  for (const [store, records] of Object.entries(backup.stores)) {
    if (!STORES.includes(store) || !Array.isArray(records)) {
      throw new BackupError("invalid", `Unknown store ${store}`);
    }
    const ids = new Set();
    for (const record of records) {
      if (!isRecord(record) || typeof record.id !== "string" || record.id.trim() === "") {
        throw new BackupError("invalid", `A record in ${store} has no id`);
      }
      if (ids.has(record.id)) throw new BackupError("invalid", `Duplicate id in ${store}`);
      ids.add(record.id);
    }
  }
}

export async function importBackup(db, content, call = solverCall) {
  // Own the payload across asynchronous validation: a caller cannot alter what
  // gets written after it has been checked.
  const backup = structuredClone(parse(content));
  validate(backup);

  if (Object.values(backup.stores).some((records) => records.length)) {
    const { status } = await call("backup_records", { stores: backup.stores });
    if (status !== 200) throw new BackupError("invalid", "Unsupported saved records");
  }
  const projects = ["projects", "sheet_projects", "tile_projects", "wallpaper_projects"]
    .flatMap((store) => backup.stores[store] ?? []);
  if (projects.some((record) => record.project_group_id != null)) {
    const groups = new Set([
      ...(await db.list("groups")).map((record) => record.id),
      ...(backup.stores.groups ?? []).map((record) => record.id),
    ]);
    if (projects.some((record) => record.project_group_id != null && !groups.has(record.project_group_id))) {
      throw new BackupError("invalid", "A plan refers to a missing project group");
    }
  }

  const counts = {};
  for (const [store, records] of Object.entries(backup.stores)) {
    counts[store] = records.length;
  }
  await db.putMany(backup.stores);
  return counts;
}
