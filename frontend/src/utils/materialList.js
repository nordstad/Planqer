import { materialLabel, cleanMaterial } from './materialLabel';

const mm = (value) => (Number.isFinite(value) ? Math.round(value).toLocaleString('sv-SE') : '—');
const LEGACY_CURRENCY = 'SEK';

const withMergeData = (row, data) => {
  Object.defineProperty(row, '_mergeData', { value: data, enumerable: false });
  return row;
};

const productMergeIdentity = (project) => {
  const product = project.product;
  if (!product) return { material: cleanMaterial(project.material_type) || '' };
  return {
    catalogueId: product.catalogue_id || null,
    name: product.catalogue_id ? null : product.name || cleanMaterial(project.material_type) || '',
    details: product.details || {},
  };
};

const boardRows = (project) => {
  const result = project.optimization_result;
  const byLength = Array.isArray(result?.board_lengths_used)
    ? result.board_lengths_used.reduce((counts, length) => {
      counts.set(Number(length), (counts.get(Number(length)) || 0) + 1);
      return counts;
    }, new Map())
    : result?.cost_analysis?.boards_needed_by_type
      ? new Map(Object.entries(result.cost_analysis.boards_needed_by_type)
        .map(([length, quantity]) => [Number(length), quantity]))
      : result?.optimal_board_length && result?.cut_list
        ? new Map([[Number(result.optimal_board_length), result.cut_list.length]])
        : new Map();

  return [...byLength].sort(([left], [right]) => left - right).map(([size, quantity]) => {
    const cost = project.board_costs?.board_costs?.[size];
    const pricePerUnit = Number(cost?.price_per_board);
    return withMergeData({
      plan: project.name,
      material: cleanMaterial(project.material_type) || 'board',
      size: project.board_thickness && project.board_width
        ? `${mm(project.board_thickness)} × ${mm(project.board_width)} × ${mm(parseFloat(size))} mm`
        : `${mm(parseFloat(size))} mm`,
      quantity,
      // Older saved board plans predate the currency/VAT snapshot fields. Their
      // prices used the app's original SEK, VAT-inclusive defaults.
      ...(Number.isFinite(pricePerUnit) && pricePerUnit > 0
        ? {
          pricePerUnit,
          currency: project.board_costs?.currency || LEGACY_CURRENCY,
          pricesIncludeVat: project.board_costs.prices_include_vat ?? true,
          vatRate: project.board_costs.vat_rate ?? 25,
        }
        : {}),
    }, {
      product: productMergeIdentity(project),
      kind: 'board',
      dimensions: [project.board_thickness || 0, project.board_width || 0],
      stock: Number(size),
    });
  });
};

const sheetRows = (project) => {
  const bySize = (project.optimization_result?.sheets || []).reduce((counts, sheet) => {
    const width = Number(sheet.sheet_width);
    const height = Number(sheet.sheet_height);
    const key = `${width}:${height}`;
    counts.set(key, { width, height, quantity: (counts.get(key)?.quantity || 0) + 1 });
    return counts;
  }, new Map());

  return [...bySize.values()].map(({ width, height, quantity }) => {
    return withMergeData({
      plan: project.name,
      material: cleanMaterial(project.material_type) || 'sheet',
      size: project.sheet_thickness
        ? `${mm(project.sheet_thickness)} × ${mm(parseFloat(width))} × ${mm(parseFloat(height))} mm`
        : `${mm(parseFloat(width))} × ${mm(parseFloat(height))} mm`,
      quantity,
      ...(Number(project.pricing?.price_per_unit) > 0 && project.pricing?.currency
        ? { pricePerUnit: Number(project.pricing.price_per_unit), currency: project.pricing.currency, pricesIncludeVat: project.pricing.prices_include_vat ?? true, vatRate: project.pricing.vat_rate ?? 25 }
        : {}),
    }, {
      product: productMergeIdentity(project),
      kind: 'sheet',
      dimensions: [project.sheet_thickness || 0, width, height],
      stock: [width, height],
    });
  });
};

const tileRows = (project) => {
  const quantity = project.layout_result?.tiles_to_purchase_with_waste
    ?? project.layout_result?.tiles_to_purchase;
  const width = project.tile_data?.width;
  const height = project.tile_data?.height;
  if (!Number.isFinite(quantity) || !Number.isFinite(width) || !Number.isFinite(height)) return [];

  return [withMergeData({
    plan: project.name,
    material: project.tile_data?.material_type || 'tile',
    size: project.tile_data?.thickness
      ? `${mm(project.tile_data.thickness)} × ${mm(width)} × ${mm(height)} mm`
      : `${mm(width)} × ${mm(height)} mm`,
    quantity,
    ...(Number(project.pricing?.price_per_unit) > 0 && project.pricing?.currency
      ? { pricePerUnit: Number(project.pricing.price_per_unit), currency: project.pricing.currency, pricesIncludeVat: project.pricing.prices_include_vat ?? true, vatRate: project.pricing.vat_rate ?? 25 }
      : {}),
  }, {
    product: { material: project.tile_data?.material_type || 'tile' },
    kind: 'tile',
    dimensions: [project.tile_data?.width, project.tile_data?.height],
    stock: null,
  })];
};

export const buildMaterialRows = (projects) => projects.flatMap((project) => {
  if (project.projectType === 'sheet') return sheetRows(project);
  if (project.projectType === 'tile') return tileRows(project);
  return boardRows(project);
});

const isPriced = (row) => row.pricePerUnit > 0 && Boolean(row.currency);

const samePrice = (left, right) => left.pricePerUnit === right.pricePerUnit
  && left.currency === right.currency
  && left.pricesIncludeVat === right.pricesIncludeVat
  && left.vatRate === right.vatRate;

const mergeKey = (row) => JSON.stringify(row._mergeData || {
  product: { material: row.material }, dimensions: [row.size], stock: null,
});

const stripPrice = (row) => {
  delete row.pricePerUnit;
  delete row.currency;
  delete row.pricesIncludeVat;
  delete row.vatRate;
};

/* Merge physical purchase rows without using displayed labels or prices as
   identity. Prices belong to plans, so equal products with different saved
   prices are still one thing to buy. Two different prices are a conflict; a
   priced plan merged with an unpriced one is just partly priced, so no price
   is guessed for the unpriced quantity. */
export const mergeMaterialRows = (rows) => rows.reduce((summary, row) => {
  const key = mergeKey(row);
  const existing = summary.get(key);
  if (!existing) {
    summary.set(key, withMergeData({ ...row, plans: [row.plan] }, row._mergeData));
    return summary;
  }
  existing.quantity += row.quantity;
  if (!existing.plans.includes(row.plan)) existing.plans.push(row.plan);
  if (existing._priceConflict) return summary;
  if (isPriced(existing) && isPriced(row)) {
    if (!samePrice(existing, row)) {
      stripPrice(existing);
      Object.defineProperty(existing, '_priceConflict', { value: true, enumerable: false });
    }
  } else if (isPriced(existing) || isPriced(row)) {
    stripPrice(existing);
  }
  return summary;
}, new Map());

export const applySpareMargin = (rows, marginPercent = 10) => {
  const margin = Number(marginPercent);
  return rows.map((row) => {
    const neededQuantity = Number(row.quantity) || 0;
    const spare = row._mergeData?.kind === 'tile'
      ? 0
      : margin > 0 ? Math.max(1, Math.ceil(neededQuantity * margin / 100)) : 0;
    const purchaseRow = withMergeData({ ...row, neededQuantity, quantityToBuy: neededQuantity + spare }, row._mergeData);
    if (row._priceConflict) Object.defineProperty(purchaseRow, '_priceConflict', { value: true, enumerable: false });
    return purchaseRow;
  });
};

export const isPlanPriced = (project) => {
  const rows = buildMaterialRows([project]);
  return rows.length > 0 && rows.every(isPriced);
};

export const materialRowsForPurchase = (projects, spareMargin = 10) => applySpareMargin(
  [...mergeMaterialRows(buildMaterialRows(projects)).values()],
  spareMargin,
);

export const summarizeMaterialPricing = (rows) => {
  const priced = rows.filter((row) => row.pricePerUnit > 0 && row.currency);
  const bases = new Set(priced.map((row) => `${row.currency}:${row.pricesIncludeVat}:${row.vatRate}`));
  const compatible = priced.length > 0 && bases.size === 1;
  const complete = rows.length > 0 && priced.length === rows.length && compatible;
  const first = priced[0];
  return {
    hasPrices: priced.length > 0,
    complete,
    compatible,
    unpricedCount: rows.length - priced.length,
    conflictCount: rows.filter((row) => row._priceConflict).length,
    total: compatible ? priced.reduce((sum, row) => sum + row.pricePerUnit * (row.quantityToBuy ?? row.quantity), 0) : null,
    currency: compatible ? first.currency : null,
    pricesIncludeVat: compatible ? first.pricesIncludeVat : null,
    vatRate: compatible ? first.vatRate : null,
  };
};

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export const buildMaterialListHtml = (projects, t, spareMargin = 10) => {
  const rows = materialRowsForPurchase(projects, spareMargin);
  if (!rows.length) return '';
  const pricing = summarizeMaterialPricing(rows);
  const priceHeadings = pricing.hasPrices
    ? `<th>${escapeHtml(t('ui.priceEach'))}</th><th>${escapeHtml(t('ui.cost'))}</th>`
    : '';
  const priceCells = (row) => pricing.hasPrices
    ? row.pricePerUnit
      ? `<td>${row.pricePerUnit.toFixed(2)} ${escapeHtml(row.currency)} · ${escapeHtml(row.pricesIncludeVat ? t('ui.includingVat') : t('ui.excludingVat'))} (${escapeHtml(row.vatRate)}%)</td><td>${(row.pricePerUnit * row.quantityToBuy).toFixed(2)} ${escapeHtml(row.currency)}</td>`
      : row._priceConflict
        ? `<td>${escapeHtml(t('ui.conflictingPrices'))}</td><td>—</td>`
      : `<td>${escapeHtml(t('ui.notPriced'))}</td><td>—</td>`
    : '';
  const basis = `${pricing.pricesIncludeVat ? t('ui.includingVat') : t('ui.excludingVat')} (${pricing.vatRate}%)`;
  const summary = pricing.complete
    ? t('ui.projectMaterialTotal', { total: pricing.total.toFixed(2), currency: pricing.currency, vat: basis })
    : pricing.compatible
      ? t('ui.pricedSubtotal', { total: pricing.total.toFixed(2), currency: pricing.currency, vat: basis })
      : pricing.hasPrices ? t('ui.mixedPricing') : '';
  return `
    <section class="shopping-list">
      <h2>${escapeHtml(t('workflow.whatToBuy'))}</h2>
       <table class="shopping-table">
         <thead><tr><th>${escapeHtml(t('workflow.planName'))}</th><th>${escapeHtml(t('legacy.material'))}</th><th>${escapeHtml(t('workflow.sizeMm'))}</th><th>${escapeHtml(t('ui.needed'))}</th><th>${escapeHtml(t('ui.toBuy'))}</th>${priceHeadings}</tr></thead>
        <tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.plans.join(', '))}</td><td>${escapeHtml(materialLabel(row.material, t))}</td><td>${escapeHtml(row.size)}</td><td>${row.neededQuantity}</td><td>${row.quantityToBuy}</td>${priceCells(row)}</tr>`).join('')}</tbody>
      </table>
      ${summary ? `<p class="shopping-total">${escapeHtml(summary)}</p>` : ''}
      ${pricing.unpricedCount > 0 && pricing.hasPrices ? `<p>${escapeHtml(t('ui.unpricedMaterialCount', { count: pricing.unpricedCount }))}</p>` : ''}
      ${pricing.conflictCount > 0 ? `<p>${escapeHtml(t('ui.conflictingPricesCount', { count: pricing.conflictCount }))}</p>` : ''}
    </section>`;
};

// A leading = + - @ makes spreadsheets evaluate the cell as a formula.
const csvCell = (value) => {
  const text = String(value ?? '').replace(/\u00a0/g, ' ');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const buildMaterialCsv = (projects, t, spareMargin = 10) => {
  const rows = materialRowsForPurchase(projects, spareMargin);
  const header = [
    t('workflow.planName'), t('legacy.material'), t('workflow.sizeMm'), t('ui.needed'), t('ui.toBuy'),
    t('ui.priceEach'), t('ui.cost'), t('settings.vatRate'),
  ];
  const lines = rows.map((row) => [
    row.plans.join(', '),
    materialLabel(row.material, t),
    row.size.replace(' mm', ''),
    row.neededQuantity,
    row.quantityToBuy,
    row.pricePerUnit ? `${row.pricePerUnit.toFixed(2)} ${row.currency}` : (row._priceConflict ? t('ui.conflictingPrices') : t('ui.notPriced')),
    row.pricePerUnit ? `${(row.pricePerUnit * row.quantityToBuy).toFixed(2)} ${row.currency}` : '',
    row.pricePerUnit ? `${row.pricesIncludeVat ? t('ui.includingVat') : t('ui.excludingVat')} (${row.vatRate}%)` : '',
  ].map(csvCell).join(','));
  return [header.map(csvCell).join(','), ...lines].join('\r\n');
};
