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
  it('preserves fractional stock, placements, and diagram descriptions across sheets', () => {
    const fractionalProject = {
      ...project, sheet_thickness: 18.125, sheet_width: 1200.5, sheet_height: 2500.25,
      optimization_result: {
        ...project.optimization_result,
        sheets: project.optimization_result.sheets.map((sheet, index) => ({
          ...sheet, sheet_width: 1200.5, sheet_height: 2500.25,
          parts: [{
            ...sheet.parts[0], width: 800.5, height: 400.25,
            x: index ? 0 : 3.125, y: index ? 400.0625 : 0.0625,
          }],
        })),
      },
    };
    render(<SheetPlanDocument project={fractionalProject} />);
    expect(screen.getByText('18,125 mm')).toBeInTheDocument();
    expect(screen.getByText(/1\s?200,5 mm × 2\s?500,25 mm/)).toBeInTheDocument();
    expect(screen.getByAltText(/Sheet 1: 1\s?200,5 by 2\s?500,25 millimetres/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Exact placements/i }));
    expect(screen.getByText('800,5 mm × 400,25 mm')).toBeInTheDocument();
    expect(screen.getByText('3,125; 0,0625')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sheet 2/i }));
    expect(screen.getByText('0; 400,0625')).toBeInTheDocument();
    expect(screen.getByText('90°')).toBeInTheDocument();
    expect(screen.queryByText('801 mm × 400 mm')).not.toBeInTheDocument();
  });

  it('shows the summary and lets a reader choose a sheet from its overview', () => {
    render(<SheetPlanDocument project={project} />);

    fireEvent.click(screen.getByRole('button', { name: /Sheet 2/i }));
    expect(screen.getByRole('button', { name: /Sheet 2/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Sheet 2' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Exact placements/i }));
    expect(screen.getByText('Side')).toBeInTheDocument();
  });
});
