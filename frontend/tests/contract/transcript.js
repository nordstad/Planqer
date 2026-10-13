// Runs the contract scenarios against a local store and normalises what comes
// back the same way scripts/contract-transcripts.py normalises the real API's
// answers, so the two can be compared exactly. Keep the two in step.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEHOLDER = /\{\{(\w+)\.(\w+)\}\}/g;

export function substitute(value, saved) {
  if (typeof value === "string") {
    const whole = value.match(/^\{\{(\w+)\.(\w+)\}\}$/);
    if (whole) return saved[whole[1]][whole[2]];
    return value.replace(PLACEHOLDER, (_, name, field) => String(saved[name][field]));
  }
  if (Array.isArray(value)) return value.map((item) => substitute(item, saved));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, substitute(item, saved)]),
    );
  }
  return value;
}

export function normalise(value, ids, key = null) {
  if (Array.isArray(value)) return value.map((item) => normalise(item, ids, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((name) => [name, normalise(value[name], ids, name)]),
    );
  }
  if ((key === "created_at" || key === "updated_at") && typeof value === "string") return "<time>";
  if (key === "cutlist_image" && typeof value === "string") return "<image>";
  if (typeof value === "string" && UUID.test(value)) {
    const id = value.toLowerCase();
    if (!ids.has(id)) ids.set(id, `<id:${ids.size + 1}>`);
    return ids.get(id);
  }
  return value;
}

function reduceValidation(body) {
  if (body && Array.isArray(body.detail)) {
    return {
      ...body,
      detail: body.detail.map(({ type, loc, msg }) => ({ type, loc, msg })),
    };
  }
  return body;
}

// `newApi()` gives a fresh local API (a new user, in effect) for each scenario.
export async function runScenarios(scenarios, newApi) {
  const transcripts = [];
  for (const scenario of scenarios) {
    const api = newApi();
    const saved = {};
    const ids = new Map();
    const steps = [];
    for (const step of scenario.steps) {
      const path = substitute(step.path, saved);
      const body = substitute(step.body, saved);
      const result = await api.handle(step.method, path, body);
      const answer = result.image ? "<svg image>" : result.body;
      if (step.as) saved[step.as] = answer;
      steps.push({
        request: `${step.method} ${step.path}`,
        status: result.status,
        body: normalise(reduceValidation(answer), ids),
      });
    }
    transcripts.push({ name: scenario.name, steps });
  }
  return transcripts;
}
