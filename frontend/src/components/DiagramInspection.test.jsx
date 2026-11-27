import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../i18n';
import DiagramInspection from './DiagramInspection';

it.each(['data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,aW1hZ2U='])('opens the unchanged saved image and restores keyboard context: %s', async (src) => {
  const user = userEvent.setup();
  render(<DiagramInspection src={src} alt="Synthetic cutting diagram" />);
  const trigger = screen.getByRole('button', { name: /View the full diagram/ });
  trigger.focus();
  await user.keyboard('{Enter}');
  const dialog = screen.getByRole('dialog', { name: 'View the full diagram' });
  expect(within(dialog).getByRole('img')).toHaveAttribute('src', src);
  expect(within(dialog).getByRole('region')).toHaveAttribute('tabindex', '0');
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
