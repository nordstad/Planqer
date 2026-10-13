// What the demo does about the risk that browser data disappears: ask the
// browser to keep it, say how things stand, and remind the user to export.

const LAST_EXPORTED_KEY = "planqer.demo.lastExported";
const REMINDER_DAYS = 30;

export async function getStorageStatus(storage = globalThis.navigator?.storage) {
  if (!storage) return { supported: false, persisted: false, usageBytes: null, quotaBytes: null };
  const persisted = (await storage.persisted?.().catch(() => false)) ?? false;
  const estimate = await storage.estimate?.().catch(() => null);
  return {
    supported: true,
    persisted,
    usageBytes: estimate?.usage ?? null,
    quotaBytes: estimate?.quota ?? null,
  };
}

// Firefox asks the user, so this must follow a click. Chrome decides by itself.
export async function requestPersistence(storage = globalThis.navigator?.storage) {
  try {
    return (await storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function readLastExported() {
  try {
    const stored = localStorage.getItem(LAST_EXPORTED_KEY);
    if (!stored) return null;
    const date = new Date(stored);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

export function markExported(now = new Date()) {
  try {
    localStorage.setItem(LAST_EXPORTED_KEY, now.toISOString());
  } catch {
    // Storage can be blocked; the export itself has already happened.
  }
}

export function needsBackupReminder({ hasData, lastExported, now = new Date() }) {
  if (!hasData) return false;
  if (!lastExported) return true;
  return now.getTime() - lastExported.getTime() > REMINDER_DAYS * 86_400_000;
}
