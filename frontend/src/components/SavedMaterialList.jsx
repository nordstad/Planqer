import { useTranslation } from 'react-i18next';

const mm = (value) => (Number.isFinite(value) ? Math.round(value).toLocaleString('sv-SE') : '—');

const BoardMaterialList = ({ result, t }) => {
  const byLength = Array.isArray(result?.board_lengths_used)
    ? result.board_lengths_used.reduce((counts, length) => ({
      ...counts,
      [length]: (counts[length] || 0) + 1,
    }), {})
    : result?.cost_analysis?.boards_needed_by_type
      || (result?.optimal_board_length && result?.cut_list
        ? { [result.optimal_board_length]: result.cut_list.length }
        : {});

  if (Object.keys(byLength).length === 0) return null;

  return (
    <section style={{ marginTop: '22px', marginBottom: '28px' }}>
      <div className="section-rule">
        <h2 className="section-title">{t('workflow.whatToBuy')}</h2>
      </div>
      <table className="cat-table" style={{ marginTop: '14px' }}>
        <thead><tr><th>{t('ui.stock')}</th><th>{t('ui.lengthMm')}</th><th>{t('ui.qty')}</th></tr></thead>
        <tbody>
          {Object.entries(byLength).map(([length, quantity]) => (
            <tr key={length}>
              <td>{t('ui.board')}</td>
              <td>{mm(parseFloat(length))}</td>
              <td>{quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

const SheetMaterialList = ({ project, t }) => {
  const bySize = (project.optimization_result?.sheets || []).reduce((counts, sheet) => {
    const size = `${sheet.sheet_width}x${sheet.sheet_height}`;
    return { ...counts, [size]: (counts[size] || 0) + 1 };
  }, {});

  if (Object.keys(bySize).length === 0) return null;

  return (
    <section style={{ marginTop: '22px', marginBottom: '28px' }}>
      <div className="section-rule">
        <h2 className="section-title">{t('workflow.whatToBuy')}</h2>
      </div>
      <table className="cat-table" style={{ marginTop: '14px' }}>
        <thead>
          <tr>
            <th>{t('legacy.material')}</th>
            <th>{t('workflow.sizeMm')}</th>
            <th>{t('ui.qty')}</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(bySize).map(([size, quantity]) => {
            const [width, height] = size.split('x');
            return (
              <tr key={size}>
                <td>{project.material_type}</td>
                <td>{mm(parseFloat(width))} × {mm(parseFloat(height))}</td>
                <td>{quantity}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};

const TileMaterialList = ({ project, t }) => {
  const quantity = project.layout_result?.tiles_to_purchase_with_waste
    ?? project.layout_result?.tiles_to_purchase;
  const width = project.tile_data?.width;
  const height = project.tile_data?.height;

  if (!Number.isFinite(quantity) || !Number.isFinite(width) || !Number.isFinite(height)) return null;

  return (
    <section style={{ marginTop: '22px', marginBottom: '28px' }}>
      <div className="section-rule">
        <h2 className="section-title">{t('workflow.whatToBuy')}</h2>
      </div>
      <table className="cat-table" style={{ marginTop: '14px' }}>
        <thead><tr><th>{t('workflow.tile')}</th><th>{t('workflow.sizeMm')}</th><th>{t('ui.qty')}</th></tr></thead>
        <tbody>
          <tr>
            <td>{t('workflow.tile')}</td>
            <td>{mm(width)} × {mm(height)}</td>
            <td>{quantity}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
};

const SavedMaterialList = ({ project }) => {
  const { t } = useTranslation();

  if (project.projectType === 'board') return <BoardMaterialList result={project.optimization_result} t={t} />;
  if (project.projectType === 'sheet') return <SheetMaterialList project={project} t={t} />;
  if (project.projectType === 'tile') return <TileMaterialList project={project} t={t} />;
  return null;
};

export default SavedMaterialList;
