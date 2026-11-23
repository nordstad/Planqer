import { fireEvent, render, screen } from '@testing-library/react';
import '../i18n';
import TileDiagram from './TileDiagram';

const svg = (content) => `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${content}</svg>`)}`;

it('opens the matching cut for rectangular and polygon tiles by pointer and keyboard', () => {
  const select = vi.fn();
  render(<TileDiagram candidate={{
    visualization: svg('<rect fill="#fff"/><rect x="1" y="2" width="10" height="20" fill="#abc"/><polygon points="1,1 10,1 1,10" fill="#def"/>'),
    tiles: [
      { kind: 'cut', fill_color: '#abc', size_label: 'A' },
      { kind: 'notched', fill_color: '#def', size_label: 'B' },
    ],
    piece_diagrams: { A: 'a', B: 'b' },
  }} onSelect={select} alt="Layout" />);

  fireEvent.click(screen.getByRole('button', { name: 'View cut A' }));
  fireEvent.keyDown(screen.getByRole('button', { name: 'View cut B' }), { key: 'Enter' });
  expect(select.mock.calls).toEqual([['A'], ['B']]);
});

it('leaves older or unmatched diagrams as images without guessed targets', () => {
  render(<TileDiagram candidate={{
    visualization: svg('<rect fill="#abc"/>'),
    tiles: [{ kind: 'cut', fill_color: '#def', size_label: 'A' }],
    piece_diagrams: { A: 'a' },
  }} onSelect={vi.fn()} alt="Layout" />);
  expect(screen.getByAltText('Layout')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('crops the on-screen SVG to the surface and keeps the tile hit targets aligned', () => {
  const source = svg('<rect data-tile-surface="true" x="40" y="70" width="60" height="40" fill="#eee"/><rect x="40" y="70" width="30" height="40" fill="#abc"/><text x="4" y="8">Header</text>');
  render(<TileDiagram candidate={{
    visualization: source,
    tiles: [{ kind: 'cut', fill_color: '#abc', size_label: 'A' }],
    piece_diagrams: { A: 'a' },
  }} onSelect={vi.fn()} alt="Layout" />);
  const img = screen.getByAltText('Layout');
  const displayed = new DOMParser().parseFromString(atob(img.src.split(',')[1]), 'image/svg+xml').documentElement;
  expect(displayed.getAttribute('viewBox')).toBe('39 69 62 42');
  expect(screen.getByRole('button', { name: 'View cut A' }).ownerSVGElement).toHaveAttribute('viewBox', '39 69 62 42');
  expect(screen.getByText('Cut around opening')).toBeInTheDocument();
});

it('explains full tiles on hover without offering a cut action', () => {
  const select = vi.fn();
  render(<TileDiagram candidate={{
    visualization: svg('<rect x="0" y="0" width="20" height="20" fill="#abc"/>'),
    tiles: [{ kind: 'full', fill_color: '#abc' }],
    piece_diagrams: {},
  }} onSelect={select} alt="Layout" />);
  expect(screen.getByText('Full tile — No cut needed').parentElement).toHaveClass('tile-diagram-full');
  fireEvent.click(screen.getByText('Full tile — No cut needed').parentElement);
  expect(select).not.toHaveBeenCalled();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
