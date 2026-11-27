// Saved records are JSON data. Comparing the whole record also catches metadata
// changes, not just timestamps. Different property ordering conservatively
// requires another preview.
export const sameRecord = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export class StaleSnapshotError extends Error {
  constructor() {
    super("Saved records changed after the snapshot");
    this.name = "StaleSnapshotError";
  }
}
