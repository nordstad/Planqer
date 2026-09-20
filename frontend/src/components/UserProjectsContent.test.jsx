import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserProjectsContent from './UserProjectsContent';
import { LanguageProvider } from '../contexts/LanguageContext';
import {
  getUserProjects,
  getUserSheetProjects,
  getUserTileProjects,
  getProjectGroups,
  deleteProject,
  deleteProjectGroup,
} from '../utils/api';
import { printProjectPlans } from '../utils/printProject';

jest.mock('../utils/api', () => ({
  getUserProjects: jest.fn(),
  getUserSheetProjects: jest.fn(),
  getUserTileProjects: jest.fn(),
  getProjectGroups: jest.fn(),
  deleteProject: jest.fn(),
  deleteProjectGroup: jest.fn(),
  updateProject: jest.fn(),
  updateSheetProject: jest.fn(),
  deleteSheetProject: jest.fn(),
  updateTileProject: jest.fn(),
  deleteTileProject: jest.fn(),
  downloadProjectImage: jest.fn(),
  renameProjectGroup: jest.fn(),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: jest.fn() }),
}));

jest.mock('../utils/printProject', () => ({
  printProjectPlans: jest.fn().mockResolvedValue(undefined),
}));

const group = {
  id: 'group-1',
  name: 'Lab',
  created_at: '2026-08-26T00:00:00Z',
  updated_at: '2026-08-26T00:00:00Z',
};
const mockUser = { id: 'user-1', email: 'user@example.com' };
const plan = {
  id: 'plan-1',
  project_group_id: group.id,
  name: 'Cut list',
  has_svg_image: true,
  parts_data: { 100: 1 },
  board_lengths: [300],
  saw_blade_width: 3,
  optimization_result: { cut_list: [[300, 100]], board_lengths_used: [300] },
  created_at: '2026-08-26T00:00:00Z',
  updated_at: '2026-08-26T00:00:00Z',
};
const secondPlan = {
  ...plan,
  id: 'plan-2',
  name: 'Second cut list',
};

const renderDetail = () => render(
  <MemoryRouter>
    <LanguageProvider>
      <UserProjectsContent onPreview={jest.fn()} groupId={group.id} />
    </LanguageProvider>
  </MemoryRouter>,
);

const sheetPlan = {
  id: 'sheet-plan-1',
  project_group_id: group.id,
  name: 'Sheet cut list',
  parts_data: [{ name: 'Shelf', width: 400, height: 200, quantity: 1 }],
  sheet_width: 1200,
  sheet_height: 2500,
  material_type: 'plywood',
  created_at: '2026-08-26T00:00:00Z',
  updated_at: '2026-08-26T00:00:00Z',
  optimization_result: {
    sheets: [{ parts_count: 1, efficiency: 0.8, sheet_width: 1200, sheet_height: 2500, parts: [
      { part_id: 'Shelf', width: 400, height: 200, x: 0, y: 0, rotated: false },
    ] }],
  },
};
const tilePlan = {
  id: 'tile-plan-1',
  project_group_id: group.id,
  name: 'Tile layout',
  surface_data: { width: 2400, height: 1200 },
  tile_data: { width: 300, height: 600 },
  layout_result: {
    tiles_to_purchase_with_waste: 10,
    tiles: [{ kind: 'full', width: 300, height: 600, fill_color: '#d7e5c1' }],
  },
  created_at: '2026-08-26T00:00:00Z',
  updated_at: '2026-08-26T00:00:00Z',
};

beforeEach(() => {
  getUserProjects.mockResolvedValue([plan]);
  getUserSheetProjects.mockResolvedValue([]);
  getUserTileProjects.mockResolvedValue([]);
  getProjectGroups.mockResolvedValue([group]);
  deleteProject.mockResolvedValue({});
  deleteProjectGroup.mockResolvedValue({});
  const { downloadProjectImage } = jest.requireMock('../utils/api');
  downloadProjectImage.mockResolvedValue(new Blob());
  printProjectPlans.mockClear();
});

it('confirms deletion of a plan on the project detail route', async () => {
  renderDetail();

  fireEvent.click(await screen.findByRole('button', { name: 'Delete', exact: true }));
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete', exact: true }));

  await waitFor(() => expect(deleteProject).toHaveBeenCalledWith(plan.id));
});

it('confirms deletion of a project on the project detail route', async () => {
  renderDetail();

  await screen.findByText(group.name);
  fireEvent.click(screen.getByRole('button', { name: 'Delete project' }));
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete', exact: true }));

  await waitFor(() => expect(deleteProjectGroup).toHaveBeenCalledWith(group.id));
});

it('prints a plan from the project detail route', async () => {
  renderDetail();

  fireEvent.click(await screen.findByRole('button', { name: 'Print', exact: true }));

  await waitFor(() => expect(printProjectPlans).toHaveBeenCalled());
  expect(printProjectPlans.mock.calls.at(-1)[0].plans).toHaveLength(1);
});

it('prints only the selected plans', async () => {
  getUserProjects.mockResolvedValue([plan, secondPlan]);
  renderDetail();

  fireEvent.click(await screen.findByRole('checkbox', { name: 'Select plan "Cut list"' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select plan "Second cut list"' }));
  fireEvent.click(screen.getByRole('button', { name: 'Print selected (2)' }));

  await waitFor(() => expect(printProjectPlans).toHaveBeenCalled());
  expect(printProjectPlans.mock.calls.at(-1)[0].plans).toHaveLength(2);
});

it('shows a shopping list for saved board plans', async () => {
  renderDetail();

  expect(await screen.findByRole('heading', { name: 'What to buy', level: 2 })).toBeInTheDocument();
  expect(screen.getByText('300')).toBeInTheDocument();
  expect(screen.getByText('1', { selector: 'td' })).toBeInTheDocument();
  expect(screen.queryByText('300 · 100')).not.toBeInTheDocument();
});

it('shows a shopping list for saved sheet plans', async () => {
  getUserProjects.mockResolvedValue([]);
  getUserSheetProjects.mockResolvedValue([sheetPlan]);
  renderDetail();

  expect(await screen.findByRole('heading', { name: 'What to buy', level: 2 })).toBeInTheDocument();
  expect(screen.getByText('plywood')).toBeInTheDocument();
  expect(screen.getByText(/1\s*200\s*×\s*2\s*500/, { selector: 'td' })).toBeInTheDocument();
});

it('shows a tile shopping list and keeps the tile cutlist', async () => {
  getUserProjects.mockResolvedValue([]);
  getUserTileProjects.mockResolvedValue([tilePlan]);
  renderDetail();

  expect(await screen.findByRole('heading', { name: 'What to buy', level: 2 })).toBeInTheDocument();
  expect(screen.getByText(/300\s*×\s*600/, { selector: 'td' })).toBeInTheDocument();
  expect(screen.getByText('10', { selector: 'td' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Cut list', level: 2 })).toBeInTheDocument();
});
