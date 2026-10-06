import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
