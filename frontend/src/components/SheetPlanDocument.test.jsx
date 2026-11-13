import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../i18n';
import SheetPlanDocument from './SheetPlanDocument';

const project = {
  name: 'Kitchen cabinets', material_type: 'plywood', sheet_thickness: 18, sheet_width: 1200, sheet_height: 2500,
  parts_data: [{ quantity: 2 }], updated_at: '2026-11-13T00:00:00Z',
  optimization_result: {
    total_sheets: 2,
    sheet_visualizations: ['data:image/svg+xml;base64,PHN2Zy8+', 'data:image/svg+xml;base64,PHN2Zy8+'],
    sheets: [
      { efficiency: 51.9, parts_count: 1, sheet_width: 1200, sheet_height: 2500, parts: [{ part_id: 'Shelf', width: 400, height: 200, x: 0, y: 0, rotated: false }] },
      { efficiency: 42.5, parts_count: 1, sheet_width: 1200, sheet_height: 2500, parts: [{ part_id: 'Side', width: 300, height: 200, x: 0, y: 0, rotated: true }] },
    ],
  },
};

describe('SheetPlanDocument', () => {
  it('shows the summary and lets a reader choose a sheet from its overview', () => {
    render(<SheetPlanDocument project={project} />);

    fireEvent.click(screen.getByRole('button', { name: /Sheet 2/i }));
    expect(screen.getByRole('button', { name: /Sheet 2/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Sheet 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Exact placements/i }));
    expect(screen.getByText('Side')).toBeInTheDocument();
  });
});
