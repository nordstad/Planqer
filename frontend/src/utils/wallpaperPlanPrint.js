import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RoomOverview from '../components/RoomOverview';
import WallpaperPieceDiagram from '../components/WallpaperPieceDiagram';
import { WallElevation } from '../components/WallpaperOptimizer';
import { summaryRows } from '../components/WallpaperPlanDocument';
import { coveredStrips, needsDrawing, pieceFlags, pieceLabels, stripOf, stripLabel, toRanges, wallPieces } from './wallpaperPlan';
import { printProjectPlans } from './printProject';

const h = createElement;
const mm = (value) => `${Math.round(value)} mm`;

const printCss = `
  .wallpaper-plan-print { --ink: #16150f; --ink-3: #6f6a55; --accent: #a34f18; --accent-bg: #f3dfd1; --card: #ffffff; --ground-2: #f2efe6; }
  .wallpaper-plan-print section { margin: 0 0 9mm; }
  .wallpaper-plan-print h2 { font-size: 14pt; margin: 0 0 4mm; }
  .wallpaper-plan-print h3 { font-size: 11pt; margin: 0 0 3mm; }
  .wallpaper-plan-print .plan-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm 6mm; margin: 0; }
  .wallpaper-plan-print .plan-summary div { break-inside: avoid; }
  .wallpaper-plan-print dt { color: #6b6a60; font-size: 8pt; }
  .wallpaper-plan-print dd { margin: 1mm 0 0; font-size: 10pt; font-weight: 700; }
  .wallpaper-plan-print .wallpaper-room-overview { max-width: 80mm; margin: 0 auto 5mm; }
  .wallpaper-plan-print .wallpaper-room-overview svg, .wallpaper-plan-print .wallpaper-measured-sheet svg { display: block; width: 100%; height: auto; }
  .wallpaper-plan-print .wallpaper-measured-sheet { break-inside: avoid; page-break-inside: avoid; }
  .wallpaper-plan-print .strip-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  .wallpaper-plan-print .strip-table th, .wallpaper-plan-print .strip-table td { padding: 2mm 2.5mm 2mm 0; text-align: left; vertical-align: top; border-bottom: .2mm solid #e3e1d6; }
  .wallpaper-plan-print .strip-table thead { display: table-header-group; }
  .wallpaper-plan-print .strip-table th { font-size: 7.5pt; text-transform: uppercase; color: #6b6a60; }
  .wallpaper-plan-print .wp-print-pieces { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  .wallpaper-plan-print .wp-print-piece { margin: 0; border: .2mm solid #e3e1d6; break-inside: avoid; page-break-inside: avoid; }
  .wallpaper-plan-print .wp-print-piece svg { display: block; width: 100%; height: auto; }
  .wallpaper-plan-print .wp-print-wall { break-before: page; page-break-before: always; }
  .wallpaper-plan-print .wallpaper-roll-diagram { display: block; max-width: 100%; }
`;

const noteFor = (piece, strip, wallpaper, t) => {
  const flags = pieceFlags(piece, strip);
  const narrow = (strip.width || strip.x_end - strip.x_start) < wallpaper.roll_width - 0.5;
  if (flags.length) return flags.map((flag) => t(`wallpaperUi.note${flag[0].toUpperCase()}${flag.slice(1)}`)).concat(narrow ? t('wallpaperUi.noteNarrow') : []).join(' · ');
  return narrow ? t('wallpaperUi.noteNarrow') : t('wallpaperUi.notePlain');
};

const WallPrintSection = ({ plan, walls, wallpaper, wall, wallIndex, labels, t }) => {
  const pieces = wallPieces(plan, wallIndex);
  const specialPieces = pieces.filter((piece) => needsDrawing(piece, stripOf(plan, piece)));
  const wallNames = walls.map((item) => item.name);
  const origin = wall.profile === 'sloped' ? t('wallpaperUi.originLocalLower') : t('wallpaperUi.originBottomLeft');
  return h('section', { className: 'wp-print-wall' }, [
    h('h2', { key: 'title' }, wall.name),
    h('p', { key: 'origin' }, t('wallpaperUi.originLabel', { origin })),
    h('div', { className: 'wallpaper-measured-sheet', key: 'elevation' }, h(WallElevation, { wall, wallIndex, plan, wallNames, labels })),
    h('h3', { key: 'strips' }, t('wallpaperUi.stripTableTitle')),
    h('table', { className: 'strip-table', key: 'table' }, [
      h('thead', { key: 'head' }, h('tr', null, [t('wallpaperUi.colStrip'), t('wallpaperUi.colWidth'), t('wallpaperUi.colCut'), t('wallpaperUi.colHang'), t('wallpaperUi.colNote'), '✓'].map((title, index) => h('th', { key: index }, title)))),
      h('tbody', { key: 'body' }, pieces.map((piece) => {
        const strip = stripOf(plan, piece);
        return h('tr', { key: piece.id }, [
          h('th', { key: 'strip' }, labels.get(piece.id)),
          h('td', { key: 'width' }, `${mm(strip.width || strip.x_end - strip.x_start)}${strip.return_overlap ? ` + ${mm(strip.return_overlap)}` : ''}`),
          h('td', { key: 'cut' }, mm(piece.cut_length ?? piece.length)),
          h('td', { key: 'hang' }, `${Math.round(piece.y_start)}–${Math.round(piece.y_end)}`),
          h('td', { key: 'note' }, noteFor(piece, strip, wallpaper, t)),
          h('td', { key: 'tick' }, ''),
        ]);
      })),
    ]),
    ...toRanges(coveredStrips(plan, wallIndex)).map(([from, to]) => h('p', { key: `covered-${from}` }, t('wallpaperUi.stripsCovered', { range: from === to ? stripLabel(t, from) : `${stripLabel(t, from)}–${stripLabel(t, to)}` }))),
    h('h3', { key: 'drawings' }, t('wallpaperUi.specialDrawings')),
    specialPieces.length
      ? h('div', { className: 'wp-print-pieces', key: 'pieces' }, specialPieces.map((piece) => h('figure', { className: 'wp-print-piece', key: piece.id }, h(WallpaperPieceDiagram, { piece, strip: stripOf(plan, piece), repeat: Number(wallpaper.repeat) || 0, wallNames, label: labels.get(piece.id), legend: false }))))
      : h('p', { key: 'none' }, t('wallpaperUi.noSpecialPieces')),
    h('p', { key: 'legend' }, t('wallpaperUi.diagramLegend')),
    h('p', { key: 'hatch' }, t('wallpaperUi.hatchLegend')),
  ]);
};

const WallpaperPlanPrint = ({ plan, walls, corners, closed, wallpaper, t }) => {
  const labels = pieceLabels(plan, t);
  const printableWalls = walls.filter((wall) => !wall.skip);
  return h('div', { className: 'wallpaper-plan-print' }, [
    h('style', { key: 'style' }, printCss),
    h('section', { key: 'summary' }, [
      h('h2', { key: 'title' }, t('wallpaperUi.summaryTitle')),
      h('dl', { className: 'plan-summary', key: 'rows' }, summaryRows(plan, wallpaper, t).map(([term, value]) => h('div', { key: term }, [h('dt', { key: 'term' }, term), h('dd', { key: 'value' }, value)]))),
    ]),
    printableWalls.length > 1 && h('section', { key: 'overview' }, [h('h2', { key: 'title' }, t('wallpaperUi.roomOverviewAria')), h(RoomOverview, { key: 'room', walls, corners, plan, closed })]),
    ...printableWalls.map((wall) => h(WallPrintSection, { key: wall.name, plan, walls, wallpaper, wall, wallIndex: walls.indexOf(wall), labels, t })),
  ]);
};

export const buildWallpaperPlanHtml = ({ plan, walls, corners = [], closed = false, wallpaper }, t) => renderToStaticMarkup(h(WallpaperPlanPrint, { plan, walls, corners, closed, wallpaper, t }));

export const printWallpaperPlan = ({ name, plan, walls, corners, closed, wallpaper }, t) => printProjectPlans({
  title: name,
  meta: '',
  paper: 'a4',
  plans: [{ name, facts: [], bodyHtml: buildWallpaperPlanHtml({ plan, walls, corners, closed, wallpaper }, t) }],
});
