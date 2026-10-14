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
const handle = vi.fn();
const entries = vi.fn();
vi.mock('../runtime/localBackend', () => ({ handle, entries }));

let api;

beforeEach(async () => {
  vi.clearAllMocks();
  entries.mockResolvedValue([]);
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

  expect(solverCall.mock.calls[0].slice(0, 2)).toEqual(['catalogue', { country: 'SE', entries: [] }]);
  expect(result).toEqual({ data: { products: [] }, etag: undefined });
});

it('says plainly when a server-only feature is asked for', async () => {
  handle.mockResolvedValue(null);

  await expect(api.getAdminUsers()).rejects.toThrow(/not available in the demo/i);
  expect(axios.get).not.toHaveBeenCalled();
});

it('keeps a saved project in the browser and returns the server\'s shape', async () => {
  handle.mockResolvedValue({ status: 200, body: { id: 'abc', name: 'Shelves' } });

  const saved = await api.saveProject({
    name: 'Shelves',
    parts: [{ name: 'Shelf', length: 100, quantity: 2 }],
    boards: [200],
    sawKerf: 3,
    result: { cut_list: [] },
  });

  expect(saved).toEqual({ id: 'abc', name: 'Shelves' });
  expect(handle).toHaveBeenCalledWith(
    'POST',
    '/projects',
    expect.objectContaining({ name: 'Shelves', parts_data: [{ name: 'Shelf', length: 100, quantity: 2 }], board_lengths: [200] }),
    undefined,
  );
  expect(axios.post).not.toHaveBeenCalled();
});

it('lists projects, groups and settings from the browser', async () => {
  handle.mockResolvedValue({ status: 200, body: [] });

  await api.getUserProjects();
  await api.getProjectGroups();
  await api.getUserSettings();

  expect(handle.mock.calls.map(([method, path]) => `${method} ${path}`)).toEqual([
    'GET /projects',
    'GET /project-groups',
    'GET /settings',
  ]);
});

it('shows the endpoint\'s message when the browser store refuses a save', async () => {
  handle.mockResolvedValue({ status: 404, body: { detail: 'Project not found' } });

  await expect(api.deleteProject('missing')).rejects.toThrow('Project not found');
});

it('downloads a saved diagram as a file', async () => {
  handle.mockResolvedValue({ status: 200, image: 'data:image/svg+xml;base64,PHN2Zy8+', name: 'x' });

  const blob = await api.downloadProjectImage('abc', 'board');

  expect(handle).toHaveBeenCalledWith('GET', '/projects/abc/image', undefined, { responseType: 'blob' });
  expect(await blob.text()).toBe('<svg/>');
});

it('fails a missing diagram the way the server download does', async () => {
  handle.mockResolvedValue({ status: 404, body: { detail: 'No diagram was saved with this cutlist' } });

  await expect(api.downloadProjectImage('abc', 'board')).rejects.toThrow('HTTP error! status: 404');
});
