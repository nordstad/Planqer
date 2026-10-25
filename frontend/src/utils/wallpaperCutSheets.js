import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import WallpaperPieceDiagram from '../components/WallpaperPieceDiagram';

/*
  Printable per-piece cut drawings for a wallpaper plan — several to an A4
  page, grouped by the wall each piece starts on. Built from the saved
  `plan_result`, so a reopened project prints the same drawings as the Cut step.
*/

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// The diagram reads its colours from CSS variables the print document does not define.
const CSS = `
  <style>
    .wp-sheets { break-before: page; page-break-before: always;
      --ink: #16150f; --ink-3: #6f6a55; --accent: #a34f18; --card: #ffffff; --ground-2: #f2efe6; }
    .wp-sheets h3 { margin-top: 4mm; padding-bottom: 2mm; border-bottom: 0.25mm solid #c9c7ba; font-size: 10pt; break-after: avoid; page-break-after: avoid; }
    .wp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 3mm; }
    .wp-piece { margin: 0; border: 0.2mm solid #e3e1d6; break-inside: avoid; page-break-inside: avoid; }
    .wp-piece svg { display: block; width: 100%; height: auto; }
  </style>`;

export const buildWallpaperCutSheetsHtml = (plan, walls, repeat, t) => {
  const pieces = plan?.pieces || [];
  if (!pieces.length) return '';
  const sections = (walls || []).map((wall, wallIndex) => {
    const own = pieces.filter((piece) => piece.wall_index === wallIndex);
    const figures = own.map((piece) => {
      const strip = plan.strips.find((item) => item.number === piece.strip_number);
      return strip ? `<figure class="wp-piece">${renderToStaticMarkup(createElement(WallpaperPieceDiagram, { piece, strip, repeat: Number(repeat) || 0 }))}</figure>` : '';
    }).join('');
    return own.length ? `<h3>${escapeHtml(wall.name)}</h3><div class="wp-grid">${figures}</div>` : '';
  }).join('');
  return `${CSS}<section class="wp-sheets"><h2>${escapeHtml(t('wallpaperUi.pieceDrawings'))}</h2>${sections}</section>`;
};
