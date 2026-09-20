const mm = (value) => (Number.isFinite(value) ? Math.round(value).toLocaleString('sv-SE') : '—');

const boardRows = (project) => {
  const result = project.optimization_result;
  const byLength = Array.isArray(result?.board_lengths_used)
    ? result.board_lengths_used.reduce((counts, length) => ({
      ...counts,
      [length]: (counts[length] || 0) + 1,
    }), {})
    : result?.cost_analysis?.boards_needed_by_type
      || (result?.optimal_board_length && result?.cut_list
        ? { [result.optimal_board_length]: result.cut_list.length }
        : {});

  return Object.entries(byLength).map(([size, quantity]) => ({
    plan: project.name,
    material: 'board',
    size: `${mm(parseFloat(size))} mm`,
    quantity,
  }));
};

const sheetRows = (project) => {
  const bySize = (project.optimization_result?.sheets || []).reduce((counts, sheet) => {
    const size = `${sheet.sheet_width}x${sheet.sheet_height}`;
    return { ...counts, [size]: (counts[size] || 0) + 1 };
  }, {});

  return Object.entries(bySize).map(([size, quantity]) => {
    const [width, height] = size.split('x');
    return {
      plan: project.name,
      material: project.material_type || 'sheet',
      size: `${mm(parseFloat(width))} × ${mm(parseFloat(height))} mm`,
      quantity,
    };
  });
};

const tileRows = (project) => {
  const quantity = project.layout_result?.tiles_to_purchase_with_waste
    ?? project.layout_result?.tiles_to_purchase;
  const width = project.tile_data?.width;
  const height = project.tile_data?.height;
  if (!Number.isFinite(quantity) || !Number.isFinite(width) || !Number.isFinite(height)) return [];

  return [{
    plan: project.name,
    material: 'tile',
    size: `${mm(width)} × ${mm(height)} mm`,
    quantity,
  }];
};

export const buildMaterialRows = (projects) => projects.flatMap((project) => {
  if (project.projectType === 'sheet') return sheetRows(project);
  if (project.projectType === 'tile') return tileRows(project);
  return boardRows(project);
});

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export const buildMaterialListHtml = (projects, t) => {
  const rows = buildMaterialRows(projects);
  if (!rows.length) return '';
  const materialLabel = (material) => {
    if (material === 'board') return t('ui.board');
    if (material === 'tile') return t('workflow.tile');
    return material;
  };

  return `
    <section class="shopping-list">
      <h2>${escapeHtml(t('workflow.whatToBuy'))}</h2>
      <table class="shopping-table">
        <thead><tr><th>${escapeHtml(t('workflow.planName'))}</th><th>${escapeHtml(t('legacy.material'))}</th><th>${escapeHtml(t('workflow.sizeMm'))}</th><th>${escapeHtml(t('ui.qty'))}</th></tr></thead>
        <tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.plan)}</td><td>${escapeHtml(materialLabel(row.material))}</td><td>${escapeHtml(row.size)}</td><td>${row.quantity}</td></tr>`).join('')}</tbody>
      </table>
    </section>`;
};
