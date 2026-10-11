import { fireEvent, render, screen } from '@testing-library/react';
import TileCutListTable from './TileCutListTable';

describe('TileCutListTable', () => {
  const diagram = (name) => `data:image/svg+xml;base64,${btoa(`<svg>${name}</svg>`)}`;
  const piece = (overrides) => ({
    kind: 'notched', width: 300, height: 300, nominal_width: 300, nominal_height: 300,
    fill_color: '#eadb9c', is_sliver: false, is_reused_offcut: false, ...overrides,
  });

  it('lists notched pieces of the same size separately when their openings differ', () => {
    render(
      <TileCutListTable
        candidate={{
          tiles: [
            piece({ size_label: 'A', notches: [[0, 0, 100, 100]] }),
            piece({ size_label: 'A', notches: [[0, 0, 100, 100]] }),
            piece({ size_label: 'B', fill_color: '#bcd', notches: [[200, 0, 100, 100]] }),
          ],
          piece_diagrams: { A: diagram('a'), B: diagram('b') },
          notched_count: 3,
          reused_offcut_count: 0,
        }}
      />,
    );

    expect(screen.getAllByText('Cut around an opening — see diagram')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'View cut B' }));
    expect(screen.getByAltText('Cut template for piece B')).toHaveAttribute('src', diagram('b'));
  });

  it('lists the same cut size from differently oriented tiles separately', () => {
    render(
      <TileCutListTable
        candidate={{
          tiles: [
            piece({ kind: 'cut', width: 287, height: 300, nominal_height: 600, size_label: 'A' }),
            piece({ kind: 'cut', width: 287, height: 300, nominal_width: 600, size_label: 'B' }),
          ],
          piece_diagrams: { A: diagram('a'), B: diagram('b') },
          notched_count: 0,
          reused_offcut_count: 0,
        }}
      />,
    );

    expect(screen.getAllByText('Straight cut')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'View cut A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View cut B' })).toBeInTheDocument();
  });

  it('still groups tiles saved before pieces had labels by their size', () => {
    render(
      <TileCutListTable
        candidate={{
          tiles: [
            piece({ kind: 'cut', width: 287, height: 600, nominal_height: 600 }),
            piece({ kind: 'cut', width: 287, height: 600, nominal_height: 600 }),
          ],
          notched_count: 0,
          reused_offcut_count: 0,
        }}
      />,
    );

    expect(screen.getAllByText('Straight cut')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /View cut/ })).not.toBeInTheDocument();
  });

  it('offers detailed templates for straight cuts too', () => {
    render(
      <TileCutListTable
        candidate={{
          tiles: [{
            kind: 'cut', width: 287, height: 600, nominal_width: 300, nominal_height: 600,
            fill_color: '#eadb9c', size_label: 'A', is_sliver: false,
            is_reused_offcut: false,
          }],
          piece_diagrams: { A: 'data:image/svg+xml;base64,PHN2Zy8+' },
          notched_count: 0,
          reused_offcut_count: 0,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View cut A' }));

    expect(screen.getByAltText('Cut template for piece A')).toBeInTheDocument();
  });

  it('renders diagonal template details as selectable text outside the image', () => {
    render(
      <TileCutListTable
        candidate={{
          tiles: [{
            kind: 'cut', width: 497, height: 285, nominal_width: 300, nominal_height: 600,
            fill_color: '#eadb9c', size_label: 'E', edge_lengths: [402, 300, 102, 424],
            vertices: [[-150, -300], [-150, 102], [150, -300]], is_sliver: false,
            is_reused_offcut: false,
          }],
          piece_diagrams: { E: 'data:image/svg+xml;base64,PHN2Zy8+' },
          notched_count: 0,
          reused_offcut_count: 0,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View cut E' }));

    expect(screen.getByText('Piece E - 300×600 mm tile')).toBeInTheDocument();
    expect(screen.getByText(/Final size: 497×285 mm/)).toBeInTheDocument();
    expect(screen.getByText(/Edges: 402 · 300 · 102 · 424 mm/)).toBeInTheDocument();
    expect(screen.getByText(/Keep the light area/)).toBeInTheDocument();
    expect(screen.getByAltText('Cut template for piece E')).toBeInTheDocument();
    expect(document.querySelector('svg polygon')).toBeInTheDocument();
  });
});
