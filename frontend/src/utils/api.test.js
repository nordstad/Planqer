import axios from 'axios';
import {
  createCatalogueEntry,
  getAdminCatalogue,
  getAuthToken,
  getCurrentUser,
  getSetupStatus,
  hideCatalogueEntry,
  normalizeSheetParts,
  optimizeCutting,
  optimizeSheetCutting,
  registerUser,
  resetCatalogueEntry,
  restoreCatalogueEntry,
  saveProject,
  saveSheetProject,
  serializeBoardParts,
  updateCatalogueEntry,
} from './api';
import { restoreBoardParts } from './boardParts';

vi.mock('axios', () => {
  const mockAxios = {
    delete: vi.fn(),
    get: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    post: vi.fn(),
    put: vi.fn(),
  };

  return {
    default: mockAxios,
  };
});

describe('admin catalogue request country', () => {
  const operations = [
    { name: 'list', call: getAdminCatalogue, method: 'get', args: [] },
    { name: 'create', call: createCatalogueEntry, method: 'post', args: [{ type: 'regel' }] },
    { name: 'update', call: updateCatalogueEntry, method: 'put', args: ['local:regel:48x98', { lengths: [3000] }] },
    { name: 'hide', call: hideCatalogueEntry, method: 'post', args: ['local:regel:48x98'] },
    { name: 'restore', call: restoreCatalogueEntry, method: 'post', args: ['local:regel:48x98'] },
    { name: 'reset', call: resetCatalogueEntry, method: 'delete', args: ['local:regel:48x98'] },
  ];
  beforeEach(() => {
    localStorage.clear();
    axios.get.mockResolvedValue({ data: [] });
    axios.delete.mockResolvedValue({});
  });
  afterEach(() => localStorage.clear());

  describe.each(operations)('$name', ({ call, method, args }) => {
    it.each(['SE', 'NO', 'generic', null])('uses captured country %j instead of the current choice', async (country) => {
      localStorage.setItem('partsible-catalogue-country-v1', country === 'NO' ? 'SE' : 'NO');
      await call(...args, country);
      expect(axios[method].mock.calls.at(-1).at(-1)).toEqual({
        params: country ? { catalogue: country } : undefined,
      });
    });

    it('keeps selection-derived behavior when the country argument is omitted', async () => {
      localStorage.setItem('partsible-catalogue-country-v1', 'SE');
      await call(...args);
      expect(axios[method].mock.calls.at(-1).at(-1)).toEqual({ params: { catalogue: 'SE' } });
      localStorage.setItem('partsible-catalogue-country-v1', 'NO');
      await call(...args);
      expect(axios[method].mock.calls.at(-1).at(-1)).toEqual({ params: { catalogue: 'NO' } });
    });
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  axios.post.mockResolvedValue({ data: { ok: true } });
  axios.put.mockResolvedValue({ data: { ok: true } });
});

it('aggregates duplicate board part lengths without losing quantity', () => {
  expect(serializeBoardParts([
    { length: '120', quantity: '2' },
    { length: '120', quantity: '3' },
  ])).toEqual({ '120': 5 });
});

it('distinguishes unreadable sign-in storage from a missing auth token', () => {
  const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('Denied', 'SecurityError');
  });
  try {
    expect(getAuthToken).toThrow(expect.objectContaining({ name: 'AuthStorageError' }));
  } finally { spy.mockRestore(); }
});

it.each([getCurrentUser, getSetupStatus])('preserves an auth-storage failure through startup lookup', async (lookup) => {
  const error = Object.assign(new Error('Storage unavailable'), { name: 'AuthStorageError' });
  axios.get.mockRejectedValueOnce(error);
  await expect(lookup()).rejects.toBe(error);
});

it.each(['1.5', '2parts', '', ' ', 'Infinity', 'NaN', '0', '-1', '10001', '1e5', '9007199254740993', null, true])(
  'rejects invalid board quantity %j before calculation, create, or update',
  async (quantity) => {
    const parts = [
      { length: '120', quantity: '2' },
      { length: '120', quantity },
    ];
    expect(() => serializeBoardParts(parts)).toThrow();
    await expect(optimizeCutting(parts, ['300'], '3')).rejects.toThrow();
    for (const id of [undefined, 'synthetic-plan']) {
      await expect(saveProject({ id, name: 'Invalid count', parts, boards: ['300'] })).rejects.toThrow();
    }
    expect(axios.post).not.toHaveBeenCalled();
    expect(axios.put).not.toHaveBeenCalled();
  },
);

it.each(['1', '10000', '1e2', '2.0', 100])(
  'preserves complete valid board quantity %j through calculation and saving',
  async (quantity) => {
    const parts = [
      { name: 'Front', length: '120', quantity },
    ];
    await optimizeCutting(parts, ['300'], '3');
    expect(axios.post.mock.calls[0][1].parts).toEqual({ '120': Number(quantity) });
    await saveProject({ name: 'Whole counts', parts, boards: ['300'], sawKerf: '3' });
    expect(axios.post.mock.calls[1][1].parts_data.map((part) => part.quantity)).toEqual([Number(quantity)]);
    await saveProject({ id: 'synthetic-plan', name: 'Whole counts', parts, boards: ['300'], sawKerf: '3' });
    expect(axios.put.mock.calls[0][1].parts_data.map((part) => part.quantity)).toEqual([Number(quantity)]);
  },
);

it('aggregates whole board counts written in exponent notation without truncation', () => {
  expect(serializeBoardParts([
    { length: '120', quantity: '1e2' },
    { length: '120', quantity: '2' },
  ])).toEqual({ '120': 102 });
});

it('restores named board rows and legacy length maps', () => {
  expect(restoreBoardParts([
    { name: 'Front rail', length: 120, quantity: 2 },
  ])).toEqual([
    { name: 'Front rail', length: '120', quantity: '2' },
  ]);
  expect(restoreBoardParts({ 120: 2 })).toEqual([
    { name: '', length: '120', quantity: '2' },
  ]);
});

it('sends the optional first-run setup code as a request header', async () => {
  const password = ['Testpassword', '123!'].join('');
  await registerUser('owner@example.com', password, 'setup-code');

  expect(axios.post).toHaveBeenCalledWith(
    expect.stringMatching(/\/api\/auth\/register$/),
    { email: 'owner@example.com', password },
    { headers: { 'X-Partsible-Setup-Secret': 'setup-code' } }
  );
});

it('keeps repeated model cutlist lengths lossless for handoff', () => {
  expect(serializeBoardParts([
    { length: 1200, quantity: 2 },
    { length: 1200, quantity: 3 },
  ])).toEqual({ 1200: 5 });
});

it('keeps sheet row identity separate from repeated display names', () => {
  expect(normalizeSheetParts([
    { id: 'row-a', name: 'Shelf', width: '10', height: '20', quantity: '2' },
    { id: 'row-b', name: 'Shelf', width: '30', height: '40', quantity: '1' },
    { name: 'Legacy', width: '50', height: '60', quantity: '1' },
  ])).toEqual([
    { id: 'row-a', name: 'Shelf', width: 10, height: 20, quantity: 2 },
    { id: 'row-b', name: 'Shelf', width: 30, height: 40, quantity: 1 },
    { id: 'part_3', name: 'Legacy', width: 50, height: 60, quantity: 1 },
  ]);
});

it.each(['1.5', '2parts', '', ' ', 'Infinity', 'NaN', '0', '-1', '1001', '9007199254740993'])(
  'rejects invalid sheet quantity %j before planning or saving',
  async (quantity) => {
    const parts = [{ id: 'row-a', width: '100', height: '200', quantity }];
    expect(() => normalizeSheetParts(parts)).toThrow();
    await expect(optimizeSheetCutting(parts, '1200', '2500', '3')).rejects.toThrow();
    await expect(saveSheetProject({ name: 'Invalid count', parts })).rejects.toThrow();
    expect(axios.post).not.toHaveBeenCalled();
  },
);

it.each(['1', '1000', '1e2', '2.0'])('preserves the complete valid sheet count %j in planning and save payloads', async (quantity) => {
  const parts = [{ id: 'row-a', width: '100', height: '200', quantity }];
  await optimizeSheetCutting(parts, '1200', '2500', '3');
  expect(axios.post.mock.calls[0][1].parts['row-a'].quantity).toBe(Number(quantity));
  await saveSheetProject({ name: 'Whole count', parts, sheetWidth: '1200', sheetHeight: '2500', kerfWidth: '3' });
  expect(axios.post.mock.calls[1][1].parts_data[0].quantity).toBe(Number(quantity));
});

it.each(['120.5', '100abc', 'Infinity'])('rejects unsupported board measurement %s before calculation or save', async (value) => {
  const parts = [{ name: 'Rail', length: '120', quantity: '2' }];
  await expect(optimizeCutting([{ ...parts[0], length: value }], ['300'], '3')).rejects.toThrow();
  await expect(optimizeCutting(parts, [value], '3')).rejects.toThrow();
  await expect(optimizeCutting(parts, ['300'], value)).rejects.toThrow();
  for (const field of ['parts', 'boards', 'sawKerf', 'boardThickness', 'boardWidth']) {
    const bad = field === 'parts' ? [{ ...parts[0], length: value }] : field === 'boards' ? [value] : value;
    for (const id of [undefined, 'synthetic']) {
      await expect(saveProject({ id, name: 'Board', parts, boards: ['300'], sawKerf: '3', [field]: bad })).rejects.toThrow();
    }
  }
  expect(axios.post).not.toHaveBeenCalled();
  expect(axios.put).not.toHaveBeenCalled();
});

it.each(['120.5', '100abc', 'Infinity'])('rejects unsupported sheet measurement %s before calculation or save', async (value) => {
  const parts = [{ id: 'row-a', name: 'Shelf', width: '100', height: '200', quantity: '2' }];
  for (const field of ['width', 'height']) {
    const badParts = [{ ...parts[0], [field]: value }];
    await expect(optimizeSheetCutting(badParts, '1200', '2500', '3')).rejects.toThrow();
  }
  for (const args of [[value, '2500', '3'], ['1200', value, '3'], ['1200', '2500', value]]) {
    await expect(optimizeSheetCutting(parts, ...args)).rejects.toThrow();
  }
  for (const field of ['sheetWidth', 'sheetHeight', 'sheetThickness', 'kerfWidth']) {
    for (const id of [undefined, 'synthetic']) {
      await expect(saveSheetProject({ id, name: 'Sheet', parts, sheetWidth: '1200', sheetHeight: '2500', kerfWidth: '3', [field]: value })).rejects.toThrow();
    }
  }
  expect(axios.post).not.toHaveBeenCalled();
  expect(axios.put).not.toHaveBeenCalled();
});

it('does not replace an explicitly unknown sheet material with plywood', async () => {
  await saveSheetProject({
    name: 'Unknown material',
    parts: [{ id: 'row-a', name: 'Part', width: '100', height: '200', quantity: '1' }],
    sheetWidth: '1200',
    sheetHeight: '2500',
    sheetThickness: '12',
    kerfWidth: '3',
    materialType: 'unknown',
    result: { sheets: [] },
  });

  expect(axios.post.mock.calls[0][1].material_type).toBe('unknown');
});
