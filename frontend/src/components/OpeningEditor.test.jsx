import { fireEvent, render, screen } from '@testing-library/react';
import { LanguageProvider } from '../contexts/LanguageContext';
import OpeningEditor from './OpeningEditor';

it('uses the wallpaper opening controls for a tile opening', () => {
  const onChange = vi.fn();
  render(<LanguageProvider><OpeningEditor cutout={{ kind: 'window', x: '', y: '', width: '', height: '' }} fromVertical="tileUi.openingFromTop" onChange={onChange} onRemove={vi.fn()} /></LanguageProvider>);

  expect(screen.getByRole('combobox', { name: 'Type' })).toBeInTheDocument();
  expect(screen.getByLabelText('From left edge (mm)')).toBeInTheDocument();
  expect(screen.getByLabelText('From top edge')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: 'custom' } });
  expect(onChange).toHaveBeenCalledWith('kind', 'custom');
});
