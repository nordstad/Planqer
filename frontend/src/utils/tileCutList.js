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

// Shoelace formula — only used to disambiguate a diagonal (polygon) tile's
// grouping key below, mirroring tile_visualization.py's tile_size_key on
// the backend (see its docstring for why a bounding-box match alone isn't
// enough: a triangle and a pentagon can share one).
const polygonArea = (vertices) => {
  let total = 0;
  for (let i = 0; i < vertices.length; i += 1) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % vertices.length];
    total += x1 * y2 - x2 * y1;
  }
  return Math.abs(total) / 2;
};

// The key non-full tiles are grouped by — kept in one place for the same
// reason tile_size_key is on the backend: the diagram's colors and the cut
// list's row counts must never drift apart from a duplicated key formula.
const tileGroupKey = (tile) => {
  const width = Math.round(tile.width);
  const height = Math.round(tile.height);
  if (tile.vertices) {
    return `${tile.kind}:${width}:${height}:${tile.vertices.length}:${Math.round(polygonArea(tile.vertices))}`;
  }
  return `${tile.kind}:${width}:${height}`;
};

// A diagonal ("set on point") bond reports one caliper-width span instead
// of separate left/right + top/bottom cut widths — a rotated piece's "cut
// width" isn't an x-axis/y-axis fact anymore (see
// tile_layout.scoring.LayoutMetrics.min_diagonal_cut_span on the backend).
// Returns null when nothing was cut at all (both sides null), a rounded mm
// number otherwise. Callers decide how to word the null case.
export const smallestCutMm = (candidate) => {
  if (candidate.min_diagonal_cut_span != null) return Math.round(candidate.min_diagonal_cut_span);
  if (candidate.min_edge_cut_width == null && candidate.min_edge_cut_height == null) return null;
  return Math.round(Math.min(
    candidate.min_edge_cut_width ?? Infinity,
    candidate.min_edge_cut_height ?? Infinity,
  ));
};

// Every tile grouped by its exact cut size (color-matched to the diagram) so
// "289×298mm ×6" reads as one line instead of six identical rows — a real
// layout can carry hundreds of cut tiles, but they overwhelmingly repeat in
// size (every tile on the same edge of the same row is cut the same way).
// Full tiles get their own single summary row rather than one per tile.
export const buildCutList = (tiles) => {
   const groups = new Map();
   let fullCount = 0;
   let fullColor = null;
   let fullShape = null;

   tiles.forEach((tile) => {
      if (tile.kind === 'full') {
        fullCount += 1;
        fullColor = fullColor ?? tile.fill_color;
        fullShape = fullShape ?? { vertices: tile.vertices, width: tile.width, height: tile.height };
        return;
     }
     const width = Math.round(tile.width);
     const height = Math.round(tile.height);
     const key = tileGroupKey(tile);
     const existing = groups.get(key);
     if (existing) {
       existing.count += 1;
       existing.sliverCount += tile.is_sliver ? 1 : 0;
       existing.reusedCount += tile.is_reused_offcut ? 1 : 0;
     } else {
        groups.set(key, {
          kind: tile.kind, width, height, count: 1, color: tile.fill_color,
          isDiagonal: !!tile.vertices,
          shape: { vertices: tile.vertices, width: tile.width, height: tile.height },
          nominalWidth: tile.nominal_width, nominalHeight: tile.nominal_height,
          sliverCount: tile.is_sliver ? 1 : 0, reusedCount: tile.is_reused_offcut ? 1 : 0,
          label: tile.size_label, // piece label (A, B, C, etc.) for accessing piece_diagrams
          edgeLengths: tile.edge_lengths, // for diagonal pieces, the polygon edge lengths
        });
     }
   });

   const cutGroups = Array.from(groups.values()).sort((a, b) => (b.width * b.height) - (a.width * a.height));
   return { fullCount, fullColor, fullShape, cutGroups };
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
export const buildCutListHtml = (candidate, t) => {
  if (!candidate?.tiles?.length) return '';
  const { fullCount, cutGroups } = buildCutList(candidate.tiles);
  if (fullCount === 0 && cutGroups.length === 0) return '';

  const rows = [];
  if (fullCount > 0) {
    rows.push(`<tr><td>${t('ui.fullTile')}</td><td>${t('ui.noCutNeeded')}</td><td>—</td><td>${fullCount}</td></tr>`);
  }
  cutGroups.forEach((g) => {
    const sliver = g.sliverCount > 0
      ? ` <b>(${g.sliverCount === g.count ? t('ui.sliver') : t('ui.sliverCount', { count: g.sliverCount })})</b>`
      : '';
    const kind = g.isDiagonal
      ? (g.kind === 'notched' ? t('ui.diagonalOpening') : t('ui.diagonal'))
      : (g.kind === 'notched' ? t('ui.openingDiagram') : t('ui.straightCut'));
    const detail = g.isDiagonal && g.edgeLengths
      ? ` (${g.edgeLengths.map((length) => Math.round(length)).join(' · ')} mm)`
      : '';
    const labeledKind = `${kind}${detail}${g.isDiagonal && g.label ? ` [${g.label}]` : ''}`;
     const offcut = g.reusedCount > 0 ? `${g.reusedCount} of ${g.count}` : '—';
    const template = candidate.piece_diagrams?.[g.label]
       ? `<div class="piece-template-meta"><b>${t('ui.pieceMeta', { label: escapeHtml(g.label), width: mm(g.nominalWidth), height: mm(g.nominalHeight) })}</b><br>${t('ui.finalSize', { width: mm(g.width), height: mm(g.height) })}${g.edgeLengths ? ` | ${t('ui.edges')}: ${g.edgeLengths.map((length) => mm(length)).join(' · ')} mm` : ''}</div><img src="${candidate.piece_diagrams[g.label]}" alt="${t('ui.cutTemplateAria', { label: escapeHtml(g.label) })}" class="piece-template" /><p class="piece-template-note"><b>${t('ui.howToCut')}</b> ${t('ui.cutInstructions')}</p>`
      : '';
    rows.push(
      `<tr><td>${mm(g.width)} \u00d7 ${mm(g.height)}${sliver}</td>`
      + `<td>${escapeHtml(labeledKind)}${template}</td><td>${offcut}</td><td>${g.count}</td></tr>`,
    );
  });

  return `
    <table class="cut-list">
       <thead><tr><th>${t('workflow.sizeMm')}</th><th>${t('ui.kind')}</th><th>${t('ui.fromOffcut')}</th><th>${t('workflow.qty')}</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>`;
};
