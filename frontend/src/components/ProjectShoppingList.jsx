import { useTranslation } from 'react-i18next';
import { buildMaterialRows } from '../utils/materialList';
import { materialLabel } from '../utils/materialLabel';

const ProjectShoppingList = ({ projects }) => {
  const { t } = useTranslation();
  const rows = buildMaterialRows(projects).reduce((summary, row) => {
    const key = `${row.material}:${row.size}`;
    const existing = summary.get(key);
    if (existing) {
      existing.quantity += row.quantity;
    } else {
      summary.set(key, { ...row });
    }
    return summary;
  }, new Map());

  return (
    <section className="project-shopping" data-testid="project-shopping-list">
      <div className="section-rule">
        <h2 className="section-title">{t('workflow.whatToBuy')}</h2>
        <span className="folio">{t('projectUi.shoppingListIntro')}</span>
      </div>
      {rows.size > 0 ? (
        <table className="cat-table project-shopping-table">
          <thead>
            <tr>
              <th>{t('ui.stock')}</th>
              <th>{t('workflow.sizeMm')}</th>
              <th>{t('ui.qty')}</th>
            </tr>
          </thead>
          <tbody>
            {[...rows.values()].map((row) => (
              <tr key={`${row.material}-${row.size}`}>
                <td>{materialLabel(row.material, t)}</td>
                <td>{row.size.replace(' mm', '')}</td>
                <td>{row.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="project-shopping-empty synthetic">{t('projectUi.shoppingListEmpty')}</p>
      )}
    </section>
  );
};

export default ProjectShoppingList;
