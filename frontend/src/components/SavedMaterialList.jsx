import { useTranslation } from 'react-i18next';
import { buildMaterialRows } from '../utils/materialList';
import { materialLabel } from '../utils/materialLabel';

const SavedMaterialList = ({ project }) => {
  const { t } = useTranslation();
  const rows = buildMaterialRows([project]);
  if (!rows.length) return null;

  return (
    <section style={{ marginTop: '22px', marginBottom: '28px' }}>
      <div className="section-rule">
        <h2 className="section-title">{t('workflow.whatToBuy')}</h2>
      </div>
      <table className="cat-table" style={{ marginTop: '14px' }}>
        <thead><tr><th>{t('ui.stock')}</th><th>{t('workflow.sizeMm')}</th><th>{t('ui.qty')}</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.material}-${row.size}`}>
               <td>{materialLabel(row.material, t)}</td>
              <td>{row.size.replace(' mm', '')}</td>
              <td>{row.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

export default SavedMaterialList;
