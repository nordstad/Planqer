/*
  The chosen candidate, drawn at full width — the diagram is the thing this
  step exists to produce, so nothing above it restates a figure the SVG
  already carries a label for.

  Download is client-side only, same pattern as ResultDisplay.jsx: the data
  URL the API already returned, no server round-trip. Saving this to an
  account (and the server re-rendering it captioned) is Phase 3's job, once
  UserTileProject and its routes exist — see .plans/tile-layout.md.
*/

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from './icons';
import TileCutListTable from './TileCutListTable';
import { smallestCutMm } from '../utils/tileCutList';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

const TileResultDisplay = ({ candidate, projectName }) => {
  const { t } = useTranslation();
  const [diagramOpen, setDiagramOpen] = useState(false);
  if (!candidate) return null;

  const safeName = (projectName ? projectName : 'tile_layout').replace(/[^a-zA-Z0-9_-]/g, '_');
  const isDiagonal = candidate.min_diagonal_cut_span != null;

  const downloadDiagram = () => {
    const extension = candidate.visualization.startsWith('data:image/png') ? 'png' : 'svg';
    const a = document.createElement('a');
    a.href = candidate.visualization;
    a.download = `${safeName}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
      <figure style={{ margin: 0, minWidth: 0 }}>
        <button
          type="button"
          className="cut-list-visualization"
          style={{ width: '100%', cursor: 'zoom-in' }}
          onClick={() => setDiagramOpen(true)}
           aria-label={t('ui.tileDiagramAria')}
        >
           <img src={candidate.visualization} alt={`${candidate.label} — ${t('ui.tileDiagramAlt')}`} style={{ width: '100%', display: 'block' }} />
        </button>
      </figure>

      <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginTop: '14px' }}>
        <p className="synthetic" style={{ margin: 0 }}>
           {t('ui.amberJoint')}
        </p>
        <button type="button" className="btn" onClick={downloadDiagram}>
           <Download /> {t('workflow.downloadDiagram')}
        </button>
      </div>

      {candidate.warnings.length > 0 && (
        <div className="alert-note" style={{ marginTop: '18px' }}>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            {candidate.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div style={{ marginTop: '26px' }}>
        <TileCutListTable candidate={candidate} />
      </div>


      <section style={{ marginTop: '26px' }}>
        <div className="section-rule">
           <h2 className="section-title">{t('workflow.byTheNumbers')}</h2>
           <span className="folio">{t('workflow.candidateInFull')}</span>
        </div>
        <table className="cat-table is-reference" style={{ marginTop: '14px' }}>
          <tbody>
            <tr><td>{t('ui.fullTiles')}</td><td>{candidate.full_tile_count}</td></tr>
            <tr><td>{t('ui.cutTiles')}</td><td>{candidate.cut_tile_count}</td></tr>
            {candidate.notched_count > 0 && <tr><td>{t('ui.tilesAroundOpening')}</td><td>{candidate.notched_count}</td></tr>}
            <tr><td>{t('ui.offcutsReused')}</td><td>{candidate.reused_offcut_count}</td></tr>
            <tr><td>{t('ui.tilesToBuy')}</td><td>{candidate.tiles_to_purchase}</td></tr>
             <tr><td>{t('legacy.withBreakage')}</td><td>{candidate.tiles_to_purchase_with_waste}</td></tr>
            {isDiagonal ? (
              <tr>
                 <td>{t('ui.tightestCut')}</td>
                 <td>{smallestCutMm(candidate) === null ? t('ui.noneCut') : `${mm(smallestCutMm(candidate))} mm`}</td>
              </tr>
            ) : (
              <>
                <tr>
                    <td>{t('ui.tightestLeftRight')}</td>
                   <td>{candidate.min_edge_cut_width === null ? t('ui.noneCut') : `${mm(candidate.min_edge_cut_width)} mm`}</td>
                </tr>
                <tr>
                   <td>{t('ui.tightestTopBottom')}</td>
                   <td>{candidate.min_edge_cut_height === null ? t('ui.noneCut') : `${mm(candidate.min_edge_cut_height)} mm`}</td>
                </tr>
              </>
            )}
             <tr><td>{t('ui.sliversBelow')}</td><td>{candidate.sliver_count}</td></tr>
             <tr><td>{t('ui.distinctCutSizes')}</td><td>{candidate.distinct_cut_sizes}</td></tr>
             <tr><td>{t('ui.materialUsed')}</td><td>{(candidate.efficiency * 100).toFixed(1)}%</td></tr>
          </tbody>
        </table>
      </section>

      {diagramOpen && (
         <div className="cat-overlay" role="dialog" aria-modal="true" aria-label={t('ui.tileLayoutDiagram')} onClick={() => setDiagramOpen(false)}>
          <div className="cat-sheet" style={{ maxWidth: '95vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="masthead" style={{ marginTop: 0 }}>
               <span className="masthead-brand" style={{ fontSize: '13px' }}>{t('ui.tileLayout')}</span>
              <span className="masthead-section" />
              <button type="button" className="masthead-flash" onClick={() => setDiagramOpen(false)}>
                 {t('common.close')}
              </button>
            </div>
            <div style={{ padding: '16px' }}>
               <img src={candidate.visualization} alt={`${candidate.label} — ${t('ui.tileDiagramAlt')}`} style={{ display: 'block', width: '100%', height: 'auto' }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TileResultDisplay;
