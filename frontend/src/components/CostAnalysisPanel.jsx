import { useTranslation } from 'react-i18next';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');
const money = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '—');

const delta = (before, after, format, unchanged = 'unchanged') => {
  const d = Number(after) - Number(before);
  if (!Number.isFinite(d) || Math.abs(d) < 0.005) return unchanged;
  return `${d < 0 ? '−' : '+'}${format(Math.abs(d))}`;
};

const CostAnalysisPanel = ({ appliedCost, optimizeFor, previous, boardsUsed, offcut, onAddStockPrices, pricesDirty }) => {
  const { t } = useTranslation();

  const lineTotalFor = (boardLength) => {
    const hit = Object.entries(appliedCost?.costPerBoardType || {})
      .find(([key]) => parseFloat(key) === parseFloat(boardLength));
    return hit ? hit[1] : 0;
  };

  if (!appliedCost) {
    return (
      <div>
        <p className="synthetic" style={{ marginTop: '4px' }}>
          {t('ui.noPrices')}
        </p>
        <button type="button" className="btn" style={{ marginTop: '12px' }} onClick={onAddStockPrices}>
          {t('ui.addStockPrices')}
        </button>
      </div>
    );
  }

  const totalBoardsBought = Object.values(appliedCost.byType || {})
    .reduce((sum, quantity) => sum + quantity, 0);
  const perMetreOfParts = Number.isFinite(Number(appliedCost.costPerUseful))
    ? Number(appliedCost.costPerUseful) * 1000
    : null;

  return (
    <div>
      {pricesDirty && (
        <p className="alert-note" style={{ marginTop: '4px' }} role="status">
          {t('ui.changedPrices')}
        </p>
      )}
      <div style={{ marginTop: pricesDirty ? '20px' : '4px' }}>
        <div className="section-rule">
          <h3 className="section-title">{t('ui.whatCosts')}</h3>
          <span className="folio">{t('ui.allFigures', { currency: appliedCost.currency })}</span>
        </div>

        <p className="synthetic" style={{ marginTop: '10px', marginBottom: '14px' }}>
          {t('ui.ownPrices')}
        </p>

        <dl className="plan-facts">
          <div className="plan-fact"><dt>{t('ui.total')}</dt><dd>{money(appliedCost.totalCost)} {appliedCost.currency}</dd></div>
          <div className="plan-fact"><dt>{t('ui.inOffcut')}</dt><dd>{money(appliedCost.wasteCost)} {appliedCost.currency}</dd></div>
          {perMetreOfParts !== null && (
            <div className="plan-fact"><dt>{t('ui.perMetreParts')}</dt><dd>{money(perMetreOfParts)} {appliedCost.currency}</dd></div>
          )}
          <div className="plan-fact"><dt>{t('ui.chasing')}</dt><dd>{optimizeFor === 'cost' ? t('ui.leastMoney') : t('ui.leastWaste')}</dd></div>
        </dl>

        <p className="synthetic" style={{ marginTop: '10px' }}>{t('ui.offcutExplanation')}</p>

        {previous && (
          <div style={{ marginTop: '22px' }}>
            <span className="kicker">{t('ui.changedSince')}</span>
            <table className="cat-table" style={{ marginTop: '6px' }}>
              <thead><tr><th>{t('ui.figure')}</th><th>{t('ui.before')}</th><th>{t('ui.now')}</th><th>{t('ui.change')}</th></tr></thead>
              <tbody>
                <tr><td>{t('ui.total')} {appliedCost.currency}</td><td>{money(previous.totalCost)}</td><td>{money(appliedCost.totalCost)}</td><td>{delta(previous.totalCost, appliedCost.totalCost, money, t('ui.unchanged'))}</td></tr>
                <tr><td>{t('ui.boards')}</td><td>{previous.boardsUsed}</td><td>{boardsUsed}</td><td>{delta(previous.boardsUsed, boardsUsed, mm, t('ui.unchanged'))}</td></tr>
                <tr><td>{t('ui.offcut')} mm</td><td>{mm(previous.offcut)}</td><td>{mm(offcut)}</td><td>{delta(previous.offcut, offcut, mm, t('ui.unchanged'))}</td></tr>
              </tbody>
            </table>
            <p className="synthetic" style={{ marginTop: '8px' }}>{t('ui.diagramRedrawn')}</p>
          </div>
        )}

        <div style={{ marginTop: '22px' }}>
          <span className="kicker">{t('ui.buy')}</span>
          <table className="cat-table" style={{ marginTop: '6px' }}>
            <thead><tr><th>{t('ui.stock')}</th><th>{t('ui.boards')}</th><th>{t('ui.perBoard')}</th><th>{t('ui.cost')}</th></tr></thead>
            <tbody>
              {Object.entries(appliedCost.byType || {}).map(([boardLength, quantity]) => {
                const lineTotal = lineTotalFor(boardLength);
                return (
                  <tr key={boardLength}>
                    <td>{mm(parseFloat(boardLength))} mm</td>
                    <td>{quantity}</td>
                    <td>{quantity ? money(lineTotal / quantity) : '—'}</td>
                    <td>{money(lineTotal)}</td>
                  </tr>
                );
              })}
              <tr className="is-sum"><td>Σ</td><td>{totalBoardsBought}</td><td /><td>{money(appliedCost.totalCost)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CostAnalysisPanel;
