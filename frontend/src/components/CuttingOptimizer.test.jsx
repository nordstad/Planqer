import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CuttingOptimizer from './CuttingOptimizer';
import { AuthProvider } from '../contexts/AuthContext';
import { getProjectGroups, getUserProjects, getUserSettings, optimizeCutting, saveProject } from '../utils/api';

jest.mock('../utils/api', () => ({
  ...jest.requireActual('../utils/api'),
  getSetupStatus: jest.fn().mockResolvedValue({ needs_setup: false }),
  getProjectGroups: jest.fn(),
  getUserProjects: jest.fn(),
  getUserSettings: jest.fn(),
  saveProject: jest.fn(),
  optimizeCutting: jest.fn().mockResolvedValue({
    board_lengths_used: [2500, 2500],
    cut_list: [
      [2000, 150, 150, 80],
      [1550, 150, 150, 150, 150, 150, 80],
    ],
    visualization: 'data:image/svg+xml;base64,PHN2Zy8+',
  }),
}));

jest.mock('../contexts/AuthContext', () => ({
  ...jest.requireActual('../contexts/AuthContext'),
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

  it('ignores a late plan response after loading another plan', async () => {
    let resolvePlan;
    optimizeCutting.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePlan = resolve;
    }));
    getUserProjects.mockResolvedValueOnce([{
      id: 'board-2',
      name: 'Loaded board',
      project_group_id: null,
      parts_data: { 100: 2 },
      board_lengths: [300],
      saw_blade_width: 4,
      material_type: 'oak',
      board_thickness: 45,
      board_width: 45,
    }]);

    renderOptimizer();
    await screen.findByRole('heading', { name: /Required parts/i });
    fillMaterial();
    fireEvent.click(screen.getByRole('button', { name: /Plan the cuts/i }));
    await waitFor(() => expect(optimizeCutting).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Load a saved plan/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load' }));
    resolvePlan({
      board_lengths_used: [2500],
      cut_list: [[2000]],
      visualization: 'data:image/svg+xml;base64,PHN2Zy8+',
    });

    await waitFor(() => expect(screen.getByDisplayValue('300')).toBeInTheDocument());
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

  it('does not let late defaults overwrite a loaded plan', async () => {
    let resolveSettings;
    getUserSettings.mockReturnValueOnce(new Promise((resolve) => {
      resolveSettings = resolve;
    }));
    getUserProjects.mockResolvedValueOnce([{
      id: 'board-1',
      name: 'Saved board',
      project_group_id: null,
      parts_data: { 100: 2 },
      board_lengths: [300],
      saw_blade_width: 4,
    }]);
    window.history.replaceState({}, '', '/cutting?edit=board-1');

    renderOptimizer();
    expect(await screen.findByDisplayValue('300')).toBeInTheDocument();
    resolveSettings({ default_board_lengths: [999], default_saw_blade_width: 8 });

    await waitFor(() => expect(screen.getByDisplayValue('300')).toBeInTheDocument());
    expect(screen.getByDisplayValue('4')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('999')).not.toBeInTheDocument();
  });

  it('does not let late defaults overwrite an imported cutlist', async () => {
    let resolveSettings;
    getUserSettings.mockReturnValueOnce(new Promise((resolve) => {
      resolveSettings = resolve;
    }));
    window.localStorage.setItem('planqer-3d-import', JSON.stringify({
      source: 'model-cutlist',
      parts: { 123: 2 },
      projectName: 'Imported cutlist',
    }));
    window.history.replaceState({}, '', '/cutting?import=3d');

    renderOptimizer();
    expect(await screen.findByDisplayValue('123')).toBeInTheDocument();
    resolveSettings({ default_board_lengths: [999], default_saw_blade_width: 8 });

    await waitFor(() => expect(screen.getByDisplayValue('123')).toBeInTheDocument());
    expect(screen.queryByDisplayValue('999')).not.toBeInTheDocument();
    window.localStorage.removeItem('planqer-3d-import');
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

  it('does not save a priced plan while its prices are dirty', async () => {
    optimizeCutting.mockClear();
    saveProject.mockClear();
    window.matchMedia = jest.fn().mockReturnValue({ matches: false, addListener: jest.fn(), removeListener: jest.fn() });
    Element.prototype.scrollIntoView = jest.fn();
    optimizeCutting
      .mockResolvedValueOnce({
        board_lengths_used: [2500, 2500],
        cut_list: [[2000], [1500]],
        visualization: 'data:image/svg+xml;base64,PHN2Zy8+',
      })
      .mockResolvedValueOnce({
        board_lengths_used: [2500, 2500],
        cut_list: [[2000], [1500]],
        visualization: 'data:image/svg+xml;base64,PHN2Zy8+',
        cost_analysis: {
          currency: 'SEK',
          total_cost: 250,
          waste_cost: 20,
          cost_per_useful_material: 0.1,
          material_efficiency: 90,
          cost_per_board_type: { 2500: 250 },
        },
      });

    renderOptimizer();
    await screen.findByRole('heading', { name: /Required parts/i });
    fillMaterial();
    fireEvent.click(screen.getByRole('button', { name: /Plan the cuts/i }));
    await screen.findByRole('heading', { name: /Your cutting plan/i });
    fireEvent.click(screen.getByRole('button', { name: /Cost analysis/i }));
    fireEvent.click(screen.getByLabelText('One price for all lengths'));
    fireEvent.change(screen.getByLabelText('Uniform price per metre in SEK'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /Price this plan/i }));
    await waitFor(() => expect(optimizeCutting).toHaveBeenCalledTimes(2));

    fireEvent.change(screen.getByLabelText('Uniform price per metre in SEK'), { target: { value: '110' } });
    fireEvent.click(screen.getByRole('button', { name: /Name and save/i }));
    await screen.findByRole('heading', { name: /Save this plan/i });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Dirty prices' } });
    fireEvent.click(screen.getByRole('button', { name: /Save plan/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/apply the changed prices or discard/i);
    expect(saveProject).not.toHaveBeenCalled();
  });
});
