import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../i18n';
import BoardPlanDocument from './BoardPlanDocument';

const project = {
  material_type: 'Pine', board_thickness: 45, board_width: 95, parts_data: [{ length: 600, quantity: 2 }], updated_at: '2026-11-13T00:00:00Z',
  optimization_result: { visualization: 'data:image/svg+xml;base64,PHN2Zy8+', cut_list: [[600, 300], [400]], board_lengths_used: [2400, 1800] },
};

describe('BoardPlanDocument', () => {
  it('shows the plan summary and lets a reader select a board', () => {
    render(<BoardPlanDocument project={project} />);
    fireEvent.click(screen.getByRole('tab', { name: /Board 2/i }));
    expect(screen.getByRole('tab', { name: /Board 2/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('400 mm')).toBeInTheDocument();
  });
});
