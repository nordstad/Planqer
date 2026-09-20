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
  useAuth: () => ({ user: { id: 'user-1', email: 'user@example.com' }, logout: jest.fn() }),
}));

const group = {
  id: 'group-1',
  name: 'Lab',
  created_at: '2026-08-26T00:00:00Z',
  updated_at: '2026-08-26T00:00:00Z',
};
const plan = {
  id: 'plan-1',
  project_group_id: group.id,
  name: 'Cut list',
  parts_data: { 100: 1 },
  board_lengths: [300],
  saw_blade_width: 3,
  created_at: '2026-08-26T00:00:00Z',
  updated_at: '2026-08-26T00:00:00Z',
};

const renderDetail = () => render(
  <MemoryRouter>
    <LanguageProvider>
      <UserProjectsContent onPreview={jest.fn()} groupId={group.id} />
    </LanguageProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  getUserProjects.mockResolvedValue([plan]);
  getUserSheetProjects.mockResolvedValue([]);
  getUserTileProjects.mockResolvedValue([]);
  getProjectGroups.mockResolvedValue([group]);
  deleteProject.mockResolvedValue({});
  deleteProjectGroup.mockResolvedValue({});
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
