import { render, screen } from '@testing-library/react';
import CostAnalysisPanel from './CostAnalysisPanel';
import '../i18n';

const appliedCost = {
  currency: 'SEK',
  totalCost: 480,
  wasteCost: 40,
  costPerUseful: 0.1,
  byType: { 4200: 2, 5100: 1 },
  costPerBoardType: { 4200: 300, 5100: 180 },
};

it('names the stock to buy by its real length, never by an invented code', () => {
  render(<CostAnalysisPanel appliedCost={appliedCost} optimizeFor="waste" boardsUsed={3} offcut={100} />);
  expect(screen.getByText('4 200 mm')).toBeInTheDocument();
  expect(screen.getByText('5 100 mm')).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/SPF-/);
});
