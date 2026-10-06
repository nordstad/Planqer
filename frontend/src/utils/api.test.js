import axios from 'axios';
import {
  normalizeSheetParts,
  optimizeCutting,
  optimizeSheetCutting,
  saveProject,
  saveSheetProject,
  serializeBoardParts,
} from './api';
import { modelGroupMetadata } from '../components/ModelCutlistOptimizer';

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

beforeEach(() => {
  vi.clearAllMocks();
  axios.post.mockResolvedValue({ data: { ok: true } });
});

it('aggregates duplicate board part lengths without losing quantity', () => {
  expect(serializeBoardParts([
    { length: '120.5', quantity: '2' },
    { length: '120.5', quantity: '3' },
  ])).toEqual({ '120.5': 5 });
});

it('keeps repeated model cutlist lengths lossless for handoff', () => {
  expect(serializeBoardParts([
    { length: 1200, quantity: 2 },
    { length: 1200, quantity: 3 },
  ])).toEqual({ 1200: 5 });
});

it('keeps sheet row identity separate from repeated display names', () => {
  expect(normalizeSheetParts([
    { id: 'row-a', name: 'Shelf', width: '10.5', height: '20.25', quantity: '2' },
    { id: 'row-b', name: 'Shelf', width: '30.5', height: '40.25', quantity: '1' },
    { name: 'Legacy', width: '50.5', height: '60.25', quantity: '1' },
  ])).toEqual([
    { id: 'row-a', name: 'Shelf', width: 10.5, height: 20.25, quantity: 2 },
    { id: 'row-b', name: 'Shelf', width: 30.5, height: 40.25, quantity: 1 },
    { id: 'part_3', name: 'Legacy', width: 50.5, height: 60.25, quantity: 1 },
  ]);
});

it('uses lossless board serialization for optimization and save', async () => {
  const parts = [
    { length: '120.5', quantity: '2' },
    { length: '120.5', quantity: '3' },
  ];

  await optimizeCutting(parts, ['300.5', '300.5'], '2.5');
  expect(axios.post.mock.calls[0][1]).toEqual(expect.objectContaining({
    parts: { '120.5': 5 },
    available_board_lengths: [300.5],
    saw_blade_width: 2.5,
  }));

  await saveProject({
    name: 'Fractional boards',
    parts,
    boards: ['300.5', '300.5'],
    sawKerf: '2.5',
    materialType: 'oak',
    boardThickness: '18.5',
    boardWidth: '45.25',
    result: { cut_list: [] },
  });
  expect(axios.post.mock.calls[1][1]).toEqual(expect.objectContaining({
    parts_data: { '120.5': 5 },
    board_lengths: [300.5],
    saw_blade_width: 2.5,
    material_type: 'oak',
    board_thickness: 18.5,
    board_width: 45.25,
  }));
});

it('preserves sheet IDs, names, fractional values, and metadata', async () => {
  const parts = [
    { id: 'row-a', name: 'Shelf', width: '10.5', height: '20.25', quantity: '2' },
    { id: 'row-b', name: 'Shelf', width: '30.5', height: '40.25', quantity: '1' },
  ];

  await optimizeSheetCutting(parts, '100.5', '200.25', '2.5', 'oak', 'best_fit_2d', false);
  expect(axios.post.mock.calls[0][1]).toEqual(expect.objectContaining({
    parts: {
      'row-a': { width: 10.5, height: 20.25, quantity: 2 },
      'row-b': { width: 30.5, height: 40.25, quantity: 1 },
    },
    sheet_width: 100.5,
    sheet_height: 200.25,
    kerf_width: 2.5,
    material_type: 'oak',
    algorithm: 'best_fit_2d',
    allow_rotation: false,
  }));

  await saveSheetProject({
    name: 'Fractional sheets',
    parts,
    sheetWidth: '100.5',
    sheetHeight: '200.25',
    sheetThickness: '12.5',
    kerfWidth: '2.5',
    materialType: 'oak',
    algorithm: 'best_fit_2d',
    allowRotation: false,
    result: { sheets: [] },
  });
  expect(axios.post.mock.calls[1][1]).toEqual(expect.objectContaining({
    parts_data: [
      { id: 'row-a', name: 'Shelf', width: 10.5, height: 20.25, quantity: 2 },
      { id: 'row-b', name: 'Shelf', width: 30.5, height: 40.25, quantity: 1 },
    ],
    sheet_width: 100.5,
    sheet_height: 200.25,
    sheet_thickness: 12.5,
    material_type: 'oak',
    algorithm: 'best_fit_2d',
    allow_rotation: false,
  }));
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

it('keeps model board and sheet material profiles for batch saves', () => {
  expect(modelGroupMetadata({ kind: 'board', material: 'oak', thickness: 45, width: 70 })).toEqual({
    materialType: 'oak',
    boardThickness: 45,
    boardWidth: 70,
  });
  expect(modelGroupMetadata({ kind: 'sheet', material: null, thickness: 12 })).toEqual({
    materialType: 'unknown',
    sheetThickness: 12,
  });
});
