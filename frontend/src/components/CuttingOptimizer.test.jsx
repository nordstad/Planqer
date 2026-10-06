import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CuttingOptimizer from './CuttingOptimizer';
import { AuthProvider } from '../contexts/AuthContext';
import i18n from '../i18n';
import { getProjectGroups, getUserProjects, getUserSettings, optimizeCutting } from '../utils/api';

vi.mock('../utils/api', async () => ({
  ...(await vi.importActual('../utils/api')),
  getSetupStatus: vi.fn().mockResolvedValue({ needs_setup: false }),
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
  fireEvent.change(screen.getByLabelText('Material'), { target: { value: 'oak' } });
  fireEvent.change(screen.getByLabelText('Thickness (mm)'), { target: { value: '45' } });
  fireEvent.change(screen.getByLabelText('Width (mm)'), { target: { value: '45' } });
};

beforeEach(() => {
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
    expect(screen.getByTestId('plan-material-summary')).toHaveTextContent('Oak · 45 × 45 mm');
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
