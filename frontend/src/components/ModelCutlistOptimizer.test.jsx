import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ModelCutlistOptimizer from './ModelCutlistOptimizer';
import { LanguageProvider } from '../contexts/LanguageContext';
import {
  process3DCutlist, optimizeCutting, saveProject, optimizeSheetCutting, saveSheetProject,
  getProjectGroups, getUserProjects, getUserSheetProjects, createProjectGroup, getUserSettings, getCatalogue,
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
  getUserProjects: vi.fn(),
  getUserSheetProjects: vi.fn(),
  createProjectGroup: vi.fn(),
  getUserSettings: vi.fn(),
  getCatalogue: vi.fn(),
}));

const mockUser = { id: 'u1', email: 'a@b.c' };
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isAuthenticated: true, logout: vi.fn() }),
}));

vi.mock('./CatalogPage', () => ({ default: ({ children }) => <div>{children}</div> }));

vi.mock('./ModelPartsPreview', () => ({
  default: ({ highlightedGroupId, highlightedPartKey, selectedIds }) => (
    <div
      data-testid="model-parts-preview"
      data-highlighted-group={highlightedGroupId || ''}
      data-highlighted-part={highlightedPartKey || ''}
      data-selected-count={selectedIds.size}
    />
  ),
}));

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
  const change = screen.queryByRole('button', { name: `Change — ${label}` });
  if (change) fireEvent.click(change);
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
  getUserProjects.mockResolvedValue([]);
  getUserSheetProjects.mockResolvedValue([]);
  createProjectGroup.mockResolvedValue({ id: 'g1', name: 'bench' });
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

describe('model preview', () => {
  it('shows an STL preview without blocking model reading', async () => {
    const { container } = await renderFlow();
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [new File(['solid cube\nendsolid cube'], 'cube.stl')] },
    });

    expect(await screen.findByRole('region', { name: 'STL model preview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read the model' })).toBeEnabled();
  });

  it('shows a parts lineup and highlights its matching cutlist row', async () => {
    await readBench();

    expect(screen.getByTestId('model-parts-preview')).toBeInTheDocument();
    expect(screen.getAllByTestId('model-group-colour')).toHaveLength(3);

    const row = screen.getByLabelText(/Name for Board 45 × 95 mm/).closest('tr');
    fireEvent.mouseEnter(row);
    expect(screen.getByTestId('model-parts-preview')).toHaveAttribute(
      'data-highlighted-group',
      'board||95x45',
    );
    fireEvent.mouseLeave(row);
    expect(screen.getByTestId('model-parts-preview')).toHaveAttribute('data-highlighted-group', '');

    fireEvent.click(within(row).getByRole('checkbox'));
    expect(screen.getByTestId('model-parts-preview')).toHaveAttribute('data-selected-count', '2');
  });

  it('shades each length in a cutlist and highlights just those parts on hover', async () => {
    await readBench();
    fireEvent.click(screen.getAllByRole('button', { name: 'Show lengths' })[0]);

    const breakdown = screen.getByTestId(/^breakdown-board/);
    const swatches = within(breakdown).getAllByTestId('model-part-swatch');
    expect(swatches).toHaveLength(2);
    expect(swatches[0].style.background).not.toBe(swatches[1].style.background);

    const length = within(breakdown).getByText(/1.800 mm × 2/);
    fireEvent.mouseEnter(length);
    const preview = screen.getByTestId('model-parts-preview');
    expect(preview).toHaveAttribute('data-highlighted-group', 'board||95x45');
    expect(preview).toHaveAttribute('data-highlighted-part', '1800');

    fireEvent.mouseLeave(length);
    expect(preview).toHaveAttribute('data-highlighted-group', '');
    expect(preview).toHaveAttribute('data-highlighted-part', '');
  });

  it('highlights a length from the keyboard too', async () => {
    await readBench();
    fireEvent.click(screen.getAllByRole('button', { name: 'Show lengths' })[0]);
    const length = within(screen.getByTestId(/^breakdown-board/)).getByText(/500 mm × 4/);
    fireEvent.focus(length);
    expect(screen.getByTestId('model-parts-preview')).toHaveAttribute('data-highlighted-part', '500');
    fireEvent.blur(length);
    expect(screen.getByTestId('model-parts-preview')).toHaveAttribute('data-highlighted-part', '');
  });

  it('explains that STEP geometry preview is not available yet', async () => {
    const { container } = await renderFlow();
    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [new File(['ISO-10303-21;'], 'assembly.step')] },
    });

    expect(screen.getByText(/STEP files do not have a geometry preview yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read the model' })).toBeEnabled();
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

  describe('importing a model that is already in the project', () => {
    const earlier = {
      project_group_id: 'g9', updated_at: '2026-10-11T10:00:00',
    };
    const filedPlans = () => {
      getProjectGroups.mockResolvedValue([{ id: 'g9', name: 'bench' }]);
      getUserProjects.mockResolvedValue([
        { ...earlier, id: 'old-board', name: 'my own name', board_thickness: 45, board_width: 95 },
        { ...earlier, id: 'elsewhere', name: 'other', board_thickness: 95, board_width: 95, project_group_id: 'g-other' },
      ]);
      getUserSheetProjects.mockResolvedValue([
        { ...earlier, id: 'old-sheet', name: 'bench · 15 mm sheet', sheet_thickness: 15 },
      ]);
    };

    it('updates the matching plans in place instead of adding copies', async () => {
      filedPlans();
      await toSaveStep();
      expect(await screen.findByText('Replaces “my own name”')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
      await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
      const [saved45, saved95] = saveProject.mock.calls.map(([arg]) => arg);
      expect(saved45).toMatchObject({ id: 'old-board', name: 'my own name', projectGroupId: 'g9' });
      expect(saved95.id).toBeUndefined();
      expect(saveSheetProject.mock.calls[0][0]).toMatchObject({ id: 'old-sheet', name: 'bench · 15 mm sheet' });
    });

    it('adds new plans when replacing is switched off', async () => {
      filedPlans();
      await toSaveStep();
      fireEvent.click(await screen.findByRole('checkbox', { name: /Replace the matching plans/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
      await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
      expect(saveProject.mock.calls.every(([arg]) => arg.id === undefined)).toBe(true);
      expect(saveSheetProject.mock.calls[0][0].id).toBeUndefined();
    });
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

  it('files every plan under a new project named after the model by default', async () => {
    createProjectGroup.mockResolvedValue({ id: 'g1', name: 'bench' });
    await toSaveStep();
    expect(screen.getByLabelText('Project — optional')).toHaveValue('__new__');
    expect(screen.getByLabelText(/new project name/i)).toHaveValue('bench');
    expect(createProjectGroup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
    const link = await screen.findByRole('link', { name: /open project/i });
    expect(createProjectGroup).toHaveBeenCalledTimes(1);
    expect(createProjectGroup).toHaveBeenCalledWith('bench');
    expect(link).toHaveAttribute('href', '/dashboard/project/g1');
    expect(saveProject.mock.calls.map(([arg]) => arg.projectGroupId)).toEqual(['g1', 'g1']);
    expect(saveSheetProject.mock.calls[0][0].projectGroupId).toBe('g1');
  });

  it('uses the edited project name', async () => {
    createProjectGroup.mockResolvedValue({ id: 'g2', name: 'Garden bench' });
    await toSaveStep();
    fireEvent.change(screen.getByLabelText(/new project name/i), { target: { value: 'Garden bench' } });
    fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
    await waitFor(() => expect(saveSheetProject).toHaveBeenCalled());
    expect(createProjectGroup).toHaveBeenCalledWith('Garden bench');
    expect(saveProject.mock.calls[0][0].projectGroupId).toBe('g2');
  });

  it('pre-selects an existing project with the model\'s name instead of creating another', async () => {
    getProjectGroups.mockResolvedValue([{ id: 'g9', name: 'Bench' }]);
    await toSaveStep();
    await waitFor(() => expect(screen.getByLabelText('Project — optional')).toHaveValue('g9'));

    fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
    await screen.findByRole('link', { name: /open project/i });
    expect(createProjectGroup).not.toHaveBeenCalled();
    expect(saveProject.mock.calls[0][0].projectGroupId).toBe('g9');
  });

  it('still saves without a project when the user chooses so', async () => {
    await toSaveStep();
    fireEvent.change(screen.getByLabelText('Project — optional'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
    await waitFor(() => expect(saveSheetProject).toHaveBeenCalled());
    expect(createProjectGroup).not.toHaveBeenCalled();
    expect(saveProject.mock.calls[0][0].projectGroupId).toBe('');
  });

  it('saves nothing when the project cannot be created', async () => {
    createProjectGroup.mockRejectedValue(new Error('rate limited'));
    await toSaveStep();
    fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('rate limited');
    expect(saveProject).not.toHaveBeenCalled();
    expect(saveSheetProject).not.toHaveBeenCalled();
  });
});
