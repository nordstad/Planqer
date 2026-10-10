/*
  The model flow's cutlist groups and the settings each one carries.

  Everything here is pure so the rules — grouping, naming, what counts as a
  priced plan, what "apply to all" copies — can be tested without rendering the
  page.
*/

import { materialLabel } from './materialLabel';
import { validateBoards, SAW_KERF_MIN, SAW_KERF_MAX } from './validators';

export const BOARD_MATERIALS = ['pine', 'spruce', 'oak', 'beech', 'birch', 'pressure-treated'];
export const SHEET_MATERIALS = ['plywood', 'mdf', 'metal', 'acrylic', 'cardboard'];
export const MATERIAL_OPTION_KEYS = {
  pine: 'ui.materialPine',
  spruce: 'ui.materialSpruce',
  oak: 'ui.materialOak',
  beech: 'ui.materialBeech',
  birch: 'ui.materialBirch',
  'pressure-treated': 'ui.materialPressureTreated',
  plywood: 'ui.materialPlywood',
  mdf: 'ui.materialMdf',
  metal: 'ui.materialMetal',
  acrylic: 'ui.materialAcrylic',
  cardboard: 'ui.materialCardboard',
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
export const naturalCompare = (a, b) => collator.compare(String(a), String(b));

const mergeBy = (entries, keyOf, make) => {
  const merged = new Map();
  entries.forEach((entry) => {
    const key = keyOf(entry);
    if (merged.has(key)) merged.get(key).qty += entry.qty;
    else merged.set(key, make(entry));
  });
  return [...merged.values()];
};

/* Every distinct size Planqer found becomes one cutlist, whatever format it
   came from. Material joins the grouping key: two identical rectangles in
   different materials are two different purchases, not one. */
export const groupBoards = (items) => {
  const grouped = new Map();
  items.forEach((item) => {
    const width = Math.round(item.width);
    const thickness = Math.round(item.thickness);
    if (width <= 0 || thickness <= 0) return;
    const material = item.material || null;
    const id = `board|${material || ''}|${width}x${thickness}`;
    if (!grouped.has(id)) {
      grouped.set(id, { id, kind: 'board', material, width, thickness, quantity: 0, names: [], lengths: [] });
    }
    const g = grouped.get(id);
    g.quantity += item.quantity;
    g.names.push(item.name);
    g.lengths.push({ length: Math.round(item.length), qty: item.quantity });
  });
  return [...grouped.values()].map((g) => ({
    ...g,
    names: [...g.names].sort(naturalCompare),
    lengths: mergeBy(g.lengths, (l) => l.length, (l) => ({ ...l })).sort((a, b) => b.length - a.length),
  }));
};

export const groupSheets = (items) => {
  const grouped = new Map();
  items.forEach((item) => {
    const thickness = Math.round(item.thickness);
    if (thickness <= 0) return;
    const material = item.material || null;
    const id = `sheet|${material || ''}|${thickness}`;
    if (!grouped.has(id)) {
      grouped.set(id, { id, kind: 'sheet', material, thickness, quantity: 0, names: [], sizes: [] });
    }
    const g = grouped.get(id);
    g.quantity += item.quantity;
    g.names.push(item.name);
    g.sizes.push({ length: Math.round(item.length), width: Math.round(item.width), qty: item.quantity });
  });
  return [...grouped.values()].map((g) => ({
    ...g,
    names: [...g.names].sort(naturalCompare),
    sizes: mergeBy(g.sizes, (s) => `${s.length}x${s.width}`, (s) => ({ ...s }))
      .sort((a, b) => b.length - a.length || b.width - a.width),
  }));
};

export const groupDims = (group) => (group.kind === 'board'
  ? `${group.thickness} × ${group.width} mm`
  : `${group.thickness} mm`);

/* The material the user settled on for a group: a preset key, or their own
   words. Empty means "not specified", and is saved as such — never as a
   placeholder word that would later be shown back to them. */
export const resolveMaterial = (config) => (
  config.material === 'custom' ? (config.customMaterial || '').trim() : (config.material || '')
);

export const groupLabel = (group, config, t) => {
  const custom = (config?.label || '').trim();
  if (custom) return custom;
  const material = materialLabel(resolveMaterial(config || {}), t);
  const lead = material || t(group.kind === 'board' ? 'modelUi.boardWord' : 'modelUi.sheetWord');
  return `${lead} ${groupDims(group)}`;
};

export const planNameFor = (modelName, group, config, t) => `${modelName} · ${groupLabel(group, config, t)}`;

export const BOARD_DEFAULTS = { boards: ['2500', '3600', '4200', '5100'], kerf: '3' };
export const SHEET_DEFAULTS = { width: '1200', height: '2500', kerf: '3', allowRotation: true };

/* A model-supplied material (a STEP part's name, say) starts as the group's own
   words; anything else starts unspecified. */
export const initialConfig = (group, defaults = {}) => {
  const base = {
    label: '',
    material: group.material ? 'custom' : '',
    customMaterial: group.material || '',
  };
  if (group.kind === 'board') {
    const lengths = defaults.boards?.length ? defaults.boards : BOARD_DEFAULTS.boards;
    return {
      ...base,
      boards: lengths.map((length) => ({ length: String(length), price: '' })),
      kerf: String(defaults.boardKerf ?? BOARD_DEFAULTS.kerf),
    };
  }
  return {
    ...base,
    sheetWidth: SHEET_DEFAULTS.width,
    sheetHeight: SHEET_DEFAULTS.height,
    kerf: String(defaults.sheetKerf ?? SHEET_DEFAULTS.kerf),
    allowRotation: SHEET_DEFAULTS.allowRotation,
    sheetPrice: '',
  };
};

/* Prices are optional per length. Only when every distinct length has one is a
   cost analysis requested; a partly-priced group plans for least waste exactly
   like an unpriced one, and says so. */
export const boardPricing = (config) => {
  const prices = new Map();
  config.boards.forEach(({ length, price }) => {
    const mm = parseFloat(length);
    if (!Number.isFinite(mm) || mm <= 0) return;
    const perMetre = parseFloat(price);
    if (!prices.has(mm) || !(prices.get(mm) > 0)) prices.set(mm, perMetre > 0 ? perMetre : 0);
  });
  const lengths = [...prices.keys()];
  const pricedCount = lengths.filter((mm) => prices.get(mm) > 0).length;
  const complete = lengths.length > 0 && pricedCount === lengths.length;
  const boardCosts = {};
  if (complete) {
    lengths.forEach((mm) => {
      boardCosts[mm] = { price_per_meter: prices.get(mm), price_per_board: prices.get(mm) * (mm / 1000) };
    });
  }
  return {
    state: complete ? 'complete' : pricedCount > 0 ? 'partial' : 'none',
    boardCosts,
  };
};

export const sheetPricing = (config) => {
  const price = parseFloat(config.sheetPrice);
  return { state: price > 0 ? 'complete' : 'none', price: price > 0 ? price : null };
};

export const pricingState = (group, config) => (group.kind === 'board'
  ? boardPricing(config).state
  : sheetPricing(config).state);

/* Same shape the board and sheet pages store, so a saved model plan reads back
   exactly like one saved from those pages. */
export const boardCostPayloads = (config, money) => {
  const { state, boardCosts } = boardPricing(config);
  if (state !== 'complete') return { costData: null, saved: null };
  return {
    costData: { enabled: true, currency: money.currency, boardCosts, optimizeFor: 'waste' },
    saved: {
      same_price_for_all: false,
      uniform_price: null,
      currency: money.currency,
      vat_rate: money.vatRate,
      prices_include_vat: money.pricesIncludeVat,
      optimize_for: 'waste',
      board_costs: boardCosts,
    },
  };
};

export const sheetPricingPayload = (config, money) => {
  const { price } = sheetPricing(config);
  return price
    ? {
      price_per_unit: price,
      currency: money.currency,
      vat_rate: money.vatRate,
      prices_include_vat: money.pricesIncludeVat,
    }
    : null;
};

const SETTING_FIELDS = {
  board: ['boards', 'kerf'],
  sheet: ['sheetWidth', 'sheetHeight', 'kerf', 'allowRotation', 'sheetPrice'],
};

const cloneSetting = (value) => (Array.isArray(value) ? value.map((row) => ({ ...row })) : value);

/* Copies stock, kerf and prices from one group to every other group of the
   same kind. Material and name stay as they are: those are what make the
   groups different in the first place. */
export const applySettingsToAll = (configs, groups, sourceId) => {
  const source = groups.find((g) => g.id === sourceId);
  if (!source) return configs;
  const next = { ...configs };
  groups.filter((g) => g.kind === source.kind).forEach((g) => {
    SETTING_FIELDS[g.kind].forEach((field) => {
      next[g.id] = { ...next[g.id], [field]: cloneSetting(configs[sourceId][field]) };
    });
  });
  return next;
};

const inRange = (value, min, max) => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= min && n <= max;
};

export const validateGroupConfig = (group, config, t) => {
  const kerfMax = group.kind === 'board' ? SAW_KERF_MAX : 50;
  const kerf = !config.kerf || parseFloat(config.kerf) < SAW_KERF_MIN
    ? t('modelUi.kerfZero')
    : parseFloat(config.kerf) > kerfMax ? t('modelUi.kerfWide') : '';
  if (group.kind === 'board') {
    const boards = validateBoards(config.boards.map((b) => b.length), t);
    return { boards, kerf, hasErrors: boards.some(Boolean) || !!kerf };
  }
  const width = inRange(config.sheetWidth, 100, 10000) ? '' : t('modelUi.sheetWidthPositive');
  const height = inRange(config.sheetHeight, 100, 10000) ? '' : t('modelUi.sheetHeightPositive');
  const sheetKerf = inRange(config.kerf, SAW_KERF_MIN, 50) ? '' : t('modelUi.kerfZero');
  return { width, height, kerf: sheetKerf, hasErrors: !!(width || height || sheetKerf) };
};

/* What "Plan alone" hands to the board and sheet pages. */
export const standaloneHandoff = (group, config, planName, sheetWord = 'Sheet') => {
  const material = resolveMaterial(config);
  const isPreset = (group.kind === 'board' ? BOARD_MATERIALS : SHEET_MATERIALS).includes(material);
  const materialFields = material
    ? (isPreset ? { materialType: material } : { materialType: 'custom', customMaterial: material })
    : {};
  if (group.kind === 'board') {
    return {
      key: 'planqer-3d-import',
      path: '/cutting?import=3d',
      data: {
        parts: Object.fromEntries(group.lengths.map((l) => [l.length, l.qty])),
        projectName: planName,
        ...materialFields,
        boardThickness: group.thickness,
        boardWidth: group.width,
        source: 'model-cutlist',
      },
    };
  }
  return {
    key: 'planqer-3d-sheet-import',
    path: '/sheet-cutting?import=3d',
    data: {
      parts: group.sizes.map((s, i) => ({
        width: s.width, height: s.length, quantity: s.qty,
        name: `${group.names[0] || sheetWord}_${i + 1}`, id: `sheet_${i + 1}`,
      })),
      projectName: planName,
      ...materialFields,
      sheetThickness: group.thickness,
      source: 'model-cutlist-sheet',
    },
  };
};
