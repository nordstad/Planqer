import { fireEvent, render, screen } from '@testing-library/react';
import TileLayoutCandidateCard from './TileLayoutCandidateCard';

const mockTranslate = jest.fn((key, options) => {
  if (key === 'ui.candidateDiagram') return `Diagram: ${options.label}`;
  if (key === 'ui.candidateRotated') return `Rotated: ${options.label}`;
  if (key === 'ui.candidateAlternative') return `Alternative: ${options.number}`;
  if (key === 'ui.sliverWarning') return `${options.count} below ${options.threshold} mm`;
  return `translated:${key}`;
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockTranslate }),
}));

const candidate = {
  label: 'Fewest tiles to buy',
  visualization: 'data:image/svg+xml;base64,PHN2Zy8+',
  sliver_count: 0,
  efficiency: 0.8,
  tiles_to_purchase_with_waste: 12,
  distinct_cut_sizes: 3,
};

it.each([
  ['Full tile at bottom-left corner', 'translated:ui.candidateBottomLeft'],
  ['Full tile at bottom-right corner', 'translated:ui.candidateBottomRight'],
  ['Full tile at top-left corner', 'translated:ui.candidateTopLeft'],
  ['Full tile at top-right corner', 'translated:ui.candidateTopRight'],
  ['Full tile at top-right corner (rotated)', 'Rotated: translated:ui.candidateTopRight'],
  ['Best sliver avoidance', 'translated:ui.candidateBestSliverAvoidance'],
  ['Fewest tiles to buy', 'translated:ui.candidateFewestTiles'],
  ['Most symmetric', 'translated:ui.candidateMostSymmetric'],
  ['Fewest cuts', 'translated:ui.candidateFewestCuts'],
  ['Best sliver avoidance & Fewest tiles to buy & Most symmetric & Fewest cuts', 'translated:ui.candidateBestSliverAvoidance & translated:ui.candidateFewestTiles & translated:ui.candidateMostSymmetric & translated:ui.candidateFewestCuts'],
  ['Alternative 2', 'Alternative: 2'],
  ['My preferred layout', 'My preferred layout'],
  ['My layout (rotated)', 'My layout (rotated)'],
  ['Fewest cuts & My label', 'Fewest cuts & My label'],
])('renders label and diagram text for %s', (label, translated) => {
  const onSelect = jest.fn();
  render(<TileLayoutCandidateCard candidate={{ ...candidate, label }} selected onSelect={onSelect} />);
  expect(screen.getByText(translated)).toBeInTheDocument();
  expect(screen.getByRole('img', { name: `Diagram: ${translated}` })).toBeInTheDocument();
  const button = screen.getByRole('button');
  expect(button).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(button);
  expect(onSelect).toHaveBeenCalledTimes(1);
});

it.each([1, 3])('passes count %i and the configured threshold to the warning', (count) => {
  render(<TileLayoutCandidateCard candidate={{ ...candidate, sliver_count: count }} minEdgeCut="42.5" />);
  expect(screen.getByText(`${count} below 42.5 mm`)).toBeInTheDocument();
  expect(mockTranslate).toHaveBeenCalledWith('ui.sliverWarning', { count, threshold: '42.5' });
});

it('omits the warning when no slivers exist', () => {
  mockTranslate.mockClear();
  render(<TileLayoutCandidateCard candidate={candidate} minEdgeCut="50" />);
  expect(mockTranslate).not.toHaveBeenCalledWith('ui.sliverWarning', expect.anything());
});
