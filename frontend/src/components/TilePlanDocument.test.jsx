import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../i18n';
import TilePlanDocument from './TilePlanDocument';

const project = {
  tile_data: { material_type: 'Ceramic', width: 300, height: 600 }, updated_at: '2026-11-13T00:00:00Z',
  layout_result: { visualization: 'data:image/svg+xml;base64,PHN2Zy8+', tiles_to_purchase: 12, tiles: [{ kind: 'full', width: 300, height: 600, fill_color: '#fff' }], warnings: [] },
};

describe('TilePlanDocument', () => {
  it('shows the saved layout and its cut list', () => {
    render(<TilePlanDocument project={project} />);
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'the full tile layout' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cut list' })).toBeInTheDocument();
  });

  it('highlights the matching row on hover and keyboard focus', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="40" height="40" fill="#abc"/><rect x="40" y="0" width="40" height="40" fill="#def"/></svg>';
    const result = {
      visualization: `data:image/svg+xml;base64,${btoa(svg)}`,
      tiles_to_purchase: 2,
      tiles: [
        { kind: 'full', width: 300, height: 600, fill_color: '#abc' },
        { kind: 'cut', width: 200, height: 600, nominal_width: 300, nominal_height: 600, fill_color: '#def', size_label: 'A' },
      ],
      piece_diagrams: { A: 'data:image/svg+xml;base64,PHN2Zy8+' },
    };
    const { container } = render(<TilePlanDocument project={{ ...project, layout_result: result }} />);
    const target = container.querySelector('.tile-diagram-targets [role="button"]');
    const row = within(container.querySelector('.tile-cut-list')).getByRole('button', { name: 'View cut A' }).closest('tr');
    const fullRow = screen.getByText('Full tile').closest('tr');
    const full = container.querySelector('.tile-diagram-full');

    fireEvent.pointerEnter(target);
    expect(row).toHaveClass('is-diagram-highlighted');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Size mm: 200 × 600');
    expect(screen.getByRole('tooltip')).toHaveTextContent('A');
    expect(fullRow).not.toHaveClass('is-diagram-highlighted');
    fireEvent.pointerLeave(target);
    expect(row).not.toHaveClass('is-diagram-highlighted');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(target);
    expect(row).toHaveClass('is-diagram-highlighted');
    fireEvent.blur(target);
    expect(row).not.toHaveClass('is-diagram-highlighted');
    fireEvent.pointerEnter(full);
    expect(fullRow).toHaveClass('is-diagram-highlighted');
    expect(screen.getByRole('tooltip')).toHaveTextContent('No cut needed');
    expect(within(row).getByRole('button', { name: 'View cut A' })).toBeInTheDocument();
    fireEvent.pointerLeave(full);
    fireEvent.pointerEnter(row);
    expect(target).toHaveClass('is-list-highlighted');
    fireEvent.pointerLeave(row);
    expect(target).not.toHaveClass('is-list-highlighted');
    fireEvent.focus(within(row).getByRole('button', { name: 'View cut A' }));
    expect(target).toHaveClass('is-list-highlighted');
    row.scrollIntoView = vi.fn();
    fireEvent.click(target);
    fireEvent.click(screen.getByRole('button', { name: 'Show in cut list' }));
    expect(row.scrollIntoView).toHaveBeenCalled();
    expect(row).toHaveClass('is-diagram-highlighted');
    expect(within(row).queryByRole('button', { name: 'Show on diagram' })).not.toBeInTheDocument();
  });
});
