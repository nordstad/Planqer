/*
  The plan, drawn. The diagram runs the full width of the page because it is the
  thing the page exists to produce; the headline figures live above it on the
  plan step, so nothing here is stated twice.

  The order list and the cut order both derive from board_lengths_used — the same
  list the diagram draws from. Deriving them anywhere else is how the order list
  once said SPF-36 while the diagram drew a 4200 mm board.
*/

import { useState } from 'react';
import { Download } from './icons';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

const ResultDisplay = ({ result, projectName }) => {
  const [diagramOpen, setDiagramOpen] = useState(false);
  const used = result.board_lengths_used;
  const byType = used
    ? used.reduce((acc, len) => ({ ...acc, [len]: (acc[len] || 0) + 1 }), {})
    : result.cost_analysis?.boards_needed_by_type
      ?? { [result.optimal_board_length]: result.cut_list.length };
  const safeName = (projectName ? projectName : 'cutlist').replace(/[^a-zA-Z0-9_-]/g, '_');

  const downloadDiagram = () => {
    // The backend never rasterizes this live response — match the extension to
    // the data URL's own declared type rather than hardcoding one that can drift.
    const extension = result.visualization.startsWith('data:image/png') ? 'png' : 'svg';
    const a = document.createElement('a');
    a.href = result.visualization;
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
          aria-label="Enlarge cutting plan diagram"
        >
          <img src={result.visualization} alt="Cutting plan diagram: every board with its cuts in order" id="cutlist-image" />
        </button>
        <figcaption className="flex flex-wrap items-center justify-between gap-3" style={{ marginTop: '12px' }}>
          <span className="synthetic">
            {result.cut_list.length} boards · drawn to one scale · kerf in red · click to enlarge
          </span>
          <button type="button" className="btn" onClick={downloadDiagram}>
            <Download /> Download diagram
          </button>
        </figcaption>
      </figure>

      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-[300px_minmax(0,1fr)]" style={{ marginTop: '34px' }}>
        <section style={{ minWidth: 0 }}>
          <div className="section-rule">
            <h2 className="section-title">What to buy</h2>
          </div>
          <table className="cat-table">
            <thead><tr><th>Stock</th><th>Length mm</th><th>Qty</th></tr></thead>
            <tbody>
              {Object.entries(byType).map(([len, qty]) => (
                <tr key={len}>
                  <td>SPF-{Math.round(parseFloat(len) / 100)}</td>
                  <td>{mm(parseFloat(len))}</td>
                  <td>{qty}</td>
                </tr>
              ))}
              {/* Only the count totals here — material bought is a figure in the
                  answer above, and printing it under a column headed "Length mm"
                  read as a length it is not. */}
              <tr className="is-sum">
                <td>Σ</td>
                <td />
                <td>{result.cut_list.length}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section style={{ minWidth: 0 }}>
          <div className="section-rule">
            <h2 className="section-title">Cut order</h2>
            <span className="folio">Take this to the saw</span>
          </div>
          <ul className="cut-order" style={{ marginTop: '4px' }}>
            {result.cut_list.map((cuts, i) => (
              <li key={i}>
                <span className="cut-order-id">B{i + 1}</span>
                <span className="cut-order-cuts">
                  {Array.isArray(cuts) ? cuts.join(' · ') : String(cuts)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {diagramOpen && (
        <div className="cat-overlay" role="dialog" aria-modal="true" aria-label="Cutting plan diagram" onClick={() => setDiagramOpen(false)}>
          <div className="cat-sheet" style={{ maxWidth: '95vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="masthead" style={{ marginTop: 0 }}>
              <span className="masthead-brand" style={{ fontSize: '13px' }}>CUTTING PLAN</span>
              <span className="masthead-section" />
              <button type="button" className="masthead-flash" onClick={() => setDiagramOpen(false)}>
                Close
              </button>
            </div>
            <div style={{ padding: '16px' }}>
              <img src={result.visualization} alt="Cutting plan diagram: every board with its cuts in order" style={{ display: 'block', width: '100%', height: 'auto' }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ResultDisplay;
