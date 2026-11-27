/*
  The plan, drawn. The diagram runs the full width of the page because it is the
  thing the page exists to produce; the headline figures live above it on the
  plan step, so nothing here is stated twice.

   The order list derives from board_lengths_used — the same list the diagram
   draws from. Deriving it anywhere else is how it once disagreed with the
   diagram about which board length was bought.
*/

import { useState } from 'react';
import DiagramInspection from './DiagramInspection';
import { useTranslation } from 'react-i18next';
import { Download } from './icons';
import { translateWithFallback } from '../i18n/translate';
import { svgBlobToPngBlob } from '../utils/svgToPng';
import { boardStockLabel } from '../utils/boardStockLabel';

const mm = (n) => (Number.isFinite(n)
  ? n.toLocaleString('sv-SE', { maximumFractionDigits: 20 })
  : '—');

const ResultDisplay = ({ result, projectName, materialType, boardThickness, boardWidth }) => {
  const { t } = useTranslation();
  const text = (key, vars) => translateWithFallback(t, key, vars);
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const used = result.board_lengths_used;
  const byType = used
    ? used.reduce((acc, len) => ({ ...acc, [len]: (acc[len] || 0) + 1 }), {})
    : result.cost_analysis?.boards_needed_by_type
      ?? { [result.optimal_board_length]: result.cut_list.length };
  const safeName = (projectName ? projectName : 'cutlist').replace(/[^a-zA-Z0-9_-]/g, '_');

  const downloadDiagram = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      const source = await (await fetch(result.visualization)).blob();
      const png = source.type === 'image/png' ? source : await svgBlobToPngBlob(source);
      const url = URL.createObjectURL(png);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(text('projectUi.exportFailed', { format: 'PNG', message: error.message }));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <figure style={{ margin: 0, minWidth: 0 }}>
        <DiagramInspection src={result.visualization} alt={text('ui.boardDiagramAlt')} imageId="cutlist-image" className="cut-list-visualization" label={text('ui.enlargeBoardDiagram')} dialogLabel={text('ui.cuttingPlanDiagram')} />
        <figcaption className="flex flex-wrap items-center justify-between gap-3" style={{ marginTop: '12px' }}>
          <span className="synthetic">
             {text('ui.diagramCaption', { count: result.cut_list.length })}
          </span>
          <button type="button" className="btn btn-primary" onClick={downloadDiagram} disabled={downloading}>
             <Download /> {text('projectUi.downloadPng')}
          </button>
        </figcaption>
        {downloadError && <p className="alert-danger" role="alert">{downloadError}</p>}
      </figure>

      <section style={{ marginTop: '34px' }}>
          <div className="section-rule">
             <h2 className="section-title">{text('workflow.whatToBuy')}</h2>
          </div>
          <table className="cat-table">
           <thead><tr><th>{text('ui.stock')}</th><th>{text('ui.lengthMm')}</th><th>{text('ui.qty')}</th></tr></thead>
            <tbody>
              {Object.entries(byType).map(([len, qty]) => (
                <tr key={len}>
                   <td>{boardStockLabel(materialType, boardThickness, boardWidth, text('ui.board'))}</td>
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

    </>
  );
};

export default ResultDisplay;
