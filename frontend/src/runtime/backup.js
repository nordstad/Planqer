// Export and import of everything the demo keeps in this browser, as one
// versioned JSON file. It works on the same small db interface as the store, so
// it is tested against memoryDb.js and runs on IndexedDB.
//
// Import merges: records in the file are written over records with the same id,
// and everything else in the browser stays. A restore can therefore never
// delete work. The whole file is checked before anything is written.
//
// A backup from a self-hosted server (`planqer backup`) is a SQLite archive and
// is not importable here.

import { STORES } from "./indexedDb";

export const BACKUP_FORMAT = 1;
const APP = "planqer-demo";

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
    throw new BackupError("notBackup", "Not a Planqer demo backup");
  }
  if (typeof backup.format !== "number" || backup.format > BACKUP_FORMAT) {
    throw new BackupError("tooNew", "Made by a newer version of the demo");
  }
  for (const [store, records] of Object.entries(backup.stores)) {
    if (!STORES.includes(store) || !Array.isArray(records)) {
      throw new BackupError("invalid", `Unknown store ${store}`);
    }
    for (const record of records) {
      if (!isRecord(record) || typeof record.id !== "string" || record.id === "") {
        throw new BackupError("invalid", `A record in ${store} has no id`);
      }
    }
  }
}

export async function importBackup(db, content) {
  const backup = parse(content);
  validate(backup);

  const counts = {};
  for (const [store, records] of Object.entries(backup.stores)) {
    for (const record of records) await db.put(store, record);
    counts[store] = records.length;
  }
  return counts;
}
