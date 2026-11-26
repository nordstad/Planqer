import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '../i18n';
import BoardPlanDocument from './BoardPlanDocument';

const project = {
  material_type: 'Pine', board_thickness: 45, board_width: 95, parts_data: [{ name: 'Short rail', length: 600, quantity: 2 }], updated_at: '2026-11-13T00:00:00Z',
  optimization_result: { visualization: 'data:image/svg+xml;base64,PHN2Zy8+', cut_list: [[600, 300], [400]], board_lengths_used: [2400, 1800] },
};

describe('BoardPlanDocument', () => {
  it.each(['named rows', 'legacy map'])('preserves fractional profile, stock, and cuts from %s', (format) => {
    const fractionalProject = {
      ...project, board_thickness: 44.8, board_width: 95.2,
      parts_data: format === 'legacy map' ? { '800.5': 1, '400.25': 1 } : [
        { name: 'Long rail', length: 800.5, quantity: 1 },
        { name: 'Short rail', length: 400.25, quantity: 1 },
      ],
      optimization_result: {
        ...project.optimization_result, cut_list: [[800.5], [400.25]],
        board_lengths_used: [2400.5, 1800.25],
      },
    };
    const { container } = render(<BoardPlanDocument project={fractionalProject} />);
    expect(screen.getByText('44,8 mm × 95,2 mm')).toBeInTheDocument();
    expect(screen.getByText(/1 × 2\s?400,5 mm, 1 × 1\s?800,25 mm/)).toBeInTheDocument();
    expect(container.querySelector('.board-plan-parts').textContent).toContain('800,5 mm');
    expect(container.querySelector('.board-plan-parts').textContent).toContain('400,25 mm');
    expect(container.querySelector('.board-plan-cuts').textContent).toContain('800,5 mm');
    expect(screen.getByRole('tab', { name: /Board 1.*2\s?400,5 mm/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /Board 2.*1\s?800,25 mm/ }));
    expect(container.querySelector('.board-plan-cuts').textContent).toContain('400,25 mm');
    expect(container.querySelector('.board-plan-cuts').textContent).not.toContain('400 mm');
  });

  it('shows the plan summary and lets a reader select a board', () => {
    render(<BoardPlanDocument project={project} />);
    fireEvent.click(screen.getByRole('tab', { name: /Board 2/i }));
    expect(screen.getByRole('tab', { name: /Board 2/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('cell', { name: 'Short rail' })).toBeInTheDocument();
    expect(screen.getByText('400 mm')).toBeInTheDocument();
  });
});
