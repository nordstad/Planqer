import { useTranslation } from 'react-i18next';

const mm = (value) => (Number.isFinite(value) ? Math.round(value).toLocaleString('sv-SE') : '—');

const BoardCutList = ({ result, t }) => {
  if (!Array.isArray(result?.cut_list) || result.cut_list.length === 0) return null;

  return (
    <section style={{ marginTop: '22px', marginBottom: '28px' }}>
      <div className="section-rule">
        <h2 className="section-title">{t('ui.cutList')}</h2>
        <span className="folio">{t('workflow.cutOrder')}</span>
      </div>
      <ul className="cut-order" style={{ marginTop: '4px' }}>
        {result.cut_list.map((cuts, index) => (
          <li key={index}>
            <span className="cut-order-id">B{index + 1}</span>
            <span className="cut-order-cuts">
              {Array.isArray(cuts) ? cuts.join(' · ') : String(cuts)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};

const SheetCutList = ({ result, t }) => {
  if (!Array.isArray(result?.sheets) || result.sheets.length === 0) return null;

  return (
    <section style={{ marginTop: '22px', marginBottom: '28px' }}>
      <div className="section-rule">
        <h2 className="section-title">{t('ui.cutList')}</h2>
        <span className="folio">{t('workflow.exactPlacements')}</span>
      </div>
      <table className="cat-table" style={{ marginTop: '14px' }}>
        <thead>
          <tr>
            <th>{t('ui.part')}</th>
            <th>{t('ui.sheet')}</th>
            <th>{t('workflow.sizeMm')}</th>
            <th>{t('ui.atXY')}</th>
          </tr>
        </thead>
        <tbody>
          {result.sheets.flatMap((sheet, sheetIndex) => sheet.parts.map((part, partIndex) => (
            <tr key={`${sheetIndex}-${partIndex}`}>
              <td>{part.part_id}</td>
              <td>{sheetIndex + 1}</td>
              <td>{mm(part.width)} × {mm(part.height)}</td>
              <td>{Math.round(part.x)}, {Math.round(part.y)}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </section>
  );
};

const SavedCutList = ({ project }) => {
  const { t } = useTranslation();
  const result = project.optimization_result;

  if (project.projectType === 'board') return <BoardCutList result={result} t={t} />;
  if (project.projectType === 'sheet') return <SheetCutList result={result} t={t} />;
  return null;
};

export default SavedCutList;
