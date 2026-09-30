import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../contexts/LanguageContext';
import SheetOptimizer from './SheetOptimizer';
import {
  getProjectGroups,
  getUserSheetProjects,
  optimizeSheetCutting,
} from '../utils/api';

jest.mock('../utils/api', () => ({
  getProjectGroups: jest.fn(),
  getUserSheetProjects: jest.fn(),
  optimizeSheetCutting: jest.fn(),
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

beforeEach(() => {
  getProjectGroups.mockResolvedValue([]);
  getUserSheetProjects.mockResolvedValue([]);
  optimizeSheetCutting.mockResolvedValue({
    total_sheets: 1,
    total_waste_area: 100,
    overall_efficiency: 50,
    algorithm_used: 'best_fit_2d',
    sheets: [],
  });
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

it('reruns restored rows without collapsing identical names', async () => {
  getUserSheetProjects.mockResolvedValue([{
    id: 'sheet-1',
    name: 'Saved sheet',
    project_group_id: null,
    parts_data: [
      { id: 'row-a', name: 'Shelf', width: 400, height: 200, quantity: 2 },
      { id: 'row-b', name: 'Shelf', width: 600, height: 300, quantity: 1 },
    ],
    sheet_width: 1200,
    sheet_height: 2400,
    sheet_thickness: 18,
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
  expect(screen.getAllByDisplayValue('Shelf')).toHaveLength(2);
  const packButton = screen.getByRole('button', { name: /plan the sheet cuts/i });
  await waitFor(() => expect(packButton).not.toBeDisabled());
  fireEvent.click(packButton);

  await waitFor(() => expect(optimizeSheetCutting).toHaveBeenCalledWith(
    [
      { id: 'row-a', name: 'Shelf', width: '400', height: '200', quantity: '2' },
      { id: 'row-b', name: 'Shelf', width: '600', height: '300', quantity: '1' },
    ],
    '1200',
    '2400',
    '3',
    'plywood',
    undefined,
    true,
  ));
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
