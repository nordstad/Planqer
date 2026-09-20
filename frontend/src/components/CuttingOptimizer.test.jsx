import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CuttingOptimizer from './CuttingOptimizer';
import { AuthProvider } from '../contexts/AuthContext';
import { getProjectGroups, getUserProjects, getUserSettings } from '../utils/api';

jest.mock('../utils/api', () => ({
  ...jest.requireActual('../utils/api'),
  getSetupStatus: jest.fn().mockResolvedValue({ needs_setup: false }),
  getProjectGroups: jest.fn(),
  getUserProjects: jest.fn(),
  getUserSettings: jest.fn(),
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
    fireEvent.click(screen.getByRole('button', { name: /Plan the cuts/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Your cutting plan/i })).toBeInTheDocument();
    });
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
    fireEvent.click(screen.getByRole('button', { name: /Plan the cuts/i }));
    await screen.findByRole('heading', { name: /Your cutting plan/i });
    fireEvent.click(screen.getByRole('button', { name: /Name and save/i }));
    await screen.findByRole('heading', { name: /Save this plan/i });
    fireEvent.click(screen.getByRole('button', { name: /Update plan/i }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent(/replace the saved result/i);
  });
});
