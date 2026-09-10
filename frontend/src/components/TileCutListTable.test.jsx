import { fireEvent, render, screen } from '@testing-library/react';
import TileCutListTable from './TileCutListTable';

describe('TileCutListTable', () => {
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
    expect(screen.getByText(/The solid \(light\) area is what you keep/)).toBeInTheDocument();
    expect(screen.getByAltText('Cut template for piece E')).toBeInTheDocument();
  });
});
