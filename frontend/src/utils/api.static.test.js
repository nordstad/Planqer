import axios from 'axios';

vi.mock('axios', () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const solverCall = vi.fn();
vi.mock('../runtime/solver', () => ({ solverCall }));

let api;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_PLANQER_MODE', 'static');
  vi.resetModules();
  api = await import('./api');
});

afterEach(() => vi.unstubAllEnvs());

it('solves a cutting plan in the browser and returns the same body', async () => {
  solverCall.mockResolvedValue({ status: 200, body: { optimal_board_length: 200 } });

  const result = await api.optimizeCutting(
    [{ length: 100, quantity: 2 }],
    [{ length: 200 }],
    3,
  );

  expect(result).toEqual({ optimal_board_length: 200 });
  expect(solverCall).toHaveBeenCalledWith(
    'cutting_plan',
    expect.objectContaining({ parts: { 100: 2 }, saw_blade_width: 3 }),
    undefined,
    { timeoutMs: 45000 },
  );
  expect(axios.post).not.toHaveBeenCalled();
});

it('shows the endpoint\'s own message when the solver rejects the request', async () => {
  solverCall.mockResolvedValue({
    status: 400,
    body: { detail: 'The genetic algorithm supports at most 100 parts' },
  });

  await expect(
    api.optimizeCutting([{ length: 100, quantity: 2 }], [{ length: 200 }], 3),
  ).rejects.toThrow('The genetic algorithm supports at most 100 parts');
});

it('reads a validation list the way it does from the server', async () => {
  solverCall.mockResolvedValue({
    status: 422,
    body: { detail: [{ type: 'missing', loc: ['body', 'parts'], msg: 'Field required' }] },
  });

  await expect(
    api.optimizeSheetCutting([], 2440, 1220, 3, 'plywood'),
  ).rejects.toThrow('Field required');
});

it('sends a model file as bytes to the solver', async () => {
  solverCall.mockResolvedValue({ status: 200, body: { board_count: 1 } });
  const file = new File([new Uint8Array([7, 8])], 'shelf.stl');

  const result = await api.process3DCutlist(file, 'mm', 1, 'Shelf');

  expect(result).toEqual({ board_count: 1 });
  const [op, options, data, limits] = solverCall.mock.calls[0];
  expect(op).toBe('cutlist_3d');
  expect(options).toMatchObject({ filename: 'shelf.stl', project_name: 'Shelf' });
  expect([...data]).toEqual([7, 8]);
  expect(limits).toEqual({ timeoutMs: 180000 });
});

it('loads the catalogue from the browser and never reports it unchanged', async () => {
  solverCall.mockResolvedValue({ status: 200, body: { products: [] } });

  const result = await api.getCatalogue('"old-etag"', 'SE');

  expect(solverCall.mock.calls[0].slice(0, 2)).toEqual(['catalogue', { country: 'SE' }]);
  expect(result).toEqual({ data: { products: [] }, etag: undefined });
});

it('says plainly when a server-only feature is asked for', async () => {
  await expect(api.getAdminUsers()).rejects.toThrow(/not available in the demo/i);
  expect(axios.get).not.toHaveBeenCalled();
});
