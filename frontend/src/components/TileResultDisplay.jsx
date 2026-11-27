/*
  The chosen candidate, drawn at full width — the diagram is the thing this
  step exists to produce, so nothing above it restates a figure the SVG
  already carries a label for.

  Download is client-side only, same pattern as ResultDisplay.jsx: the data
  URL the API already returned, no server round-trip. Saving this to an
  account (and the server re-rendering it captioned) is Phase 3's job, once
  UserTileProject and its routes exist — see .plans/tile-layout.md.
*/

import { useEffect, useState } from 'react';
import Modal, { modalTrigger } from './Modal';
import { useTranslation } from 'react-i18next';
import { Download } from './icons';
import TileCutListTable from './TileCutListTable';
import TileDiagram from './TileDiagram';
import { smallestCutMm } from '../utils/tileCutList';
import useTileNavigation from './useTileNavigation';
import { svgBlobToPngBlob } from '../utils/svgToPng';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

const TileResultDisplay = ({ candidate, projectName, surfaceWidth, surfaceHeight }) => {
  const { t } = useTranslation();
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [selectedCut, setSelectedCut] = useState(null);
  const [highlightedCut, setHighlightedCut] = useState(null);
  const [listHighlight, setListHighlight] = useState(null);
  const [downloadError, setDownloadError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { listRef, activeCut, showInList } = useTileNavigation(candidate);
  useEffect(() => { setHighlightedCut(null); setListHighlight(null); }, [candidate]);
  if (!candidate) return null;

  const safeName = (projectName ? projectName : 'tile_layout').replace(/[^a-zA-Z0-9_-]/g, '_');
  const isDiagonal = candidate.min_diagonal_cut_span != null;

  const downloadDiagram = async () => {
    setDownloading(true);
    setDownloadError(false);
    try {
      const source = await (await fetch(candidate.visualization)).blob();
      const png = source.type === 'image/png' ? source : await svgBlobToPngBlob(source);
      const url = URL.createObjectURL(png);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="tile-layout-pair">
        <div className="tile-layout-visual">
          <div className="tile-diagram-heading">
            <div><h2 className="section-title">{t('ui.tileDiagramTitle')}</h2><p>{t('ui.tileSurfaceSize', { width: mm(Number(surfaceWidth)), height: mm(Number(surfaceHeight)) })}</p></div>
            <div className="tile-diagram-actions">
              <button type="button" className="btn" onClick={modalTrigger(() => setDiagramOpen(true))}>{t('ui.tileDiagramAria')}</button>
              <button type="button" className="btn" onClick={downloadDiagram} disabled={downloading}><Download /> {t('projectUi.downloadPng')}</button>
            </div>
          </div>
          <figure style={{ margin: 0, minWidth: 0 }}>
            <TileDiagram candidate={candidate} highlightedLabel={listHighlight || activeCut} onSelect={setSelectedCut} onHighlight={setHighlightedCut} alt={`${candidate.label} — ${t('ui.tileDiagramAlt')}`} />
          </figure>

          {downloadError && <p className="alert-danger" role="alert">{t('ui.tilePngFailed')}</p>}

        {candidate.warnings.length > 0 && (
        <div className="alert-note" style={{ marginTop: '18px' }}>
          <ul style={{ margin: 0, paddingLeft: '18px' }}>
            {candidate.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
        )}
        </div>

        <TileCutListTable candidate={candidate} highlightedLabel={highlightedCut || activeCut} onHighlight={setListHighlight} selectedLabel={selectedCut} onCloseSelection={() => setSelectedCut(null)} navigationRef={listRef} onShowInList={showInList} />
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
         <Modal aria-label={t('ui.tileLayoutDiagram')} title={t('ui.tileLayout')} sheetStyle={{ maxWidth: '95vw' }} onClose={() => setDiagramOpen(false)}>
            <div style={{ padding: '16px' }}>
               <img src={candidate.visualization} alt={`${candidate.label} — ${t('ui.tileDiagramAlt')}`} style={{ display: 'block', width: '100%', height: 'auto' }} />
            </div>
        </Modal>
      )}
    </>
  );
};

export default TileResultDisplay;
