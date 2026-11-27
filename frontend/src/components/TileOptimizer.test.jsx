import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../contexts/LanguageContext';
import TileOptimizer from './TileOptimizer';
import i18n from '../i18n';
import { optimizeTileLayout, getProjectGroups, getUserTileProjects, getUserSettings, saveTileProject } from '../utils/api';

const mockUser = { id: 'user-1', email: 'user@example.com' };

vi.mock('../utils/api', () => ({
  optimizeTileLayout: vi.fn(),
  getProjectGroups: vi.fn(),
  getUserTileProjects: vi.fn(),
  getUserSettings: vi.fn(),
  saveTileProject: vi.fn(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

const candidate = {
  label: 'Balanced',
  visualization: 'data:image/svg+xml;base64,PHN2Zy8+',
  warnings: [],
  sliver_count: 0,
  tiles_to_purchase_with_waste: 10,
  tiles_to_purchase: 9,
  efficiency: 0.8,
  distinct_cut_sizes: 1,
  full_tile_count: 8,
  cut_tile_count: 2,
  notched_count: 0,
  reused_offcut_count: 0,
  min_edge_cut_width: null,
  min_edge_cut_height: null,
  tiles: [],
};

beforeEach(() => {
  getProjectGroups.mockResolvedValue([]);
  getUserTileProjects.mockResolvedValue([]);
  getUserSettings.mockResolvedValue({ default_currency: 'SEK', default_vat_rate: 25, default_prices_include_vat: true });
  optimizeTileLayout.mockReset().mockResolvedValue({ candidates: [candidate], recommended_index: 0 });
  saveTileProject.mockReset().mockResolvedValue({ id: 'synthetic-plan', name: 'Current layout' });
});

it('exposes edited opening errors while calculation is disabled and targets the faulty field', async () => {
  render(<MemoryRouter><LanguageProvider><TileOptimizer /></LanguageProvider></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Add opening' }));
  const fields = [...document.querySelectorAll('#tile-openings input')];
  expect(fields.every((field) => !field.hasAttribute('aria-invalid'))).toBe(true);
  for (const [index, value] of ['100', '0', '5000', '500'].entries()) {
    fireEvent.change(fields[index], { target: { value } });
  }
  await waitFor(() => expect(fields[2]).toHaveAttribute('aria-invalid', 'true'));
  expect(fields[2]).toHaveAccessibleDescription(i18n.t('tileUi.rightEdge'));
  expect(fields[0]).not.toHaveAttribute('aria-invalid');
  expect(screen.getByRole('button', { name: /Calculate layout/i })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Go to Openings' }));
  await waitFor(() => expect(fields[2]).toHaveFocus());
  fireEvent.change(fields[2], { target: { value: '500' } });
  await waitFor(() => expect(fields[2]).not.toHaveAttribute('aria-invalid'));
  expect(fields[2]).not.toHaveAttribute('aria-describedby');
  expect(screen.getByRole('button', { name: /Calculate layout/i })).toBeEnabled();
  fireEvent.click(document.querySelector('#tile-openings .btn-text.is-quiet'));
  expect(document.querySelectorAll('#tile-openings input')).toHaveLength(0);
});

it('explains fractional candidate counts as whole counts rather than positive numbers', async () => {
  render(<MemoryRouter><LanguageProvider><TileOptimizer /></LanguageProvider></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(i18n.t('workflow.sliverGuardBreakage')) }));
  fireEvent.change(document.querySelector('#tile-candidates'), { target: { value: '1.5' } });
  expect(await screen.findByText(i18n.t('validation.positiveQuantity'))).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: `Go to ${i18n.t('workflow.sliverGuardBreakage')}` }));
  await waitFor(() => expect(document.querySelector('#tile-candidates')).toHaveFocus());
  expect(screen.getByRole('button', { name: /Calculate layout/i })).toBeDisabled();
  expect(optimizeTileLayout).not.toHaveBeenCalled();
});

describe('tile input/result identity', () => {
  const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  };
  const response = (label) => ({ candidates: [{ ...candidate, label }], recommended_index: 0 });
  const renderTile = () => render(
    <MemoryRouter initialEntries={['/tile-layout']}>
      <LanguageProvider><TileOptimizer /></LanguageProvider>
    </MemoryRouter>,
  );

  it.each([
    ['surface width', 'input#tile-surface-width', '2600'],
    ['surface height', 'input#tile-surface-height', '1300'],
    ['tile width', 'input#tile-width', '350'],
    ['tile height', 'input#tile-height', '650'],
    ['material', 'select#tile-material', 'porcelain'],
    ['thickness', 'input#tile-thickness', '12'],
    ['joint', 'input#tile-joint', '4'],
    ['perimeter gap', 'input#tile-perimeter', '2'],
    ['bond', 'select#tile-bond', 'stack'],
    ['row offset', 'input#tile-offset', '25'],
    ['sliver threshold', 'input#tile-min-edge', '50'],
    ['waste allowance', 'input#tile-waste', '15'],
    ['candidate count', 'input#tile-candidates', '3'],
    ['rotation', '#tile-tile input[type=checkbox]'],
    ['offcut reuse', '#tile-guard input[type=checkbox]'],
  ])('ignores an old result after editing %s during calculation', async (_name, selector, value) => {
    const old = deferred();
    optimizeTileLayout.mockReturnValueOnce(old.promise);
    renderTile();
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(i18n.t('workflow.sliverGuardBreakage')) }));
    fireEvent.click(screen.getByRole('button', { name: /Calculate layout/i }));
    const input = document.querySelector(selector);
    if (input.type === 'checkbox') fireEvent.click(input);
    else fireEvent.change(input, { target: { value } });
    await act(async () => { old.resolve(response('Outdated layout')); });

    expect(screen.queryByRole('heading', { name: 'Pick a layout' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Name it', exact: true })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.plan-step-btn[data-state="locked"]')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Calculate layout/i })).toBeEnabled();
    expect(saveTileProject).not.toHaveBeenCalled();
  });

  it.each(['add', 'edit', 'remove'])('retires a pending layout when openings %s', async (action) => {
    const old = deferred();
    optimizeTileLayout.mockReturnValueOnce(old.promise);
    renderTile();
    await screen.findByLabelText('Surface width (mm)');
    if (action !== 'add') {
      fireEvent.click(screen.getByRole('button', { name: 'Add opening', exact: true }));
      [...document.querySelectorAll('#tile-openings input')].forEach((input, index) => {
        fireEvent.change(input, { target: { value: index < 2 ? '0' : '100' } });
      });
    }
    fireEvent.click(screen.getByRole('button', { name: /Calculate layout/i }));
    expect(optimizeTileLayout).toHaveBeenCalledTimes(1);
    if (action === 'add') fireEvent.click(screen.getByRole('button', { name: 'Add opening', exact: true }));
    else if (action === 'edit') fireEvent.change(document.querySelector('#tile-openings input'), { target: { value: '50' } });
    else fireEvent.click(screen.getByRole('button', { name: 'Remove', exact: true }));
    await act(async () => { old.resolve(response('Outdated layout')); });
    expect(screen.queryByRole('heading', { name: 'Pick a layout' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.plan-step-btn[data-state="locked"]')).toHaveLength(2);
    expect(saveTileProject).not.toHaveBeenCalled();
  });

  it('retires a pending calculation when another synthetic saved input is loaded', async () => {
    const old = deferred();
    optimizeTileLayout.mockReturnValueOnce(old.promise);
    getUserTileProjects.mockResolvedValue([{
      id: 'synthetic-input', name: 'Different inputs',
      surface_data: { width: 3200, height: 1500 },
      tile_data: { width: 400, height: 400, thickness: 12 },
      bond_data: { pattern: 'stack', joint_width: 3, perimeter_gap: 0 },
    }]);
    renderTile();
    fireEvent.click(await screen.findByRole('button', { name: /Calculate layout/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Load a saved plan', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load', exact: true }));
    await act(async () => { old.resolve(response('Outdated layout')); });
    expect(screen.getByLabelText('Surface width (mm)')).toHaveValue(3200);
    expect(screen.queryByRole('heading', { name: 'Pick a layout' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.plan-step-btn[data-state="locked"]')).toHaveLength(2);
  });

  it.each(['success', 'failure'])('ignores an obsolete %s without ending a newer calculation', async (outcome) => {
    const old = deferred();
    const current = deferred();
    optimizeTileLayout.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    renderTile();
    const width = await screen.findByLabelText('Surface width (mm)');
    fireEvent.click(screen.getByRole('button', { name: /Calculate layout/i }));
    fireEvent.change(width, { target: { value: '2600' } });
    expect(screen.getByRole('button', { name: /Calculate layout/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Calculate layout/i }));
    expect(optimizeTileLayout).toHaveBeenCalledTimes(2);
    await act(async () => {
      if (outcome === 'success') old.resolve(response('Outdated layout'));
      else old.reject(new Error('Outdated failure'));
    });
    expect(screen.getByRole('button', { name: /Calculating|Solving/i })).toBeDisabled();
    expect(screen.queryByTestId('api-error')).not.toBeInTheDocument();
    expect(screen.queryByText('Outdated layout')).not.toBeInTheDocument();
    await act(async () => { current.resolve(response('Current layout')); });
    expect(await screen.findByText('Current layout')).toBeInTheDocument();
  });

  it.each(['success', 'failure'])('keeps the newer result and save payload after an old %s arrives last', async (outcome) => {
    const old = deferred();
    const current = deferred();
    optimizeTileLayout.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    getProjectGroups.mockResolvedValue([{ id: 'synthetic-group', name: 'Synthetic project' }]);
    renderTile();
    const width = await screen.findByLabelText('Surface width (mm)');
    fireEvent.click(screen.getByRole('button', { name: /Calculate layout/i }));
    fireEvent.change(width, { target: { value: '2600' } });
    fireEvent.submit(width.closest('form'));
    await act(async () => { current.resolve(response('Current layout')); });
    expect(await screen.findByText('Current layout')).toBeInTheDocument();
    await act(async () => {
      if (outcome === 'success') old.resolve(response('Outdated layout'));
      else old.reject(new Error('Outdated failure'));
    });
    expect(screen.queryByText('Outdated layout')).not.toBeInTheDocument();
    expect(screen.queryByTestId('api-error')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Name it', exact: true }));
    fireEvent.change(screen.getByLabelText('Plan name'), { target: { value: 'Current layout' } });
    fireEvent.submit(screen.getByLabelText('Plan name').closest('form'));
    await waitFor(() => expect(saveTileProject).toHaveBeenCalledWith(expect.objectContaining({
      surfaceWidth: '2600',
      candidate: expect.objectContaining({ label: 'Current layout' }),
    })));
  });

  it('keeps current failures visible and permits a normal retry', async () => {
    optimizeTileLayout.mockRejectedValueOnce(new Error('Current failure')).mockResolvedValueOnce(response('Retry layout'));
    renderTile();
    fireEvent.click(await screen.findByRole('button', { name: /Calculate layout/i }));
    expect(await screen.findByTestId('api-error')).toHaveTextContent('Current failure');
    expect(screen.getByRole('button', { name: /Calculate layout/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Calculate layout/i }));
    expect(await screen.findByText('Retry layout')).toBeInTheDocument();
    expect(screen.queryByTestId('api-error')).not.toBeInTheDocument();
  });

  it('still locks Layout and Keep after editing an already completed layout', async () => {
    renderTile();
    fireEvent.click(await screen.findByRole('button', { name: /Calculate layout/i }));
    await screen.findByRole('heading', { name: 'Pick a layout' });
    fireEvent.click(screen.getByRole('button', { name: 'Name it', exact: true }));
    expect(await screen.findByRole('heading', { name: 'Save this layout' })).toBeInTheDocument();
    fireEvent.click(document.querySelectorAll('.plan-step-btn')[0]);
    fireEvent.change(screen.getByLabelText('Surface width (mm)'), { target: { value: '2600' } });
    expect(document.querySelectorAll('.plan-step-btn[data-state="locked"]')).toHaveLength(2);
    expect(screen.queryByLabelText('Plan name')).not.toBeInTheDocument();
    expect(saveTileProject).not.toHaveBeenCalled();
  });
});

it('uses compact controls for tile dimensions', async () => {
  render(
    <MemoryRouter>
      <LanguageProvider>
        <TileOptimizer />
      </LanguageProvider>
    </MemoryRouter>,
  );

  expect(await screen.findByLabelText(/Surface width/i)).toHaveClass('dimension-input');
  expect(screen.getByLabelText(/Surface height/i)).toHaveClass('dimension-input');
  expect(screen.getByLabelText(/Tile width/i)).toHaveClass('dimension-input');
  expect(screen.getByLabelText(/Thickness \(mm\)/i)).toHaveClass('dimension-input');
});

it('renders translated labels on the tile layout save step', async () => {
  render(
    <MemoryRouter>
      <LanguageProvider>
        <TileOptimizer />
      </LanguageProvider>
    </MemoryRouter>,
  );

   fireEvent.change(await screen.findByLabelText('Thickness (mm)'), { target: { value: '10' } });
    fireEvent.click(await screen.findByRole('button', { name: /Calculate layout/i }));
  await screen.findByRole('heading', { name: 'Pick a layout' });
  fireEvent.click(await screen.findByRole('button', { name: 'Name it', exact: true }));

  await waitFor(() => expect(screen.getByRole('heading', { name: 'Save this layout' })).toBeInTheDocument());
  expect(screen.getByText(/Give the plan a name/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Save as')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Plan name')).toBeInTheDocument();
  expect(screen.getByLabelText('Project')).toBeInTheDocument();
  expect(screen.getByText(/A plan is one cutting result/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /More information.*Plan name/i }));
  expect(screen.getByText(/The name appears on the saved diagram/)).toBeInTheDocument();
});

it('passes the configured sliver threshold to candidate warnings', async () => {
  const translate = vi.spyOn(i18n, 't');
  optimizeTileLayout.mockResolvedValue({
    candidates: [{ ...candidate, sliver_count: 2 }],
    recommended_index: 0,
  });
  try {
    render(<MemoryRouter><LanguageProvider><TileOptimizer /></LanguageProvider></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText('Thickness (mm)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(i18n.t('workflow.sliverGuardBreakage')) }));
    fireEvent.change(screen.getByLabelText(i18n.t('workflow.sliverThreshold')), { target: { value: '42' } });
    fireEvent.click(screen.getByRole('button', { name: /Calculate layout/i }));
    await screen.findByRole('heading', { name: 'Pick a layout' });
    expect(translate).toHaveBeenCalledWith('ui.sliverWarning', expect.objectContaining({ count: 2, threshold: '42' }));
  } finally {
    translate.mockRestore();
  }
});

it('restores a saved tile plan addressed by the edit query', async () => {
  getUserTileProjects.mockResolvedValue([{
    id: 'tile-1',
    name: 'Saved tile layout',
    project_group_id: null,
    surface_data: { width: 2400, height: 1200, cutouts: [] },
     tile_data: { width: 300, height: 600, allow_rotation: true, material_type: 'porcelain', thickness: 10 },
    bond_data: { pattern: 'stack', offset_fraction: 0.5, joint_width: 3, perimeter_gap: 0 },
    options_data: { min_edge_cut: null, reuse_offcuts: true, waste_percent: 10, candidate_count: 5 },
    pricing: { price_per_unit: 42, currency: 'NOK', vat_rate: 15, prices_include_vat: false },
  }]);
  window.history.replaceState({}, '', '/tile-layout?edit=tile-1');

  render(
    <MemoryRouter initialEntries={['/tile-layout?edit=tile-1']}>
      <LanguageProvider><TileOptimizer /></LanguageProvider>
    </MemoryRouter>,
  );

  expect(await screen.findByDisplayValue('2400')).toBeInTheDocument();
  expect(screen.getByDisplayValue('1200')).toBeInTheDocument();
  expect(screen.getByDisplayValue('300')).toBeInTheDocument();
    expect(screen.getByDisplayValue('600')).toBeInTheDocument();
    expect(await screen.findByLabelText(/^Price per tile · NOK/)).toHaveValue(42);
});

it('shows the tile material cost using the configured VAT basis', async () => {
  window.history.replaceState({}, '', '/tile-layout');
  render(<MemoryRouter><LanguageProvider><TileOptimizer /></LanguageProvider></MemoryRouter>);

  fireEvent.change(await screen.findByLabelText('Thickness (mm)'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText(/^Price per tile · SEK/), { target: { value: '25' } });
  fireEvent.click(screen.getByRole('button', { name: /Calculate layout/i }));

  expect(await screen.findByText('250.00 SEK · including VAT (25%)')).toBeInTheDocument();
});

describe('Lite warning for large diagonal layouts', () => {
  const renderTile = () => render(
    <MemoryRouter>
      <LanguageProvider>
        <TileOptimizer />
      </LanguageProvider>
    </MemoryRouter>,
  );

  const makeBigDiagonal = () => {
    fireEvent.change(screen.getByLabelText(/Surface width/i), { target: { value: '6000' } });
    fireEvent.change(screen.getByLabelText(/Surface height/i), { target: { value: '4500' } });
    fireEvent.change(document.getElementById('tile-bond'), { target: { value: 'diagonal' } });
  };

  afterEach(() => vi.unstubAllEnvs());

  it('warns in Lite', async () => {
    vi.stubEnv('VITE_PARTSIBLE_MODE', 'static');
    renderTile();
    makeBigDiagonal();
    expect(await screen.findByText(/can take ten seconds or more/i)).toBeInTheDocument();
  });

  it('says nothing in the self-hosted version', async () => {
    renderTile();
    makeBigDiagonal();
    await waitFor(() => expect(document.getElementById('tile-bond').value).toBe('diagonal'));
    expect(screen.queryByText(/can take ten seconds or more/i)).not.toBeInTheDocument();
  });
});

it('starts with a 10 mm thickness, and names it as missing when it is cleared', async () => {
  render(
    <MemoryRouter>
      <LanguageProvider>
        <TileOptimizer />
      </LanguageProvider>
    </MemoryRouter>,
  );

  const thickness = await screen.findByLabelText('Thickness (mm)');
  expect(thickness).toHaveValue(10);
  expect(screen.getByRole('button', { name: /Calculate layout/i })).toBeEnabled();

  fireEvent.change(thickness, { target: { value: '' } });
  expect(thickness).toHaveValue(null);
  expect(thickness).not.toHaveClass('form-input-error');
  expect(thickness).toHaveAttribute('aria-required', 'true');
  expect(screen.getByText('1 required field empty: Thickness')).toBeInTheDocument();
  expect(screen.getByText('Fill in Thickness to calculate the layout.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Go to Tile' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Calculate layout/i })).toBeDisabled();
});
