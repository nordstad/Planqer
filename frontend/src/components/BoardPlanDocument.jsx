import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import PlanSummary from './plan/PlanSummary';
import { restoreBoardParts } from '../utils/boardParts';

const mm = (value) => `${Math.round(value)} mm`;

const boardCounts = (result) => (result.board_lengths_used || []).reduce((counts, length) => ({ ...counts, [length]: (counts[length] || 0) + 1 }), {});

export const boardSummaryRows = (project, t, language) => {
  const result = project.optimization_result;
  const boards = result.cut_list || [];
  const parts = restoreBoardParts(project.parts_data);
  const rows = [
    [t('sheetPlan.material'), project.product?.material || project.material_type],
    [t('sheetPlan.thickness'), `${mm(project.board_thickness)} × ${mm(project.board_width)}`],
    [t('ui.stock'), Object.entries(boardCounts(result)).map(([length, count]) => `${count} × ${mm(Number(length))}`).join(', ') || '—'],
    [t('workflow.parts'), parts.reduce((sum, part) => sum + (Number(part.quantity) || 0), 0)],
    [t('legacy.boards'), boards.length],
    [t('wallpaperUi.summarySaved'), project.updated_at.slice(0, 10)],
  ];
  if (Number(result.cost_analysis?.total_cost) > 0 && result.cost_analysis.currency) rows.splice(5, 0, [t('wallpaperUi.summaryCost'), `${Number(result.cost_analysis.total_cost).toLocaleString(language, { maximumFractionDigits: 2 })} ${result.cost_analysis.currency}`]);
  return rows;
};

const BoardPlanDocument = ({ project }) => {
  const { t, i18n } = useTranslation();
  const result = project.optimization_result;
  const boards = result.cut_list || [];
  const [boardIndex, setBoardIndex] = useState(0);
  const activeIndex = Math.min(boardIndex, Math.max(boards.length - 1, 0));

  return <div className="board-plan-document">
    <PlanSummary title={t('wallpaperUi.summaryTitle')} rows={boardSummaryRows(project, t, i18n.language)} />
    {result.visualization && <section><div className="section-rule"><h2 className="section-title">{t('ui.cuttingPlan')}</h2></div><img className="board-plan-diagram" src={result.visualization} alt={t('ui.boardDiagramAlt')} /></section>}
    {boards.length > 0 && <section><div className="section-rule"><h2 className="section-title">{t('workflow.boardByBoard')}</h2></div><div className="board-plan-picker" role="tablist">{boards.map((board, index) => <button key={index} type="button" role="tab" aria-selected={index === activeIndex} className={`sheet-plan-thumbnail${index === activeIndex ? ' is-active' : ''}`} onClick={() => setBoardIndex(index)}>{t('workflow.boardNumber', { number: index + 1 })} · {mm(result.board_lengths_used?.[index] || 0)}</button>)}</div><table className="cat-table board-plan-cuts"><thead><tr><th>{t('workflow.cutOrder')}</th><th>{t('ui.lengthMm')}</th></tr></thead><tbody>{(boards[activeIndex] || []).map((length, index) => <tr key={index}><th>{index + 1}</th><td>{mm(Number(length))}</td></tr>)}</tbody></table></section>}
  </div>;
};

export default BoardPlanDocument;
