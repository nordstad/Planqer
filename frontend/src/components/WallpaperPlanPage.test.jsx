import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import '../i18n';
import { AuthProvider } from '../contexts/AuthContext';
import WallpaperPlanPage from './WallpaperPlanPage';
import { getWallpaperProject } from '../utils/api';

vi.mock('../utils/api', async (importOriginal) => ({ ...(await importOriginal()), getWallpaperProject: vi.fn() }));

const project = {
  id: 'plan-1', name: 'Kitchen', project_group_id: 'group-1', updated_at: '2026-11-12T00:00:00Z',
  wallpaper_data: { name: 'Willow', roll_width: 530, roll_length: 10050, repeat: 0 },
  room_data: { walls: [{ name: 'Wall A', width_top: 1000, width_middle: 1000, width_bottom: 1000, height_left: 2400, height_middle: 2400, height_right: 2400 }], corners: [], closed: false },
  plan_result: { rolls_to_buy: 2, rolls_needed: 2, strips: [], pieces: [], rolls: [] },
};
const renderPage = () => render(<AuthProvider><MemoryRouter initialEntries={['/wallpaper/plan/plan-1']}><Routes><Route path="/wallpaper/plan/:planId" element={<WallpaperPlanPage />} /><Route path="/wallpaper" element={<p>Editor</p>} /></Routes></MemoryRouter></AuthProvider>);

describe('WallpaperPlanPage', () => {
  it('loads and renders the saved plan', async () => {
    getWallpaperProject.mockResolvedValue(project);
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Kitchen' })).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
  });

  it('shows not found when loading fails', async () => {
    getWallpaperProject.mockRejectedValue(new Error('missing'));
    renderPage();
    expect(await screen.findByText('This plan no longer exists.')).toBeInTheDocument();
  });
});
