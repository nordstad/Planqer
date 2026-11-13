import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '../i18n';
import { AuthProvider } from '../contexts/AuthContext';
import SheetPlanPage from './SheetPlanPage';
import { getSheetProject } from '../utils/api';

vi.mock('../utils/api', async (importOriginal) => ({ ...(await importOriginal()), getSheetProject: vi.fn() }));

const project = {
  id: 'plan-1', name: 'Kitchen', project_group_id: 'group-1', material_type: 'plywood', sheet_thickness: 18, sheet_width: 1200, sheet_height: 2500, parts_data: [], updated_at: '2026-11-13T00:00:00Z',
  optimization_result: { total_sheets: 1, sheets: [{ efficiency: 50, parts_count: 0, sheet_width: 1200, sheet_height: 2500, parts: [] }], sheet_visualizations: ['data:image/svg+xml;base64,PHN2Zy8+'] },
};
const renderPage = () => render(<AuthProvider><MemoryRouter initialEntries={['/sheet-cutting/plan/plan-1']}><Routes><Route path="/sheet-cutting/plan/:planId" element={<SheetPlanPage />} /><Route path="/sheet-cutting" element={<p>Editor</p>} /></Routes></MemoryRouter></AuthProvider>);

describe('SheetPlanPage', () => {
  it('loads and renders a saved sheet plan', async () => {
    getSheetProject.mockResolvedValue(project);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Kitchen' })).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
  });

  it('shows not found when loading fails', async () => {
    getSheetProject.mockRejectedValue(new Error('missing'));
    renderPage();
    expect(await screen.findByText('This plan no longer exists.')).toBeInTheDocument();
  });
});
