import { getStorageStatus, markExported, needsBackupReminder, readLastExported, requestPersistence } from "./dataSafety";

describe("storage status", () => {
  it("reports persistence and use when the browser can", async () => {
    const storage = {
      persisted: async () => true,
      estimate: async () => ({ usage: 2_500_000, quota: 10_000_000 }),
    };
    expect(await getStorageStatus(storage)).toEqual({ supported: true, persisted: true, usageBytes: 2_500_000, quotaBytes: 10_000_000 });
  });

  it("says unsupported without the Storage API", async () => {
    expect(await getStorageStatus(undefined)).toEqual({ supported: false, persisted: false, usageBytes: null, quotaBytes: null });
  });

  it("copes with a browser that cannot estimate", async () => {
    const status = await getStorageStatus({ persisted: async () => false });
    expect(status).toMatchObject({ supported: true, persisted: false, usageBytes: null });
  });
});

describe("asking the browser to keep the data", () => {
  it("returns what the browser decided", async () => {
    expect(await requestPersistence({ persist: async () => true })).toBe(true);
    expect(await requestPersistence({ persist: async () => false })).toBe(false);
  });

  it("returns false when there is nothing to ask", async () => {
    expect(await requestPersistence(undefined)).toBe(false);
    expect(await requestPersistence({ persist: async () => { throw new Error("blocked"); } })).toBe(false);
  });
});

describe("last exported", () => {
  beforeEach(() => localStorage.clear());

  it("is never until the first export", () => {
    expect(readLastExported()).toBeNull();
  });

  it("remembers the export time", () => {
    markExported(new Date("2026-10-13T10:00:00Z"));
    expect(readLastExported()).toEqual(new Date("2026-10-13T10:00:00Z"));
  });

  it("ignores a damaged value", () => {
    localStorage.setItem("planqer.demo.lastExported", "yesterday-ish");
    expect(readLastExported()).toBeNull();
  });
});

describe("the backup reminder", () => {
  const now = new Date("2026-10-13T10:00:00Z");
  const daysAgo = (days) => new Date(now.getTime() - days * 86_400_000);

  it("stays quiet when there is nothing to lose", () => {
    expect(needsBackupReminder({ hasData: false, lastExported: null, now })).toBe(false);
  });

  it("speaks up when there is data and no export", () => {
    expect(needsBackupReminder({ hasData: true, lastExported: null, now })).toBe(true);
  });

  it("speaks up after 30 days, not before", () => {
    expect(needsBackupReminder({ hasData: true, lastExported: daysAgo(29), now })).toBe(false);
    expect(needsBackupReminder({ hasData: true, lastExported: daysAgo(31), now })).toBe(true);
  });
});
