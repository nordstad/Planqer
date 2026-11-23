import { render, screen } from '@testing-library/react';
import ResultDisplay from './ResultDisplay';

describe('ResultDisplay', () => {
  it('renders the diagram and what-to-buy table without duplicating its cut order', () => {
    render(
      <ResultDisplay
        result={{
          board_lengths_used: [300, 300],
          cut_list: [[100, 50], [80, 70]],
          visualization: 'data:image/svg+xml;base64,PHN2Zy8+',
        }}
        projectName="Test plan"
        materialType="oak"
        boardThickness={45}
        boardWidth={45}
      />
    );
    expect(screen.getByAltText(/Cutting plan diagram/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /What to buy/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Cut order/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download PNG/i })).toBeInTheDocument();
    expect(screen.getAllByText('300').length).toBeGreaterThan(0);
    expect(screen.getAllByText('oak · 45 × 45 mm').length).toBeGreaterThan(0);
  });

  it('does not duplicate dimensions already present in the stock name', () => {
    render(<ResultDisplay result={{ board_lengths_used: [3000], cut_list: [[100]], visualization: 'data:image/svg+xml;base64,PHN2Zy8+' }} materialType="Framing timber / studs 48 × 98 mm" boardThickness={48} boardWidth={98} />);
    expect(screen.getByText('Framing timber / studs 48 × 98 mm')).toBeInTheDocument();
    expect(screen.queryByText(/98 mm · 48/)).not.toBeInTheDocument();
  });
});
