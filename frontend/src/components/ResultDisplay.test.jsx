import { render, screen } from '@testing-library/react';
import ResultDisplay from './ResultDisplay';

describe('ResultDisplay', () => {
  it('renders the diagram and what-to-buy table', () => {
    render(
      <ResultDisplay
        result={{
          board_lengths_used: [300, 300],
          cut_list: [[100, 50], [80, 70]],
          visualization: 'data:image/svg+xml;base64,PHN2Zy8+',
        }}
        projectName="Test plan"
      />
    );
    expect(screen.getByAltText(/Cutting plan diagram/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /What to buy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download diagram/i })).toBeInTheDocument();
  });
});
