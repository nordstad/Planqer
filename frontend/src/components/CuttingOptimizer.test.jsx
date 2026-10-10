import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CuttingOptimizer from './CuttingOptimizer';
import { AuthProvider } from '../contexts/AuthContext';
import i18n from '../i18n';
import { getCatalogue, getProjectGroups, getUserProjects, getUserSettings, optimizeCutting, saveProject } from '../utils/api';
import { resetCatalogueCache } from '../utils/catalogue';

vi.mock('../utils/api', async () => ({
  ...(await vi.importActual('../utils/api')),
  getSetupStatus: vi.fn().mockResolvedValue({ needs_setup: false }),
  getCatalogue: vi.fn(),
  saveProject: vi.fn(),
  getProjectGroups: vi.fn(),
  getUserProjects: vi.fn(),
  getUserSettings: vi.fn(),
  optimizeCutting: vi.fn().mockResolvedValue({
    board_lengths_used: [2500, 2500],
    cut_list: [
      [2000, 150, 150, 80],
      [1550, 150, 150, 150, 150, 150, 80],
    ],
    visualization: 'data:image/svg+xml;base64,PHN2Zy8+',
  }),
}));

vi.mock('../contexts/AuthContext', async () => ({
  ...(await vi.importActual('../contexts/AuthContext')),
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const renderOptimizer = () =>
  render(
    <MemoryRouter initialEntries={['/cutting']}>
      <AuthProvider>
        <CuttingOptimizer />
      </AuthProvider>
    </MemoryRouter>
  );

const fillMaterial = () => {
  fireEvent.change(screen.getByLabelText('Thickness (mm)'), { target: { value: '45' } });
  fireEvent.change(screen.getByLabelText('Width (mm)'), { target: { value: '45' } });
};

const catalogue = {
  country: 'SE',
  country_name: 'Sweden',
  types: [
    { key: 'regel', kind: 'board', rank: 10, labels: { en: 'Framing timber / studs', sv: 'Träreglar', nb: 'Reisverk' }, aliases: [], details: ['species', 'grade'] },
    { key: 'custom', kind: 'board', rank: 999, labels: { en: 'Other' }, aliases: [], details: [] },
  ],
  details: { species: [{ key: 'spruce', labels: { en: 'Spruce', sv: 'Gran', nb: 'Gran' } }], treatment: [], profile: [] },
  products: [{
    id: 'se:regel:45x95', type: 'regel', kind: 'board', country: 'SE', thickness: 45, width: 95,
    lengths: [2400, 3000], max_length: null, formats: [], species: ['spruce'], treatments: [],
    grades: ['C24'], profiles: [], sources: ['https://www.traguiden.se/'], note: null,
  }],
};

const pickProduct = async (query, optionName) => {
  const box = screen.getByRole('combobox', { name: 'Product' });
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: query } });
  fireEvent.mouseDown(await screen.findByRole('option', { name: new RegExp(`^${optionName}`) }));
};

beforeEach(() => {
  resetCatalogueCache();
  getCatalogue.mockRejectedValue(new Error('offline'));
  saveProject.mockResolvedValue({ id: 'p1', name: 'Rails', project_group_id: null });
  getProjectGroups.mockResolvedValue([]);
  getUserProjects.mockResolvedValue([]);
  getUserSettings.mockResolvedValue({});
});

describe('CuttingOptimizer', () => {
  it('requests a standalone validation hint without interpolating a plan noun', async () => {
    const translate = vi.spyOn(i18n, 't');
    try {
      renderOptimizer();
      await screen.findByRole('heading', { name: /Required parts/i });
      expect(translate).toHaveBeenCalledWith('ui.fixLines', expect.any(Object));
      expect(translate).not.toHaveBeenCalledWith('ui.fixLines', expect.objectContaining({ kind: expect.anything() }));
    } finally {
      translate.mockRestore();
    }
  });

  it('renders the parts step with the plan-the-cuts button', async () => {
    renderOptimizer();
    expect(await screen.findByRole('heading', { name: /Required parts/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Plan the cuts/i })).toBeInTheDocument();
  });

  it('shows optional stock prices and keeps lowest cost disabled until complete', async () => {
    renderOptimizer();
    await screen.findByRole('heading', { name: /Required parts/i });

    expect(screen.getByLabelText(/Price per metre in SEK for the 2500 mm length/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Lowest cost/i })).toBeDisabled();
    expect(screen.getByText(/Add a price for every stock length/i)).toBeInTheDocument();
  });

  it('localizes each stock price field name and optional hint', async () => {
    await act(() => i18n.changeLanguage('sv-SE'));
    try {
      renderOptimizer();
      await screen.findByLabelText('Pris per meter i SEK för längden 2500 mm');

      expect(screen.getByLabelText('Pris per meter i SEK för längden 2500 mm')).toHaveAttribute('placeholder', 'Valfritt');
    } finally {
      await act(() => i18n.changeLanguage('en-GB'));
    }
  });

  it('sends a cost payload on the first run when every stock length is priced', async () => {
    renderOptimizer();
    await screen.findByRole('heading', { name: /Required parts/i });
    ['2500', '3600', '4200', '5100'].forEach((length) => {
      fireEvent.change(screen.getByLabelText(new RegExp(`Price per metre in SEK for the ${length} mm length`)), {
        target: { value: '30' },
      });
    });

    expect(screen.getByRole('radio', { name: /Lowest cost/i })).not.toBeDisabled();
    fillMaterial();
    fireEvent.click(screen.getByRole('button', { name: /Plan the cuts/i }));

    await waitFor(() => expect(optimizeCutting).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ enabled: true, optimizeFor: 'waste' })
    ));
  });

  it('shows a cutting plan after planning the cuts', async () => {
    renderOptimizer();
    await screen.findByRole('heading', { name: /Required parts/i });
    fillMaterial();
    fireEvent.click(screen.getByRole('button', { name: /Plan the cuts/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Your cutting plan/i })).toBeInTheDocument();
    });
    expect(screen.getByTestId('plan-material-summary')).toHaveTextContent('45 × 45 mm');
    expect(screen.getByTestId('plan-material-summary')).not.toHaveTextContent('·');
  });

  it('plans with no product chosen, only the dimensions', async () => {
    renderOptimizer();
    await screen.findByRole('heading', { name: /Required parts/i });
    expect(screen.queryByText(/Choose a material/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Plan the cuts/i }));
    expect(optimizeCutting).not.toHaveBeenCalled();
    expect(screen.getByText(/thickness and width/i)).toBeInTheDocument();

    fillMaterial();
    fireEvent.click(screen.getByRole('button', { name: /Plan the cuts/i }));
    await waitFor(() => expect(optimizeCutting).toHaveBeenCalled());
  });

  it('takes a product\'s dimensions and stock lengths when the user asks, and shows it in the plan', async () => {
    getCatalogue.mockResolvedValue({ data: catalogue, etag: '"x"' });
    renderOptimizer();
    await screen.findByRole('heading', { name: /Required parts/i });

    await pickProduct('regel 45x95', 'Framing timber / studs 45 × 95 mm');
    fireEvent.click(screen.getByRole('button', { name: 'Use 45 × 95 mm' }));
    expect(screen.getByLabelText('Thickness (mm)')).toHaveValue(45);
    expect(screen.getByLabelText('Width (mm)')).toHaveValue(95);
    expect(screen.queryByRole('button', { name: 'Use 45 × 95 mm' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Use these lengths' }));
    expect(screen.getAllByLabelText(/Board length in millimetres/).map((input) => input.value)).toEqual(['2400', '3000']);

    fireEvent.click(screen.getByRole('button', { name: /Plan the cuts/i }));
    await screen.findByRole('heading', { name: /Your cutting plan/i });
    expect(screen.getByTestId('plan-material-summary')).toHaveTextContent('Framing timber / studs 45 × 95 mm · 45 × 95 mm');
  });

  it('saves the plan with a snapshot of the chosen product and its details', async () => {
    getCatalogue.mockResolvedValue({ data: catalogue, etag: '"x"' });
    renderOptimizer();
    await screen.findByRole('heading', { name: /Required parts/i });
    await pickProduct('regel 45x95', 'Framing timber / studs 45 × 95 mm');
    fireEvent.click(screen.getByRole('button', { name: 'Use 45 × 95 mm' }));
    fireEvent.click(screen.getByRole('button', { name: /Details/ }));
    fireEvent.change(screen.getByLabelText(/^Grade/), { target: { value: 'C24' } });
    fireEvent.change(screen.getByLabelText(/^Species/), { target: { value: 'spruce' } });

    fireEvent.click(screen.getByRole('button', { name: /Plan the cuts/i }));
    await screen.findByRole('heading', { name: /Your cutting plan/i });
    fireEvent.click(screen.getByRole('button', { name: /Name and save/i }));
    await screen.findByRole('heading', { name: /Save this plan/i });
    fireEvent.change(screen.getByLabelText(/Plan name|Project name|Name/i), { target: { value: 'Rails' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save/i }));

    await waitFor(() => expect(saveProject).toHaveBeenCalled());
    expect(saveProject.mock.calls[0][0]).toMatchObject({
      materialType: 'Framing timber / studs 45 × 95 mm',
      product: {
        type: 'regel', catalogue_id: 'se:regel:45x95', country: 'SE', thickness: 45, width: 95,
        details: { species: 'spruce', grade: 'C24', treatment: null, profile: null, text: null },
        suggested: false,
      },
    });
  });

  it('ignores a late plan response after the parts change', async () => {
    let resolvePlan;
    optimizeCutting.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePlan = resolve;
    }));

    renderOptimizer();
    await screen.findByRole('heading', { name: /Required parts/i });
    fillMaterial();
    fireEvent.click(screen.getByRole('button', { name: /Plan the cuts/i }));
    await waitFor(() => expect(optimizeCutting).toHaveBeenCalled());

    fireEvent.change(screen.getByDisplayValue('80'), { target: { value: '81' } });
    resolvePlan({
      board_lengths_used: [2500],
      cut_list: [[2000]],
      visualization: 'data:image/svg+xml;base64,PHN2Zy8+',
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Plan the cuts/i })).not.toBeDisabled();
    });
    expect(screen.queryByRole('heading', { name: /Your cutting plan/i })).not.toBeInTheDocument();
  });

  it('restores a saved plan addressed by the edit query', async () => {
    getUserProjects.mockResolvedValue([{
      id: 'board-1',
      name: 'Saved board',
      project_group_id: null,
      parts_data: { 100: 2 },
      board_lengths: [300],
      saw_blade_width: 4,
    }]);
    window.history.replaceState({}, '', '/cutting?edit=board-1');

    renderOptimizer();

    expect(await screen.findByDisplayValue('100')).toBeInTheDocument();
    expect(screen.getByDisplayValue('300')).toBeInTheDocument();
    expect(screen.getByDisplayValue('4')).toBeInTheDocument();
  });

  it('restores the product snapshot a plan was saved with, and keeps an old plan\'s material as the user\'s own words', async () => {
    const base = { project_group_id: null, parts_data: { 100: 2 }, board_lengths: [300], saw_blade_width: 4, board_thickness: 45, board_width: 95 };
    getUserProjects.mockResolvedValue([{
      ...base, id: 'board-1', name: 'New', material_type: 'Framing timber / studs 45 × 95 mm',
      product: {
        type: 'regel', name: 'Framing timber / studs 45 × 95 mm', catalogue_id: 'se:regel:45x95', country: 'SE',
        labels: { en: 'Framing timber / studs' }, thickness: 45, width: 95, lengths: [2400], formats: [], sources: [],
        details: { species: 'spruce', grade: 'C24' }, suggested: false,
      },
    }]);
    window.history.replaceState({}, '', '/cutting?edit=board-1');
    const { unmount } = renderOptimizer();
    await waitFor(() => expect(screen.getByTestId('product-summary')).toHaveTextContent('Framing timber / studs 45 × 95 mm'));
    unmount();

    getUserProjects.mockResolvedValue([{ ...base, id: 'board-2', name: 'Old', material_type: 'oak', product: null }]);
    window.history.replaceState({}, '', '/cutting?edit=board-2');
    renderOptimizer();
    await waitFor(() => expect(screen.getByTestId('product-summary')).toHaveTextContent('Oak'));
  });

  it('asks for confirmation before updating a restored plan', async () => {
    getUserProjects.mockResolvedValue([{
      id: 'board-1',
      name: 'Saved board',
      project_group_id: null,
      parts_data: { 100: 2 },
      board_lengths: [300],
      saw_blade_width: 4,
    }]);
    window.history.replaceState({}, '', '/cutting?edit=board-1');

    renderOptimizer();
    await screen.findByDisplayValue('100');
    fillMaterial();
    fireEvent.click(screen.getByRole('button', { name: /Plan the cuts/i }));
    await screen.findByRole('heading', { name: /Your cutting plan/i });
    fireEvent.click(screen.getByRole('button', { name: /Name and save/i }));
    await screen.findByRole('heading', { name: /Save this plan/i });
    fireEvent.click(screen.getByRole('button', { name: /Update plan/i }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/replace the saved result/i);
  });
});
