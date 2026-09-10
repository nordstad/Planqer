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
import { Download } from './icons';
import TileCutListTable from './TileCutListTable';
import { smallestCutMm } from '../utils/tileCutList';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

const TileResultDisplay = ({ candidate, projectName }) => {
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
          aria-label="Enlarge tile layout diagram"
        >
          <img src={candidate.visualization} alt={`${candidate.label} — the full tile layout`} style={{ width: '100%', display: 'block' }} />
        </button>
      </figure>

      <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginTop: '14px' }}>
        <p className="synthetic" style={{ margin: 0 }}>
          Amber marks the joint lines; a red outline is a sliver below the guard.
        </p>
        <button type="button" className="btn" onClick={downloadDiagram}>
          <Download /> Download diagram
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
          <h2 className="section-title">By the numbers</h2>
          <span className="folio">This candidate, in full</span>
        </div>
        <table className="cat-table is-reference" style={{ marginTop: '14px' }}>
          <tbody>
            <tr><td>Full tiles</td><td>{candidate.full_tile_count}</td></tr>
            <tr><td>Cut tiles</td><td>{candidate.cut_tile_count}</td></tr>
            {candidate.notched_count > 0 && <tr><td>Tiles cut around an opening</td><td>{candidate.notched_count}</td></tr>}
            <tr><td>Offcuts reused</td><td>{candidate.reused_offcut_count}</td></tr>
            <tr><td>Tiles to buy</td><td>{candidate.tiles_to_purchase}</td></tr>
            <tr><td>With breakage allowance</td><td>{candidate.tiles_to_purchase_with_waste}</td></tr>
            {isDiagonal ? (
              <tr>
                <td>Tightest cut</td>
                <td>{smallestCutMm(candidate) === null ? 'None cut' : `${mm(smallestCutMm(candidate))} mm`}</td>
              </tr>
            ) : (
              <>
                <tr>
                  <td>Tightest cut, left/right edge</td>
                  <td>{candidate.min_edge_cut_width === null ? 'None cut' : `${mm(candidate.min_edge_cut_width)} mm`}</td>
                </tr>
                <tr>
                  <td>Tightest cut, top/bottom edge</td>
                  <td>{candidate.min_edge_cut_height === null ? 'None cut' : `${mm(candidate.min_edge_cut_height)} mm`}</td>
                </tr>
              </>
            )}
            <tr><td>Slivers below the guard</td><td>{candidate.sliver_count}</td></tr>
            <tr><td>Distinct cut sizes</td><td>{candidate.distinct_cut_sizes}</td></tr>
            <tr><td>Material used</td><td>{(candidate.efficiency * 100).toFixed(1)}%</td></tr>
          </tbody>
        </table>
      </section>

      {diagramOpen && (
        <div className="cat-overlay" role="dialog" aria-modal="true" aria-label="Tile layout diagram" onClick={() => setDiagramOpen(false)}>
          <div className="cat-sheet" style={{ maxWidth: '95vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="masthead" style={{ marginTop: 0 }}>
              <span className="masthead-brand" style={{ fontSize: '13px' }}>TILE LAYOUT</span>
              <span className="masthead-section" />
              <button type="button" className="masthead-flash" onClick={() => setDiagramOpen(false)}>
                Close
              </button>
            </div>
            <div style={{ padding: '16px' }}>
              <img src={candidate.visualization} alt={`${candidate.label} — the full tile layout`} style={{ display: 'block', width: '100%', height: 'auto' }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TileResultDisplay;
