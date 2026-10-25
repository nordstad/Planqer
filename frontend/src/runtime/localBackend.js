// The demo's whole backend in the browser: the solver worker plus the local
// store. api.js in static mode reaches it through the local transport.

import { version as appVersion } from "../../package.json";
import { exportBackup, importBackup } from "./backup";
import { createLocalApi } from "./localApi";
import { openDatabase } from "./indexedDb";
import { solverCall } from "./solver";

let database = null;
let api = null;

const db = () => {
  database ??= openDatabase().catch((error) => {
    database = null;
    throw error;
  });
  return database;
};

const localApi = () => {
  api ??= db()
    .then((ready) => createLocalApi({ db: ready, call: solverCall }))
    .catch((error) => {
      api = null;
      throw error;
    });
  return api;
};

export const handle = (method, path, body, config) =>
  localApi().then((ready) => ready.handle(method, path, body, config));

export const entries = () => localApi().then((ready) => ready.entries());

export const backupExport = () =>
  db().then((ready) => exportBackup(ready, { appVersion }));

export const backupImport = (content) => db().then((ready) => importBackup(ready, content));

// Plans and the projects that hold them; settings alone are not worth a reminder.
export const hasSavedWork = async () => {
  const ready = await db();
  const lists = await Promise.all(
    ["projects", "sheet_projects", "tile_projects", "wallpaper_projects", "groups"].map((store) => ready.list(store)),
  );
  return lists.some((records) => records.length > 0);
};
