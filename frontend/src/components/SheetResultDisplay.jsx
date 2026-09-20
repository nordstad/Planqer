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
import { useTranslation } from 'react-i18next';
import Disclosure from './Disclosure';
import { Download } from './icons';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

const area = (a) => (a >= 1000000 ? `${(a / 1000000).toFixed(2)} m²` : `${mm(a)} mm²`);

const SheetResultDisplay = ({ result, projectName }) => {
  const { t } = useTranslation();
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
           <h2 className="section-title">{t('workflow.sheetBySheet')}</h2>
           <span className="folio">{t('workflow.realProportions')}</span>
        </div>
        <div className="sheet-grid" style={{ marginTop: '18px' }}>
          {result.sheets.map((sheet, sheetIndex) => (
            <figure key={sheetIndex} style={{ margin: 0, minWidth: 0 }}>
              <figcaption className="sheet-cap">
                <b>{t('workflow.sheetNumber', { number: sheetIndex + 1 })}</b>
                <span>{t('workflow.percentUsed', { percent: sheet.efficiency.toFixed(1) })}</span>
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
                      title={`${part.part_id}: ${mm(part.width)} × ${mm(part.height)} mm${part.rotated ? ` · ${t('ui.turned90')}` : ''}`}
                    >
                      {roomForLabel && part.part_id}
                    </div>
                  );
                })}
              </div>
              <p className="synthetic" style={{ marginTop: '8px' }}>
                {t('workflow.sheetPartsCount', { width: mm(sheet.sheet_width), height: mm(sheet.sheet_height), count: sheet.parts_count })}
              </p>
            </figure>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginTop: '18px' }}>
          <p className="synthetic" style={{ margin: 0 }}>
             {t('ui.hatchingWaste')}
          </p>
          {hasDiagram && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={() => setDiagramOpen(true)}>
                 {t('workflow.viewFullDiagram')}
              </button>
              <button type="button" className="btn" onClick={downloadDiagram}>
                 <Download /> {t('workflow.downloadDiagram')}
              </button>
            </div>
          )}
        </div>
      </section>

      <div style={{ marginTop: '30px' }}>
        <Disclosure
           title={t('workflow.exactPlacements')}
           hint={t('workflow.placementsHint')}
          open={placementsOpen}
          onToggle={() => setPlacementsOpen(v => !v)}
        >
          <table className="cat-table">
            <thead>
              <tr><th>{t('ui.part')}</th><th>{t('ui.sheet')}</th><th>{t('workflow.sizeMm')}</th><th>{t('ui.atXY')}</th><th>{t('ui.turned')}</th><th>{t('ui.area')}</th></tr>
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
         <div className="cat-overlay" role="dialog" aria-modal="true" aria-label={t('ui.sheetLayoutDiagram')} onClick={() => setDiagramOpen(false)}>
          <div className="cat-sheet" style={{ maxWidth: '95vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="masthead" style={{ marginTop: 0 }}>
               <span className="masthead-brand" style={{ fontSize: '13px' }}>{t('ui.sheetLayout')}</span>
              <span className="masthead-section" />
              <button type="button" className="masthead-flash" onClick={() => setDiagramOpen(false)}>
                 {t('common.close')}
              </button>
            </div>
            <div style={{ padding: '16px' }}>
               <img src={result.visualization} alt={t('ui.sheetDiagramAlt')} style={{ display: 'block', width: '100%', height: 'auto' }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SheetResultDisplay;
