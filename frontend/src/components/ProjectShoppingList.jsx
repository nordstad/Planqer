import { useTranslation } from 'react-i18next';
import { buildMaterialRows, summarizeMaterialPricing } from '../utils/materialList';
import { materialLabel } from '../utils/materialLabel';

const ProjectShoppingList = ({ projects }) => {
  const { t } = useTranslation();
  const rows = buildMaterialRows(projects).reduce((summary, row) => {
    const key = `${row.material}:${row.size}:${row.pricePerUnit ?? ''}:${row.currency ?? ''}:${row.pricesIncludeVat ?? ''}:${row.vatRate ?? ''}`;
    const existing = summary.get(key);
    if (existing) {
      existing.quantity += row.quantity;
    } else {
      summary.set(key, { ...row });
    }
    return summary;
  }, new Map());
  const values = [...rows.values()];
  const pricing = summarizeMaterialPricing(values);
  const basis = `${pricing.pricesIncludeVat ? t('ui.includingVat') : t('ui.excludingVat')} (${pricing.vatRate}%)`;

  return (
    <section className="project-shopping" data-testid="project-shopping-list">
      <div className="section-rule">
        <h2 className="section-title">{t('workflow.whatToBuy')}</h2>
        <span className="folio">{t('projectUi.shoppingListIntro')}</span>
      </div>
      {rows.size > 0 ? (
        <>
          <table className="cat-table project-shopping-table">
          <thead>
            <tr>
              <th>{t('ui.stock')}</th>
              <th>{t('workflow.sizeMm')}</th>
              <th>{t('ui.qty')}</th>
              {pricing.hasPrices && <><th>{t('ui.priceEach')}</th><th>{t('ui.cost')}</th></>}
            </tr>
          </thead>
          <tbody>
            {values.map((row) => (
              <tr key={`${row.material}-${row.size}-${row.pricePerUnit ?? ''}-${row.currency ?? ''}`}>
                <td>{materialLabel(row.material, t)}</td>
                <td>{row.size.replace(' mm', '')}</td>
                <td>{row.quantity}</td>
                {pricing.hasPrices && <>
                  <td>{row.pricePerUnit ? `${row.pricePerUnit.toFixed(2)} ${row.currency} · ${row.pricesIncludeVat ? t('ui.includingVat') : t('ui.excludingVat')} (${row.vatRate}%)` : t('ui.notPriced')}</td>
                  <td>{row.pricePerUnit ? `${(row.pricePerUnit * row.quantity).toFixed(2)} ${row.currency}` : '—'}</td>
                </>}
              </tr>
            ))}
          </tbody>
          </table>
          {pricing.total !== null && <p className="shopping-pricing-total">
            {pricing.complete
              ? t('ui.projectMaterialTotal', { total: pricing.total.toFixed(2), currency: pricing.currency, vat: basis })
              : t('ui.pricedSubtotal', { total: pricing.total.toFixed(2), currency: pricing.currency, vat: basis })}
          </p>}
          {pricing.hasPrices && !pricing.compatible && <p className="shopping-pricing-note">{t('ui.mixedPricing')}</p>}
          {pricing.hasPrices && pricing.unpricedCount > 0 && <p className="shopping-pricing-note">{t('ui.unpricedMaterialCount', { count: pricing.unpricedCount })}</p>}
        </>
      ) : (
        <p className="project-shopping-empty synthetic">{t('projectUi.shoppingListEmpty')}</p>
      )}
    </section>
  );
};

export default ProjectShoppingList;
