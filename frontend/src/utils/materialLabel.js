const MATERIAL_KEYS = {
  pine: 'ui.materialPine',
  spruce: 'ui.materialSpruce',
  oak: 'ui.materialOak',
  beech: 'ui.materialBeech',
  birch: 'ui.materialBirch',
  'pressure-treated': 'ui.materialPressureTreated',
  ceramic: 'ui.materialCeramic',
  porcelain: 'ui.materialPorcelain',
  stone: 'ui.materialStone',
  glass: 'ui.materialGlass',
};

export const materialLabel = (material, t) => {
  if (material === 'board') return t('ui.board');
  if (material === 'tile') return t('workflow.tile');
  return MATERIAL_KEYS[material] ? t(MATERIAL_KEYS[material]) : material;
};

/* Older model imports saved the placeholder word 'unknown' as the material.
   It means "not specified", so callers fall back to their neutral label. */
export const cleanMaterial = (material) => (material && material !== 'unknown' ? material : '');
