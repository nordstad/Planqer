import { render, screen } from '@testing-library/react';
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
});
