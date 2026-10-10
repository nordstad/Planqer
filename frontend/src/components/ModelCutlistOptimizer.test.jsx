import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ModelCutlistOptimizer from './ModelCutlistOptimizer';
import { LanguageProvider } from '../contexts/LanguageContext';
import {
  process3DCutlist, optimizeCutting, saveProject, optimizeSheetCutting, saveSheetProject,
  getProjectGroups, createProjectGroup, getUserSettings,
} from '../utils/api';

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

const toSaveStep = async () => {
  await readBench();
  fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
  await screen.findByRole('heading', { name: /plan and save/i });
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
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

  it('renames a cutlist and gives it its own material', async () => {
    await readBench();
    fireEvent.change(screen.getByLabelText(/Name for Board 45 × 95 mm/), { target: { value: 'Legs' } });
    fireEvent.change(screen.getByLabelText('Material for Legs'), { target: { value: 'pine' } });
    expect(screen.getByLabelText('Material for Board 95 × 95 mm')).toHaveValue('');
    expect(screen.getByLabelText('Material for Legs')).toHaveValue('pine');
  });

  it('hands the chosen material to the board page on Plan alone', async () => {
    delete window.location;
    window.location = { href: '' };
    await readBench();
    fireEvent.change(screen.getByLabelText(/Material for Board 45 × 95 mm/), { target: { value: 'pine' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Plan alone' })[0]);
    const handoff = JSON.parse(localStorage.getItem('planqer-3d-import'));
    expect(handoff).toMatchObject({ materialType: 'pine', boardThickness: 45, boardWidth: 95, projectName: 'bench · Pine 45 × 95 mm' });
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

  it('saves each cutlist with its own material, kerf and name', async () => {
    await readBench();
    fireEvent.change(screen.getByLabelText(/Name for Board 45 × 95 mm/), { target: { value: 'Legs' } });
    fireEvent.change(screen.getByLabelText('Material for Legs'), { target: { value: 'pine' } });
    fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
    await screen.findByRole('heading', { name: /plan and save/i });
    fireEvent.change(within(screen.getByRole('region', { name: 'Legs' })).getByLabelText(/Cut width/i), { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: 'Plan 3 cutlists' }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(2));
    const calls = saveProject.mock.calls.map(([arg]) => arg);
    expect(calls.find((c) => c.name === 'bench · Legs')).toMatchObject({ materialType: 'pine', sawKerf: '2' });
    expect(calls.find((c) => c.name === 'bench · Board 95 × 95 mm')).toMatchObject({ materialType: '', sawKerf: '3' });
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
