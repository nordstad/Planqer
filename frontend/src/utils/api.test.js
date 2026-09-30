import axios from 'axios';
import {
  normalizeSheetParts,
  optimizeCutting,
  optimizeSheetCutting,
  saveProject,
  saveSheetProject,
  serializeBoardParts,
} from './api';

jest.mock('axios', () => ({
  delete: jest.fn(),
  get: jest.fn(),
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
  post: jest.fn(),
  put: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
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
