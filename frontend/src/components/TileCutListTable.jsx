/*
  The cut list, as a component so it can render in two places from the same
  data shape: the live results page (TileResultDisplay, straight from
  /api/tile-layout) and the saved-project preview modal (UserDashboard,
  from a project's stored layout_result) — the API and the DB hold exactly
  the same JSON, so `candidate` here works whichever place it came from.
*/

import { buildCutList } from '../utils/tileCutList';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateWithFallback } from '../i18n/translate';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

const pieceMeta = (piece, text) => (
  <>
    <strong style={{ display: 'block', color: 'var(--ink)', fontSize: '16px' }}>
       {text('ui.pieceMeta', { label: piece.label, width: mm(piece.nominalWidth), height: mm(piece.nominalHeight) })}
    </strong>
    <span>
       {text('ui.finalSize', { width: mm(piece.width), height: mm(piece.height) })}
       {piece.edgeLengths && ` | ${text('ui.edges')}: ${piece.edgeLengths.map((length) => mm(length)).join(' · ')} mm`}
    </span>
  </>
);

// A compact outline of the same piece shown in the layout. Diagonal rows use
// their actual polygon; axis-aligned rows fall back to a proportional rect.
const Swatch = ({ color, shape }) => {
  const vertices = shape?.vertices;
  const sourceWidth = shape?.width || 1;
  const sourceHeight = shape?.height || 1;
  const points = vertices || [[0, 0], [sourceWidth, 0], [sourceWidth, sourceHeight], [0, sourceHeight]];
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = Math.max(maxX - minX, 1);
  const rangeY = Math.max(maxY - minY, 1);
  const scale = 20 / Math.max(rangeX, rangeY);
  const offsetX = (28 - rangeX * scale) / 2;
  const offsetY = (28 - rangeY * scale) / 2;
  const normalized = points.map(([x, y]) => [
    offsetX + (x - minX) * scale,
    offsetY + (maxY - y) * scale,
  ]);

  return (
    <svg
      aria-hidden="true"
      width="28"
      height="28"
      viewBox="0 0 28 28"
      style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }}
      focusable="false"
    >
      <polygon points={normalized.map(([x, y]) => `${x},${y}`).join(' ')} fill={color} stroke="var(--ink-4)" strokeWidth="1" />
    </svg>
  );
};

const TileCutListTable = ({ candidate }) => {
  const { t } = useTranslation();
  const text = (key, vars) => translateWithFallback(t, key, vars);
  const [template, setTemplate] = useState(null);
  if (!candidate || !candidate.tiles || candidate.tiles.length === 0) return null;

  const { fullCount, fullColor, fullShape, cutGroups } = buildCutList(candidate.tiles);
  if (fullCount === 0 && cutGroups.length === 0) return null;
  const hasDiagonalCuts = cutGroups.some((g) => g.isDiagonal);

  return (
    <section>
      <div className="section-rule">
         <h2 className="section-title">{text('ui.cutList')}</h2>
         <span className="folio">{text('ui.cutListIntro')}</span>
      </div>
      <table className="cat-table" style={{ marginTop: '14px' }}>
        <thead>
           <tr><th>{text('workflow.sizeMm')}</th><th>{text('ui.kind')}</th><th>{text('ui.fromOffcut')}</th><th>{text('workflow.qty')}</th></tr>
        </thead>
        <tbody>
          {fullCount > 0 && (
            <tr>
              <td style={{ textAlign: 'left', color: 'var(--ink)' }}>
                 <Swatch color={fullColor} shape={fullShape} />{text('ui.fullTile')}
              </td>
               <td style={{ textAlign: 'left', color: 'var(--ink-2)' }}>{text('ui.noCutNeeded')}</td>
              <td>—</td>
              <td>{fullCount}</td>
            </tr>
          )}
          {cutGroups.map((group, i) => (
            <tr key={i}>
              <td style={{ textAlign: 'left', color: 'var(--ink)' }}>
                <Swatch color={group.color} shape={group.shape} />{mm(group.width)} × {mm(group.height)}
                {group.sliverCount > 0 && (
                  <span style={{ color: 'var(--revision)', fontWeight: 700, marginLeft: '8px' }}>
                     {group.sliverCount === group.count ? text('ui.sliver') : text('ui.sliverCount', { count: group.sliverCount })}
                  </span>
                )}
              </td>
              <td style={{ textAlign: 'left', color: 'var(--ink-2)' }}>
                {group.isDiagonal
                  ? (
                    <>
                       {group.kind === 'notched' ? text('ui.diagonalOpening') : text('ui.diagonal')}
                      {group.edgeLengths && ` · ${group.edgeLengths.map((length) => mm(length)).join(' · ')} mm`}
                       {candidate.piece_diagrams?.[group.label] && (
                          <button type="button" className="btn btn-small" style={{ marginLeft: '8px' }} onClick={() => setTemplate({ ...group, image: candidate.piece_diagrams[group.label] })}>
                             {text('ui.viewCut', { label: group.label })}
                         </button>
                       )}
                    </>
                  )
                   : (group.kind === 'notched' ? text('ui.openingDiagram') : text('ui.straightCut'))}
              </td>
              <td>{group.reusedCount > 0 ? `${group.reusedCount} of ${group.count}` : '—'}</td>
              <td>{group.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="synthetic" style={{ marginTop: '10px' }}>
         {text('ui.cutListDescription')}
         {candidate.notched_count > 0 && ` ${text('ui.notchedDescription')}`}
         {candidate.reused_offcut_count > 0 && ` ${text('ui.reusedDescription')}`}
         {hasDiagonalCuts && ` ${text('ui.diagonalDescription')}`}
      </p>
      {template && (
         <div className="cat-overlay" role="dialog" aria-modal="true" aria-label={text('ui.cutTemplateAria', { label: template.label })} onClick={() => setTemplate(null)}>
          <div className="cat-sheet" style={{ maxWidth: '720px', maxHeight: '90vh', overflow: 'auto' }} onClick={(event) => event.stopPropagation()}>
            <div className="masthead" style={{ marginTop: 0 }}>
               <span className="masthead-brand" style={{ fontSize: '13px' }}>{text('ui.cutTemplate', { label: template.label })}</span>
               <button type="button" className="masthead-flash" onClick={() => setTemplate(null)}>{text('common.close')}</button>
            </div>
            <div style={{ padding: '16px 16px 0', color: 'var(--ink-2)', fontSize: '13px', lineHeight: '1.5' }}>
               {pieceMeta(template, text)}
            </div>
            <img src={template.image} alt={`Cut template for piece ${template.label}`} style={{ display: 'block', width: '100%', padding: '16px' }} />
             <div style={{ padding: '0 16px 16px', color: 'var(--ink-2)', fontSize: '13px', lineHeight: '1.5' }}>
               <strong style={{ color: 'var(--ink)' }}>{text('ui.howToCut')}</strong> {text('ui.cutInstructions')}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default TileCutListTable;
