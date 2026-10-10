import { useTranslation } from 'react-i18next';
import { materialRowsForPurchase, summarizeMaterialPricing } from '../utils/materialList';
import { materialLabel } from '../utils/materialLabel';

const ProjectShoppingList = ({ projects, spareMargin = 10 }) => {
  const { t } = useTranslation();
  const values = materialRowsForPurchase(projects, spareMargin);
  const pricing = summarizeMaterialPricing(values);
  const basis = `${pricing.pricesIncludeVat ? t('ui.includingVat') : t('ui.excludingVat')} (${pricing.vatRate}%)`;

  return (
    <section className="project-shopping" data-testid="project-shopping-list">
      <div className="section-rule">
        <h2 className="section-title">{t('workflow.whatToBuy')}</h2>
        <span className="folio">{t('projectUi.shoppingListIntro')}</span>
      </div>
       {values.length > 0 ? (
        <>
          <table className="cat-table project-shopping-table">
          <thead>
            <tr>
              <th>{t('ui.stock')}</th>
              <th>{t('workflow.sizeMm')}</th>
               <th>{t('ui.needed')}</th>
               <th>{t('ui.toBuy')}</th>
              {pricing.hasPrices && <><th>{t('ui.priceEach')}</th><th>{t('ui.cost')}</th></>}
            </tr>
          </thead>
          <tbody>
            {values.map((row, index) => (
              <tr key={`${row.material}-${row.size}-${row.pricePerUnit ?? ''}-${row.currency ?? ''}-${index}`}>
                <td>{materialLabel(row.material, t)}</td>
                <td>{row.size.replace(' mm', '')}</td>
                <td>{row.neededQuantity}</td>
                <td>{row.quantityToBuy}</td>
                {pricing.hasPrices && <>
                  <td>{row.pricePerUnit ? `${row.pricePerUnit.toFixed(2)} ${row.currency} · ${row.pricesIncludeVat ? t('ui.includingVat') : t('ui.excludingVat')} (${row.vatRate}%)` : row._priceConflict ? t('ui.conflictingPrices') : t('ui.notPriced')}</td>
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
          {pricing.conflictCount > 0 && <p className="shopping-pricing-note">{t('ui.conflictingPricesCount', { count: pricing.conflictCount })}</p>}
        </>
      ) : (
        <p className="project-shopping-empty synthetic">{t('projectUi.shoppingListEmpty')}</p>
      )}
    </section>
  );
};

export default ProjectShoppingList;
