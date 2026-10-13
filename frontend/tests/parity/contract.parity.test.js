// The browser's local store must answer the scripted scenarios exactly as the
// real API did (frontend/tests/contract/transcripts.json, kept honest by
// backend/tests/test_contract_transcripts.py). Validation and diagrams run in
// the real Pyodide runtime, the same as in the browser.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { createLocalApi } from "../../src/runtime/localApi";
import { createMemoryDb } from "../../src/runtime/memoryDb";
import { runScenarios } from "../contract/transcript";
import { startRuntime } from "./startRuntime";

const here = dirname(fileURLToPath(import.meta.url));
const contract = join(here, "../contract");
const scenarios = JSON.parse(readFileSync(join(contract, "scenarios.json"), "utf-8"));
const recorded = JSON.parse(readFileSync(join(contract, "transcripts.json"), "utf-8"));

let transcripts;

beforeAll(async () => {
  const { runtime } = await startRuntime();
  transcripts = await runScenarios(scenarios, () =>
    createLocalApi({
      db: createMemoryDb(),
      call: (op, payload) => runtime.call(op, payload),
    }),
  );
});

describe("the local store answers like the real API", () => {
  it.each(recorded.map((scenario, index) => [scenario.name, index]))("%s", (_name, index) => {
    const expected = recorded[index].steps;
    const actual = transcripts[index].steps;

    // Compare step by step so a failure names the request that differs.
    expect(actual.map((step) => step.request)).toEqual(expected.map((step) => step.request));
    expected.forEach((step, position) => {
      expect({ at: step.request, status: actual[position].status, body: actual[position].body }).toEqual({
        at: step.request,
        status: step.status,
        body: step.body,
      });
    });
  });
});
