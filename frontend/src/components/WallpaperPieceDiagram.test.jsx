import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../i18n';
import WallpaperPieceDiagram from './WallpaperPieceDiagram';
import WallpaperPieceGallery from './WallpaperPieceGallery';

const strip = { number: 1, wall_index: 0, x_start: 0, x_end: 530, width: 530, top_height: 2400, bottom_height: 0, allowance_top: 50, allowance_bottom: 40 };
const notch = { x_start: 70, y_start: 770, x_end: 330, y_end: 1730, mode: 'precut', kind: 'window', label: 'Kitchen', core: [100, 800, 300, 1700] };
const piece = (overrides = {}) => ({
  id: 'piece-1', strip_number: 1, wall_index: 0, y_start: 0, y_end: 2400, length: 2400, phase: 0,
  notches: [notch], segments: [{ wall_index: 0, x_start: 0, x_end: 530, notches: [notch] }], ...overrides,
});

describe('WallpaperPieceDiagram', () => {
  it('draws the opening, its name, margin, trim and orientation', () => {
    const { container } = render(<WallpaperPieceDiagram piece={piece()} strip={strip} repeat={0} />);

    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    expect(screen.getByText('200 × 900 mm')).toBeInTheDocument();
    expect(screen.getByText('TOP (ceiling)')).toBeInTheDocument();
    expect(screen.getByText('precut 2490 mm')).toBeInTheDocument();
    expect(screen.getByText('BOTTOM (floor)')).toBeInTheDocument();
    expect(screen.getByTestId('trim-top')).toHaveTextContent('+50 mm trim');
    expect(screen.getByTestId('trim-bottom')).toHaveTextContent('+40 mm trim');
    expect(container.querySelector('rect[fill^="url(#hatch-piece-1)"]')).not.toBeNull();
    // Measured from the top edge (2400 - 1700) and the left edge, as at the cutting table.
    expect(screen.getByText('700')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
  });

  it('says where on the wall the piece is hung', () => {
    render(<WallpaperPieceDiagram piece={piece({ y_start: 100 })} strip={strip} wallNames={['Wall A']} />);

    expect(screen.getByText('Wall A · 0–530 mm from the left of the wall · hung 100–2400 mm above the floor')).toBeInTheDocument();
  });

  it('names an opening without a label by its kind and dashes marks', () => {
    const outlet = { ...notch, label: null, kind: 'outlet', mode: 'mark' };
    const { container } = render(<WallpaperPieceDiagram piece={piece({ notches: [outlet], segments: [{ wall_index: 0, x_start: 0, x_end: 530, notches: [outlet] }] })} strip={strip} />);

    expect(screen.getByText('Outlet')).toBeInTheDocument();
    expect(screen.getByText('MARK ON WALL')).toBeInTheDocument();
    expect(container.querySelector('rect[stroke-dasharray="5 4"]')).not.toBeNull();
  });

  it('labels only TOP when a piece starts below the ceiling and has no trim there', () => {
    render(<WallpaperPieceDiagram piece={piece({ y_end: 2100, length: 2100 })} strip={strip} />);

    expect(screen.getByText('TOP')).toBeInTheDocument();
    expect(screen.queryByTestId('trim-top')).toBeNull();
    expect(screen.getByTestId('trim-bottom')).toBeInTheDocument();
  });

  it('falls back to a plain notch for plans saved without opening details', () => {
    const old = { x_start: 70, y_start: 770, x_end: 330, y_end: 1730, mode: 'precut' };
    const oldStrip = { number: 1, x_start: 0, x_end: 530, width: 530, top_height: 2400 };
    render(<WallpaperPieceDiagram piece={piece({ notches: [old], segments: undefined })} strip={oldStrip} />);

    expect(screen.getByText('TABLE CUT')).toBeInTheDocument();
    expect(screen.getByText('260 × 960 mm')).toBeInTheDocument();
    expect(screen.queryByTestId('piece-opening')).toBeNull();
    expect(screen.queryByTestId('trim-top')).toBeNull();
  });
});

describe('WallpaperPieceGallery', () => {
  const pieces = [piece(), piece({ id: 'piece-2', notches: [], segments: [{ wall_index: 0, x_start: 0, x_end: 530, notches: [] }] })];

  it('shows a drawing for every piece and opens one full size', () => {
    const onOpen = vi.fn();
    const { rerender } = render(<WallpaperPieceGallery pieces={pieces} strips={[strip]} repeat={0} openId={null} onOpen={onOpen} />);

    expect(screen.getAllByTestId('piece-drawing')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Open drawing of piece-2' }));
    expect(onOpen).toHaveBeenCalledWith('piece-2');

    rerender(<WallpaperPieceGallery pieces={pieces} strips={[strip]} repeat={0} openId="piece-1" onOpen={onOpen} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Kitchen')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onOpen).toHaveBeenLastCalledWith(null);
  });
});
