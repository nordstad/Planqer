import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ModelCutlistOptimizer from './ModelCutlistOptimizer';
import { LanguageProvider } from '../contexts/LanguageContext';
import {
  process3DCutlist, optimizeCutting, saveProject, optimizeSheetCutting, saveSheetProject,
  getProjectGroups, createProjectGroup, getUserSettings, getCatalogue,
} from '../utils/api';
import { resetCatalogueCache } from '../utils/catalogue';

vi.mock('../utils/api', () => ({
  process3DCutlist: vi.fn(),
  processStepCutlist: vi.fn(),
  optimizeCutting: vi.fn(),
  saveProject: vi.fn(),
  optimizeSheetCutting: vi.fn(),
  saveSheetProject: vi.fn(),
  getProjectGroups: vi.fn(),
  createProjectGroup: vi.fn(),
  getUserSettings: vi.fn(),
  getCatalogue: vi.fn(),
}));

const mockUser = { id: 'u1', email: 'a@b.c' };
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isAuthenticated: true, logout: vi.fn() }),
}));

vi.mock('./CatalogPage', () => ({ default: ({ children }) => <div>{children}</div> }));

const benchModel = {
  boards: [
    { name: 'board_10', width: 95, thickness: 45, length: 500, quantity: 1 },
    { name: 'board_2', width: 95, thickness: 45, length: 1800, quantity: 2 },
    { name: 'board_1', width: 95, thickness: 45, length: 500, quantity: 3 },
    { name: 'post', width: 95, thickness: 95, length: 755, quantity: 4 },
  ],
  sheets: [{ name: 'sheet_2', width: 800, thickness: 15, length: 1800, quantity: 1 }],
};

const product = (id, type, kind, thickness, width, extra = {}) => ({
  id, type, kind, country: 'SE', thickness, width, lengths: [], max_length: null, formats: [],
  species: ['spruce'], treatments: [], grades: ['C24'], profiles: [],
  sources: ['https://www.traguiden.se/'], note: null, ...extra,
});

const catalogue = {
  country: 'SE',
  country_name: 'Sweden',
  types: [
    { key: 'regel', kind: 'board', rank: 10, labels: { en: 'Framing timber / studs', sv: 'Träreglar', nb: 'Reisverk' }, aliases: ['stud'], details: ['species', 'grade'] },
    { key: 'planhyvlat', kind: 'board', rank: 60, labels: { en: 'Planed timber', sv: 'Planhyvlat virke', nb: 'Planhøvlet virke' }, aliases: [], details: ['species'] },
    { key: 'custom', kind: 'board', rank: 999, labels: { en: 'Other' }, aliases: [], details: [] },
    { key: 'plywood', kind: 'sheet', rank: 10, labels: { en: 'Plywood', sv: 'Plywood', nb: 'Kryssfiner' }, aliases: [], details: ['grade'] },
    { key: 'sheet-custom', kind: 'sheet', rank: 999, labels: { en: 'Other sheet' }, aliases: [], details: [] },
  ],
  details: {
    species: [{ key: 'spruce', labels: { en: 'Spruce', sv: 'Gran', nb: 'Gran' } }],
    treatment: [],
    profile: [],
  },
  products: [
    product('se:regel:45x95', 'regel', 'board', 45, 95, { lengths: [2400, 3000] }),
    product('se:planhyvlat:95x95', 'planhyvlat', 'board', 95, 95),
    product('se:plywood:15', 'plywood', 'sheet', 15, null, { formats: [{ width: 1200, height: 2400 }] }),
  ],
};

// Awaited so the signed-in user's saved defaults have landed before anything is read.
const renderFlow = async () => {
  let view;
  await act(async () => {
    view = render(
      <MemoryRouter>
        <LanguageProvider>
          <ModelCutlistOptimizer />
        </LanguageProvider>
      </MemoryRouter>,
    );
  });
  return view;
};

const readBench = async () => {
  const { container } = await renderFlow();
  const input = container.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [new File(['solid'], 'bench.stl')] } });
  fireEvent.click(screen.getByRole('button', { name: /read the model/i }));
  await screen.findByRole('heading', { name: 'Cutlists found' });
};

const chooseOwnProduct = async (label, text) => {
  const box = screen.getByRole('combobox', { name: label });
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: text } });
  fireEvent.mouseDown(await screen.findByRole('option', { name: `Use “${text}” as my own product` }));
};

const toSaveStep = async () => {
  await readBench();
  fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
  await screen.findByRole('heading', { name: /plan and save/i });
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetCatalogueCache();
  getCatalogue.mockRejectedValue(new Error('no catalogue'));
  process3DCutlist.mockResolvedValue(benchModel);
  getProjectGroups.mockResolvedValue([]);
  getUserSettings.mockResolvedValue({ default_currency: 'SEK', default_vat_rate: 25, default_prices_include_vat: true });
  optimizeCutting.mockResolvedValue({ cut_list: [] });
  optimizeSheetCutting.mockResolvedValue({ sheets: [] });
  saveProject.mockResolvedValue({ id: 'p1' });
  saveSheetProject.mockResolvedValue({ id: 's1' });
});

describe('cutlists step', () => {
  it('shows neutral labels and never the word unknown', async () => {
    await readBench();
    expect(screen.getByLabelText(/Name for Board 45 × 95 mm/)).toHaveAttribute('placeholder', 'Board 45 × 95 mm');
    expect(screen.getByLabelText(/Name for Board 95 × 95 mm/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Name for Sheet 15 mm/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/unknown/i);
    expect(document.body.textContent).not.toMatch(/SPF-/);
  });

  it('lists part names in natural order', async () => {
    await readBench();
    expect(screen.getByText('board_1, board_2, board_10')).toBeInTheDocument();
  });

  it('expands and collapses the length breakdown', async () => {
    await readBench();
    const [toggle] = screen.getAllByRole('button', { name: 'Show lengths' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const breakdown = screen.getByTestId(/^breakdown-board/);
    expect(within(breakdown).getByText(/1.800 mm × 2/)).toBeInTheDocument();
    expect(within(breakdown).getByText(/500 mm × 4/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide lengths' }));
    expect(screen.queryByTestId(/^breakdown-/)).not.toBeInTheDocument();
  });

  it('renames a cutlist and lets each one have its own product', async () => {
    await readBench();
    fireEvent.change(screen.getByLabelText(/Name for Board 45 × 95 mm/), { target: { value: 'Legs' } });
    await chooseOwnProduct('Product for Legs', 'Larch');

    expect(within(screen.getAllByTestId('product-summary')[0]).getByText('Larch')).toBeInTheDocument();
    expect(screen.getAllByText(/product catalogue could not be loaded/)).toHaveLength(2);
  });

  it('pre-selects the common catalogue match for each size and marks it Suggested', async () => {
    getCatalogue.mockResolvedValue({ data: catalogue, etag: '"x"' });
    await readBench();

    const summaries = screen.getAllByTestId('product-summary').map((node) => node.textContent);
    expect(summaries[0]).toMatch(/Framing timber \/ studs 45 × 95 mm.*Suggested/);
    expect(summaries[1]).toMatch(/Planed timber 95 × 95 mm.*Suggested/);
    expect(summaries[2]).toMatch(/Plywood 15 mm.*Suggested/);
    expect(screen.getByLabelText('Name for Framing timber / studs 45 × 95 mm')).toBeInTheDocument();
  });

  it('lets a suggestion be confirmed, and remembers a changed choice for that size', async () => {
    getCatalogue.mockResolvedValue({ data: catalogue, etag: '"x"' });
    await readBench();

    fireEvent.click(within(screen.getAllByTestId('product-summary')[0].parentElement).getByRole('button', { name: 'Looks right' }));
    expect(screen.getAllByTestId('product-summary').filter((n) => /Suggested/.test(n.textContent))).toHaveLength(2);

    await chooseOwnProduct('Product for Framing timber / studs 45 × 95 mm', 'Larch');
    expect(JSON.parse(localStorage.getItem('planqer-product-choice-v1'))['board:45x95']).toMatchObject({ text: 'Larch', suggested: false });
  });

  it('hands the chosen product to the board page on Plan alone', async () => {
    delete window.location;
    window.location = { href: '' };
    getCatalogue.mockResolvedValue({ data: catalogue, etag: '"x"' });
    await readBench();
    fireEvent.click(screen.getAllByRole('button', { name: 'Plan alone' })[0]);
    const handoff = JSON.parse(localStorage.getItem('planqer-3d-import'));
    expect(handoff).toMatchObject({
      boardThickness: 45, boardWidth: 95, projectName: 'bench · Framing timber / studs 45 × 95 mm',
      product: { type: 'regel', suggested: true, product: { id: 'se:regel:45x95' } },
    });
    expect(handoff).not.toHaveProperty('materialType');
    expect(window.location.href).toBe('/cutting?import=3d');
  });
});

describe('save step', () => {
  it('gives every selected cutlist its own stock and prices', async () => {
    await toSaveStep();
    expect(screen.getByRole('region', { name: 'Board 45 × 95 mm' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Board 95 × 95 mm' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sheet 15 mm' })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/SPF-/);
  });

  it('plans unpriced groups without blocking and saves no cost', async () => {
    await toSaveStep();
    fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    expect(optimizeCutting.mock.calls[0][3]).toBeNull();
    expect(saveProject.mock.calls[0][0]).toMatchObject({ materialType: '', boardCosts: null, name: 'bench · Board 45 × 95 mm' });
    expect(saveSheetProject.mock.calls[0][0]).toMatchObject({ materialType: '', pricing: null, name: 'bench · Sheet 15 mm' });
  });

  it('sends the existing cost payloads when a group is completely priced', async () => {
    await toSaveStep();
    const legs = within(screen.getByRole('region', { name: 'Board 45 × 95 mm' }));
    ['2500', '3600', '4200', '5100'].forEach((length) => {
      fireEvent.change(legs.getByLabelText(new RegExp(`${length}`)), { target: { value: '30' } });
    });
    expect(legs.getByRole('status')).toHaveTextContent(/includes its cost/);
    const sheet = within(screen.getByRole('region', { name: 'Sheet 15 mm' }));
    fireEvent.change(sheet.getByLabelText(/Price per sheet/), { target: { value: '350' } });

    fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));

    const [firstCall, secondCall] = [optimizeCutting.mock.calls[0], optimizeCutting.mock.calls[1]];
    expect(firstCall[3]).toMatchObject({ enabled: true, currency: 'SEK', optimizeFor: 'waste' });
    expect(firstCall[3].boardCosts[2500]).toEqual({ price_per_meter: 30, price_per_board: 75 });
    expect(secondCall[3]).toBeNull();
    expect(saveProject.mock.calls[0][0].boardCosts).toMatchObject({ currency: 'SEK', vat_rate: 25, prices_include_vat: true });
    expect(saveProject.mock.calls[1][0].boardCosts).toBeNull();
    expect(saveSheetProject.mock.calls[0][0].pricing).toMatchObject({ price_per_unit: 350, currency: 'SEK' });
  });

  it('saves each cutlist with its own product snapshot, kerf and name', async () => {
    getCatalogue.mockResolvedValue({ data: catalogue, etag: '"x"' });
    await readBench();
    fireEvent.change(screen.getByLabelText(/Name for Framing timber/), { target: { value: 'Legs' } });
    await chooseOwnProduct('Product for Legs', 'Larch');
    fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
    await screen.findByRole('heading', { name: /plan and save/i });
    fireEvent.change(within(screen.getByRole('region', { name: 'Legs' })).getByLabelText(/Cut width/i), { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    const calls = saveProject.mock.calls.map(([arg]) => arg);
    const legs = calls.find((c) => c.name === 'bench · Legs');
    expect(legs).toMatchObject({ materialType: 'Larch', sawKerf: '2', product: { type: 'custom', name: 'Larch', catalogue_id: null } });
    const posts = calls.find((c) => c.name === 'bench · Planed timber 95 × 95 mm');
    expect(posts).toMatchObject({
      materialType: 'Planed timber 95 × 95 mm',
      sawKerf: '3',
      product: { type: 'planhyvlat', catalogue_id: 'se:planhyvlat:95x95', country: 'SE', thickness: 95, width: 95, suggested: true },
    });
    expect(saveSheetProject.mock.calls[0][0].product).toMatchObject({ type: 'plywood', catalogue_id: 'se:plywood:15', formats: [{ width: 1200, height: 2400 }] });
  });

  it('offers the product\'s standard lengths and sheet sizes as stock, never forced', async () => {
    getCatalogue.mockResolvedValue({ data: catalogue, etag: '"x"' });
    await toSaveStep();

    const legs = within(screen.getByRole('region', { name: 'Framing timber / studs 45 × 95 mm' }));
    expect(legs.getByLabelText(/Board length in millimetres, row 1/)).toHaveValue(2500);
    fireEvent.click(legs.getByRole('button', { name: 'Use these lengths' }));
    expect(legs.getByLabelText(/Board length in millimetres, row 1/)).toHaveValue(2400);
    expect(legs.getByLabelText(/Board length in millimetres, row 2/)).toHaveValue(3000);

    const sheet = within(screen.getByRole('region', { name: 'Plywood 15 mm' }));
    fireEvent.click(sheet.getByRole('button', { name: /1.200 × 2.400 mm/ }));
    expect(sheet.getByLabelText(/Sheet width/i)).toHaveValue(1200);
    expect(sheet.getByLabelText(/Sheet height/i)).toHaveValue(2400);
  });

  it('applies one group\'s stock and prices to all board groups only', async () => {
    await toSaveStep();
    const legs = within(screen.getByRole('region', { name: 'Board 45 × 95 mm' }));
    fireEvent.change(legs.getByLabelText(/Cut width/i), { target: { value: '2' } });
    fireEvent.change(legs.getByLabelText(/Board length in millimetres, row 1/), { target: { value: '2400' } });
    fireEvent.click(legs.getByRole('button', { name: 'Apply to all board groups' }));

    const posts = within(screen.getByRole('region', { name: 'Board 95 × 95 mm' }));
    expect(posts.getByLabelText(/Cut width/i)).toHaveValue(2);
    expect(posts.getByLabelText(/Board length in millimetres, row 1/)).toHaveValue(2400);
    const sheet = within(screen.getByRole('region', { name: 'Sheet 15 mm' }));
    expect(sheet.getByLabelText(/Sheet kerf/)).toHaveValue(3);
    expect(sheet.queryByRole('button', { name: /apply to all/i })).not.toBeInTheDocument();
  });

  it('blocks saving only for invalid stock, never for missing prices', async () => {
    await toSaveStep();
    const legs = within(screen.getByRole('region', { name: 'Board 45 × 95 mm' }));
    fireEvent.change(legs.getByLabelText(/Cut width/i), { target: { value: '0' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Plan 3 cutlists' })).toBeDisabled());
  });

  it('pre-fills a new project name from the model file and links to it once saved', async () => {
    createProjectGroup.mockResolvedValue({ id: 'g1', name: 'bench' });
    await toSaveStep();
    fireEvent.change(screen.getByLabelText('Project — optional'), { target: { value: '__new__' } });
    const nameField = screen.getByLabelText(/new project name/i);
    expect(nameField).toHaveValue('bench');
    fireEvent.click(screen.getByRole('button', { name: /create project/i }));
    await waitFor(() => expect(createProjectGroup).toHaveBeenCalledWith('bench'));

    fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
    const link = await screen.findByRole('link', { name: /open project/i });
    expect(link).toHaveAttribute('href', '/dashboard/project/g1');
    expect(saveProject.mock.calls[0][0].projectGroupId).toBe('g1');
  });
});
