/*
  The layout, drawn. The generated SVG uses the same primary diagram treatment
  as board plans, while the exact placements remain folded away for anyone who
  wants coordinates.

  The headline figures live above this on the plan step, so nothing is stated
  twice — and every figure printed here is one the solver returned.
*/

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Disclosure from './Disclosure';
import { ArrowLeft, ArrowRight, Download } from './icons';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

const area = (a) => (a >= 1000000 ? `${(a / 1000000).toFixed(2)} m²` : `${mm(a)} mm²`);

const SheetResultDisplay = ({ result, projectName }) => {
  const { t } = useTranslation();
  const [diagramOpen, setDiagramOpen] = useState(false);
  const [placementsOpen, setPlacementsOpen] = useState(false);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  useEffect(() => setSelectedSheetIndex(0), [result]);
  if (!result) return null;

  const safeName = (projectName ? projectName : 'sheet_layout').replace(/[^a-zA-Z0-9_-]/g, '_');
  const activeSheetIndex = Math.min(selectedSheetIndex, result.sheets.length - 1);
  const selectedSheet = result.sheets[activeSheetIndex];
  const selectedDiagram = result.sheet_visualizations?.[activeSheetIndex] || result.visualization;
  const hasDiagram = selectedDiagram && selectedDiagram !== 'data:image/png;base64,';

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
      <figure style={{ margin: 0, minWidth: 0 }}>
        {result.sheets.length > 1 && (
          <div className="sheet-navigator">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setSelectedSheetIndex(activeSheetIndex - 1)}
              disabled={activeSheetIndex === 0}
              aria-label={t('workflow.previousSheet')}
            ><ArrowLeft /></button>
            <label className="sheet-picker">
              <span>{t('workflow.sheetPosition', { current: activeSheetIndex + 1, total: result.sheets.length })}</span>
              <select
                value={activeSheetIndex}
                onChange={(event) => setSelectedSheetIndex(Number(event.target.value))}
                aria-label={t('workflow.sheetBySheet')}
              >
                {result.sheets.map((sheet, sheetIndex) => (
                  <option key={sheetIndex} value={sheetIndex}>
                    {t('workflow.sheetNumber', { number: sheetIndex + 1 })} · {t('workflow.percentUsed', { percent: sheet.efficiency.toFixed(1) })}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setSelectedSheetIndex(activeSheetIndex + 1)}
              disabled={activeSheetIndex === result.sheets.length - 1}
              aria-label={t('workflow.nextSheet')}
            ><ArrowRight /></button>
          </div>
        )}
        {hasDiagram && (
          <button
            type="button"
            className="cut-list-visualization"
            style={{ width: '100%', cursor: 'zoom-in' }}
            onClick={() => setDiagramOpen(true)}
            aria-label={t('ui.sheetDiagramAria', {
              number: activeSheetIndex + 1,
              width: mm(selectedSheet.sheet_width),
              height: mm(selectedSheet.sheet_height),
              parts: selectedSheet.parts_count,
              percent: selectedSheet.efficiency.toFixed(1),
            })}
          >
            <img
              src={selectedDiagram}
              alt={t('ui.sheetDiagramAria', {
                number: activeSheetIndex + 1,
                width: mm(selectedSheet.sheet_width),
                height: mm(selectedSheet.sheet_height),
                parts: selectedSheet.parts_count,
                percent: selectedSheet.efficiency.toFixed(1),
              })}
              className="sheet-diagram-image"
            />
          </button>
        )}
        <figcaption className="flex flex-wrap items-center justify-between gap-3" style={{ marginTop: '12px' }}>
           <p className="synthetic" style={{ margin: 0 }}>
              {t('ui.hatchingWaste')}
           </p>
          {hasDiagram && (
            <button type="button" className="btn" onClick={downloadDiagram}>
              <Download /> {t('workflow.downloadDiagram')}
            </button>
          )}
        </figcaption>
      </figure>

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
                <img src={selectedDiagram} alt={t('ui.sheetDiagramAlt')} style={{ display: 'block', width: '100%', height: 'auto' }} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SheetResultDisplay;
