import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../contexts/LanguageContext';
import TileOptimizer from './TileOptimizer';
import { optimizeTileLayout, getProjectGroups, getUserTileProjects } from '../utils/api';

jest.mock('../utils/api', () => ({
  optimizeTileLayout: jest.fn(),
  getProjectGroups: jest.fn(),
  getUserTileProjects: jest.fn(),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'user@example.com' },
    isAuthenticated: true,
    logout: jest.fn(),
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
  optimizeTileLayout.mockResolvedValue({ candidates: [candidate], recommended_index: 0 });
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
   fireEvent.click(await screen.findByRole('button', { name: /Solve the layout/i }));
  await screen.findByRole('heading', { name: 'Pick a layout' });
  fireEvent.click(await screen.findByRole('button', { name: /Name it/i }));

  await waitFor(() => expect(screen.getByRole('heading', { name: 'Save this layout' })).toBeInTheDocument());
  expect(screen.getByText(/Name it, choose where it belongs/)).toBeInTheDocument();
  expect(screen.getByLabelText('Save as')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Create a new plan' })).toBeInTheDocument();
  expect(screen.getByLabelText('Plan name')).toBeInTheDocument();
  expect(screen.getByText(/The name goes on the saved diagram/)).toBeInTheDocument();
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
});
