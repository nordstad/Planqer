import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Disclosure from './Disclosure';

const mm = (value) => `${Math.round(value)} mm`;

export const sheetSummaryRows = (project, t, language) => {
  const result = project.optimization_result;
  const rows = [
    [t('sheetPlan.material'), project.product?.material || project.material_type],
    [t('sheetPlan.thickness'), mm(project.sheet_thickness)],
    [t('sheetPlan.size'), `${mm(project.sheet_width)} × ${mm(project.sheet_height)}`],
    [t('sheetPlan.sheets'), result.total_sheets],
    [t('sheetPlan.parts'), project.parts_data.reduce((sum, part) => sum + (Number(part.quantity) || 0), 0)],
    [t('wallpaperUi.summarySaved'), project.updated_at.slice(0, 10)],
  ];
  if (Number(project.pricing?.price_per_unit) > 0 && project.pricing.currency) {
    rows.splice(4, 0, [t('wallpaperUi.summaryCost'), `${(result.total_sheets * project.pricing.price_per_unit).toLocaleString(language, { maximumFractionDigits: 2 })} ${project.pricing.currency}`]);
  }
  return rows;
};

const SheetPlanDocument = ({ project }) => {
  const { t, i18n } = useTranslation();
  const result = project.optimization_result;
  const sheets = result.sheets || [];
  const [sheetIndex, setSheetIndex] = useState(0);
  const [placementsOpen, setPlacementsOpen] = useState(false);
  useEffect(() => { setSheetIndex(0); setPlacementsOpen(false); }, [result]);
  const activeIndex = Math.min(sheetIndex, Math.max(sheets.length - 1, 0));
  const sheet = sheets[activeIndex];
  const diagram = result.sheet_visualizations?.[activeIndex] || result.visualization;

  return <div className="sheet-plan-document">
    <section><div className="section-rule"><h2 className="section-title">{t('wallpaperUi.summaryTitle')}</h2></div><dl className="plan-summary">{sheetSummaryRows(project, t, i18n.language).map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl></section>
    {sheets.length > 1 && <section><div className="section-rule"><h2 className="section-title">{t('workflow.sheetBySheet')}</h2></div><div className="sheet-plan-overview">{sheets.map((item, index) => <button type="button" key={index} className={`sheet-plan-thumbnail${index === activeIndex ? ' is-active' : ''}`} onClick={() => setSheetIndex(index)} aria-pressed={index === activeIndex}><img src={result.sheet_visualizations?.[index]} alt={t('workflow.sheetNumber', { number: index + 1 })} /><span>{t('workflow.sheetNumber', { number: index + 1 })} · {t('workflow.percentUsed', { percent: item.efficiency.toFixed(1) })}</span></button>)}</div></section>}
    {sheet && <section><div className="section-rule"><h2 className="section-title">{t('workflow.sheetNumber', { number: activeIndex + 1 })}</h2></div>{diagram && <img className="sheet-diagram-image sheet-plan-diagram" src={diagram} alt={t('ui.sheetDiagramAria', { number: activeIndex + 1, width: Math.round(sheet.sheet_width), height: Math.round(sheet.sheet_height), parts: sheet.parts_count, percent: sheet.efficiency.toFixed(1) })} />}<Disclosure title={t('workflow.exactPlacements')} hint={t('workflow.placementsHint')} open={placementsOpen} onToggle={() => setPlacementsOpen((open) => !open)}><table className="cat-table"><thead><tr><th>{t('ui.part')}</th><th>{t('workflow.sizeMm')}</th><th>{t('ui.atXY')}</th><th>{t('ui.turned')}</th></tr></thead><tbody>{sheet.parts.map((part, index) => <tr key={`${part.part_id}-${index}`}><th>{part.part_id}</th><td>{mm(part.width)} × {mm(part.height)}</td><td>{Math.round(part.x)}, {Math.round(part.y)}</td><td>{part.rotated ? '90°' : '—'}</td></tr>)}</tbody></table></Disclosure></section>}
  </div>;
};

export default SheetPlanDocument;
