import { fireEvent, render, screen } from '@testing-library/react';
import { LanguageProvider } from '../contexts/LanguageContext';
import InfoTip from './InfoTip';

const renderTip = () => render(<LanguageProvider><InfoTip label="Kerf">Material removed by the blade.</InfoTip></LanguageProvider>);

it('opens on hover and closes when the pointer leaves', () => {
  renderTip();
  const button = screen.getByRole('button', { name: 'More information about Kerf' });
  fireEvent.mouseEnter(button);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Material removed by the blade.');
  fireEvent.mouseLeave(button.parentElement);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

it('toggles on tap or click', () => {
  renderTip();
  const button = screen.getByRole('button', { name: 'More information about Kerf' });
  fireEvent.focus(button);
  fireEvent.click(button);
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
  fireEvent.click(button);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
