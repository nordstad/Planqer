import { useTranslation } from 'react-i18next';
import PlanSummary from './plan/PlanSummary';
import TileCutListTable from './TileCutListTable';
import TileDiagram from './TileDiagram';
import { useState } from 'react';
import useTileNavigation from './useTileNavigation';

const mm = (value) => `${Math.round(value)} mm`;

export const tileSummaryRows = (project, t, language) => {
  const result = project.layout_result;
  const rows = [
    [t('sheetPlan.material'), project.tile_data.material_type],
    [t('sheetPlan.size'), `${mm(project.tile_data.width)} × ${mm(project.tile_data.height)}`],
    [t('ui.tilesToBuy'), result.tiles_to_purchase_with_waste ?? result.tiles_to_purchase],
    [t('wallpaperUi.summarySaved'), project.updated_at.slice(0, 10)],
  ];
  if (Number(project.pricing?.price_per_unit) > 0 && project.pricing.currency) rows.splice(3, 0, [t('wallpaperUi.summaryCost'), `${((result.tiles_to_purchase_with_waste ?? result.tiles_to_purchase) * project.pricing.price_per_unit).toLocaleString(language, { maximumFractionDigits: 2 })} ${project.pricing.currency}`]);
  return rows;
};

const TilePlanDocument = ({ project }) => {
  const { t, i18n } = useTranslation();
  const [selectedCut, setSelectedCut] = useState(null);
  const [highlightedCut, setHighlightedCut] = useState(null);
  const [listHighlight, setListHighlight] = useState(null);
  const result = project.layout_result;
  const { listRef, activeCut, showInList } = useTileNavigation(result);
  return <div className="tile-plan-document">
    <PlanSummary title={t('wallpaperUi.summaryTitle')} rows={tileSummaryRows(project, t, i18n.language)} />
    <div className="tile-layout-pair">
      <section className="tile-layout-visual"><div className="section-rule"><h2 className="section-title">{t('ui.tileLayout')}</h2></div>{result.visualization && <TileDiagram className="tile-plan-interactive" candidate={result} highlightedLabel={listHighlight || activeCut} onSelect={setSelectedCut} onHighlight={setHighlightedCut} alt={t('ui.tileDiagramAlt')} />}</section>
      <TileCutListTable candidate={result} highlightedLabel={highlightedCut || activeCut} onHighlight={setListHighlight} selectedLabel={selectedCut} onCloseSelection={() => setSelectedCut(null)} navigationRef={listRef} onShowInList={showInList} />
    </div>
  </div>;
};

export default TilePlanDocument;
