// The demo's whole backend in the browser: the solver worker plus the local
// store. api.js in static mode reaches it through the local transport.

import { createLocalApi } from "./localApi";
import { openDatabase } from "./indexedDb";
import { solverCall } from "./solver";

let api = null;

const localApi = () => {
  api ??= openDatabase()
    .then((db) => createLocalApi({ db, call: solverCall }))
    .catch((error) => {
      api = null;
      throw error;
    });
  return api;
};

export const handle = (method, path, body) =>
  localApi().then((ready) => ready.handle(method, path, body));
