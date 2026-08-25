/*
  The layout, drawn. Rebuilt onto this system's own grammar: one plate per sheet
  at its real proportions, then the exact placements folded away for anyone who
  wants coordinates.

  Unlike the board page, the generated SVG is NOT the inline hero here. A board
  diagram is wide and reads well across the page; a portrait sheet stretched to
  1080px becomes a two-thousand-pixel wall that buries everything under it and
  says exactly what the plates already say. So the generated figure is the thing
  you open and download, and the plates are what you read.

  The headline figures live above this on the plan step, so nothing is stated
  twice — and every figure printed here is one the solver returned.
*/

import { useState } from 'react';
import Disclosure from './Disclosure';
import { Download } from './icons';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

const area = (a) => (a >= 1000000 ? `${(a / 1000000).toFixed(2)} m²` : `${mm(a)} mm²`);

const SheetResultDisplay = ({ result, projectName }) => {
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [placementsOpen, setPlacementsOpen] = useState(false);
  if (!result) return null;

  const safeName = (projectName ? projectName : 'sheet_layout').replace(/[^a-zA-Z0-9_-]/g, '_');
  const hasDiagram = result.visualization && result.visualization !== 'data:image/png;base64,';

  const downloadDiagram = () => {
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
      <section>
        <div className="section-rule">
          <h2 className="section-title">Sheet by sheet</h2>
          <span className="folio">Each plate at its real proportions</span>
        </div>
        <div className="sheet-grid" style={{ marginTop: '18px' }}>
          {result.sheets.map((sheet, sheetIndex) => (
            <figure key={sheetIndex} style={{ margin: 0, minWidth: 0 }}>
              <figcaption className="sheet-cap">
                <b>Sheet {sheetIndex + 1}</b>
                <span>{sheet.efficiency.toFixed(1)}% used</span>
              </figcaption>
              <div
                className="sheet-plate"
                style={{ aspectRatio: `${sheet.sheet_width} / ${sheet.sheet_height}` }}
                role="img"
                aria-label={`Sheet ${sheetIndex + 1}: ${sheet.parts_count} parts on ${mm(sheet.sheet_width)} by ${mm(sheet.sheet_height)} millimetres, ${sheet.efficiency.toFixed(1)} per cent used`}
              >
                {sheet.parts.map((part, partIndex) => {
                  const wPct = (part.width / sheet.sheet_width) * 100;
                  const hPct = (part.height / sheet.sheet_height) * 100;
                  // A label below the legible floor is worse than no label — the
                  // placements table below carries every part either way.
                  const roomForLabel = wPct > 16 && hPct > 9;
                  return (
                    <div
                      key={partIndex}
                      className="sheet-part"
                      data-rotated={part.rotated ? 'true' : undefined}
                      style={{
                        left: `${(part.x / sheet.sheet_width) * 100}%`,
                        top: `${(part.y / sheet.sheet_height) * 100}%`,
                        width: `${wPct}%`,
                        height: `${hPct}%`,
                      }}
                      title={`${part.part_id}: ${mm(part.width)} × ${mm(part.height)} mm${part.rotated ? ' · turned 90°' : ''}`}
                    >
                      {roomForLabel && part.part_id}
                    </div>
                  );
                })}
              </div>
              <p className="synthetic" style={{ marginTop: '8px' }}>
                {mm(sheet.sheet_width)} × {mm(sheet.sheet_height)} mm · {sheet.parts_count} {sheet.parts_count === 1 ? 'part' : 'parts'}
              </p>
            </figure>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginTop: '18px' }}>
          <p className="synthetic" style={{ margin: 0 }}>
            Hatching is waste. A dashed outline is a part turned 90° to fit.
          </p>
          {hasDiagram && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={() => setDiagramOpen(true)}>
                View the full diagram
              </button>
              <button type="button" className="btn" onClick={downloadDiagram}>
                <Download /> Download diagram
              </button>
            </div>
          )}
        </div>
      </section>

      <div style={{ marginTop: '30px' }}>
        <Disclosure
          title="Exact placements"
          hint="Where every part sits, in millimetres from the sheet's top-left corner"
          open={placementsOpen}
          onToggle={() => setPlacementsOpen(v => !v)}
        >
          <table className="cat-table">
            <thead>
              <tr><th>Part</th><th>Sheet</th><th>Size mm</th><th>At x, y</th><th>Turned</th><th>Area</th></tr>
            </thead>
            <tbody>
              {result.sheets.flatMap((sheet, sheetIndex) =>
                sheet.parts.map((part, partIndex) => (
                  <tr key={`${sheetIndex}-${partIndex}`}>
                    <td>{part.part_id}</td>
                    <td>{sheetIndex + 1}</td>
                    <td>{mm(part.width)} × {mm(part.height)}</td>
                    <td>{Math.round(part.x)}, {Math.round(part.y)}</td>
                    <td>{part.rotated ? '90°' : '—'}</td>
                    <td>{area(part.width * part.height)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Disclosure>
      </div>

      {diagramOpen && (
        <div className="cat-overlay" role="dialog" aria-modal="true" aria-label="Sheet layout diagram" onClick={() => setDiagramOpen(false)}>
          <div className="cat-sheet" style={{ maxWidth: '95vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="masthead" style={{ marginTop: 0 }}>
              <span className="masthead-brand" style={{ fontSize: '13px' }}>SHEET LAYOUT</span>
              <span className="masthead-section" />
              <button type="button" className="masthead-flash" onClick={() => setDiagramOpen(false)}>
                Close
              </button>
            </div>
            <div style={{ padding: '16px' }}>
              <img src={result.visualization} alt="Sheet layout diagram: every sheet with its parts placed" style={{ display: 'block', width: '100%', height: 'auto' }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SheetResultDisplay;
