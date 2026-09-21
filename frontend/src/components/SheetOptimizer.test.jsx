import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../contexts/LanguageContext';
import SheetOptimizer from './SheetOptimizer';
import { getProjectGroups, getUserSheetProjects } from '../utils/api';

jest.mock('../utils/api', () => ({
  getProjectGroups: jest.fn(),
  getUserSheetProjects: jest.fn(),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

beforeEach(() => {
  getProjectGroups.mockResolvedValue([]);
  getUserSheetProjects.mockResolvedValue([]);
});

it('restores a saved sheet plan addressed by the edit query', async () => {
  getUserSheetProjects.mockResolvedValue([{
    id: 'sheet-1',
    name: 'Saved sheet',
    project_group_id: null,
    parts_data: [{ name: 'Shelf', width: 400, height: 200, quantity: 2 }],
    sheet_width: 1200,
    sheet_height: 2400,
    kerf_width: 3,
    material_type: 'plywood',
    allow_rotation: true,
  }]);
  window.history.replaceState({}, '', '/sheet-cutting?edit=sheet-1');

  render(
    <MemoryRouter initialEntries={['/sheet-cutting?edit=sheet-1']}>
      <LanguageProvider><SheetOptimizer /></LanguageProvider>
    </MemoryRouter>,
  );

  expect(await screen.findByDisplayValue('400')).toBeInTheDocument();
  expect(screen.getByDisplayValue('1200')).toBeInTheDocument();
  expect(screen.getByDisplayValue('2400')).toBeInTheDocument();
  expect(screen.getByDisplayValue('3')).toBeInTheDocument();
});

it('explains why sheet planning is disabled when thickness is missing', async () => {
  window.history.replaceState({}, '', '/sheet-cutting');
  render(
    <MemoryRouter initialEntries={['/sheet-cutting']}>
      <LanguageProvider><SheetOptimizer /></LanguageProvider>
    </MemoryRouter>,
  );

  expect(screen.getByRole('button', { name: /plan the sheet cuts/i })).toBeDisabled();
  expect(await screen.findByText(/enter the sheet thickness before planning/i)).toBeInTheDocument();
});
