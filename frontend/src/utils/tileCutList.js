/*
  Shared cut-list logic for tile layouts — used by the live results page
  (TileResultDisplay), the saved-project preview modal (UserDashboard), and
  the print document (printProject.js). All three read from the same shape
  of data (a TileLayoutCandidateResponse-like object with a `tiles` array),
  whether it came straight from /api/tile-layout or was reloaded from a
  saved project's stored `layout_result` — the API and the DB store exactly
  the same JSON, so one function works for both.
*/

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

// Every tile grouped by its exact cut size (color-matched to the diagram) so
// "289×298mm ×6" reads as one line instead of six identical rows — a real
// layout can carry hundreds of cut tiles, but they overwhelmingly repeat in
// size (every tile on the same edge of the same row is cut the same way).
// Full tiles get their own single summary row rather than one per tile.
export const buildCutList = (tiles) => {
  const groups = new Map();
  let fullCount = 0;
  let fullColor = null;

  tiles.forEach((tile) => {
    if (tile.kind === 'full') {
      fullCount += 1;
      fullColor = fullColor ?? tile.fill_color;
      return;
    }
    const width = Math.round(tile.width);
    const height = Math.round(tile.height);
    const key = `${tile.kind}:${width}:${height}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.sliverCount += tile.is_sliver ? 1 : 0;
      existing.reusedCount += tile.is_reused_offcut ? 1 : 0;
    } else {
      groups.set(key, {
        kind: tile.kind, width, height, count: 1, color: tile.fill_color,
        sliverCount: tile.is_sliver ? 1 : 0, reusedCount: tile.is_reused_offcut ? 1 : 0,
      });
    }
  });

  const cutGroups = Array.from(groups.values()).sort((a, b) => (b.width * b.height) - (a.width * a.height));
  return { fullCount, fullColor, cutGroups };
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// A plain-HTML rendering of the same table, for the print document — that
// document is built as a raw string for a hidden iframe, not React, so this
// duplicates the JSX version's structure rather than sharing components.
// Kept deliberately plain (no color swatches): print is black-and-white-safe
// by default in most browsers unless the user opts into "print background
// graphics", so a colored square could silently vanish on a printed page.
// The size numbers and kind text carry the same information on paper.
export const buildCutListHtml = (candidate) => {
  if (!candidate?.tiles?.length) return '';
  const { fullCount, cutGroups } = buildCutList(candidate.tiles);
  if (fullCount === 0 && cutGroups.length === 0) return '';

  const rows = [];
  if (fullCount > 0) {
    rows.push(`<tr><td>Full tile</td><td>No cut needed</td><td>—</td><td>${fullCount}</td></tr>`);
  }
  cutGroups.forEach((g) => {
    const sliver = g.sliverCount > 0
      ? ` <b>(${g.sliverCount === g.count ? 'sliver' : `${g.sliverCount} sliver`})</b>`
      : '';
    const kind = g.kind === 'notched' ? 'Cut around an opening' : 'Straight cut';
    const offcut = g.reusedCount > 0 ? `${g.reusedCount} of ${g.count}` : '—';
    rows.push(
      `<tr><td>${mm(g.width)} \u00d7 ${mm(g.height)}${sliver}</td>`
      + `<td>${escapeHtml(kind)}</td><td>${offcut}</td><td>${g.count}</td></tr>`,
    );
  });

  return `
    <table class="cut-list">
      <thead><tr><th>Size mm</th><th>Kind</th><th>From offcut</th><th>Qty</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
};
