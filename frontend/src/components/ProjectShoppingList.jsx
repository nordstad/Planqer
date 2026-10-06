import { useTranslation } from 'react-i18next';
import { buildMaterialRows } from '../utils/materialList';
import { materialLabel } from '../utils/materialLabel';

const ProjectShoppingList = ({ projects }) => {
  const { t } = useTranslation();
  const rows = buildMaterialRows(projects).reduce((summary, row) => {
    const key = `${row.material}:${row.size}:${row.pricePerUnit ?? ''}:${row.currency ?? ''}:${row.pricesIncludeVat ?? ''}`;
    const existing = summary.get(key);
    if (existing) {
      existing.quantity += row.quantity;
    } else {
      summary.set(key, { ...row });
    }
    return summary;
  }, new Map());
  const pricedRows = [...rows.values()].filter((row) => row.pricePerUnit && row.currency);
  const currencies = [...new Set(pricedRows.map((row) => row.currency))];
  const vatBases = [...new Set(pricedRows.map((row) => row.pricesIncludeVat))];
  const pricedSubtotal = currencies.length === 1
    && vatBases.length === 1
    ? pricedRows.reduce((total, row) => total + row.pricePerUnit * row.quantity, 0)
    : null;

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
              {pricedRows.length > 0 && <><th>{t('ui.priceEach')}</th><th>{t('ui.cost')}</th></>}
            </tr>
          </thead>
          <tbody>
            {[...rows.values()].map((row) => (
              <tr key={`${row.material}-${row.size}`}>
                <td>{materialLabel(row.material, t)}</td>
                <td>{row.size.replace(' mm', '')}</td>
                <td>{row.quantity}</td>
                {pricedRows.length > 0 && <>
                  <td>{row.pricePerUnit ? `${row.pricePerUnit.toFixed(2)} ${row.currency}` : t('ui.notPriced')}</td>
                  <td>{row.pricePerUnit ? `${(row.pricePerUnit * row.quantity).toFixed(2)} ${row.currency}` : '—'}</td>
                </>}
              </tr>
            ))}
          </tbody>
          </table>
          {pricedSubtotal !== null && <p className="synthetic" style={{ marginTop: '12px' }}>
            {t('ui.pricedSubtotal', { total: pricedSubtotal.toFixed(2), currency: currencies[0], vat: vatBases[0] ? t('ui.includingVat') : t('ui.excludingVat') })}
          </p>}
        </>
      ) : (
        <p className="project-shopping-empty synthetic">{t('projectUi.shoppingListEmpty')}</p>
      )}
    </section>
  );
};

export default ProjectShoppingList;
