import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../i18n';
import WallpaperPlanDocument from './WallpaperPlanDocument';

const walls = [
  { name: 'Wall A', profile: 'rectangle', width_top: 1000, width_middle: 1000, width_bottom: 1000, height_left: 2400, height_middle: 2400, height_right: 2400 },
  { name: 'Wall B', profile: 'rectangle', width_top: 1000, width_middle: 1000, width_bottom: 1000, height_left: 2400, height_middle: 2400, height_right: 2400 },
];
const plan = {
  rolls_to_buy: 3, rolls_needed: 2,
  strips: [
    { number: 1, wall_index: 0, x_start: 0, x_end: 500, width: 500, top_height: 2400, bottom_height: 0 },
    { number: 2, wall_index: 0, x_start: 500, x_end: 1000, width: 500, top_height: 2400, bottom_height: 0 },
    { number: 3, wall_index: 1, x_start: 0, x_end: 500, width: 500, top_height: 2400, bottom_height: 0 },
  ],
  pieces: [
    { id: 'piece-1', strip_number: 1, wall_index: 0, y_start: 0, y_end: 2400, length: 2400, phase: 0, notches: [], segments: [{ wall_index: 0, x_start: 0, x_end: 500, notches: [] }] },
    { id: 'piece-2', strip_number: 2, wall_index: 0, y_start: 0, y_end: 2400, length: 2400, phase: 0, notches: [{}], segments: [{ wall_index: 0, x_start: 500, x_end: 1000, notches: [{}] }] },
    { id: 'piece-3', strip_number: 3, wall_index: 1, y_start: 0, y_end: 2400, length: 2400, phase: 0, notches: [], segments: [{ wall_index: 1, x_start: 0, x_end: 500, notches: [] }] },
  ], rolls: [],
};
const wallpaper = { name: 'Willow', manufacturer: 'Morris', roll_width: 530, roll_length: 10050, repeat: 0, price_per_roll: 100, currency: 'SEK' };

describe('WallpaperPlanDocument', () => {
  it('shows the summary and synchronises the picker with the room overview', () => {
    render(<WallpaperPlanDocument plan={plan} walls={walls} corners={[]} closed={false} wallpaper={wallpaper} savedAt="2026-11-12T10:00:00Z" />);

    expect(screen.getByText('3 (2 needed + 1 spare)')).toBeInTheDocument();
    expect(screen.getByText('300 SEK')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Wall B' }));
    expect(screen.getByRole('radio', { name: 'Wall B' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('heading', { name: 'Wall B' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Show Wall B' })[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens drawings only for special pieces and renders the legend once', () => {
    render(<WallpaperPlanDocument plan={plan} walls={walls} corners={[]} closed={false} wallpaper={wallpaper} />);

    fireEvent.click(screen.getByText('Show drawing'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByText('Solid outline: safe table cut. Dashed outline: mark and trim in place.')).toHaveLength(1);
  });
});
