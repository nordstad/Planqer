import { render, screen } from '@testing-library/react';
import '../i18n';
import FormField from './FormField';

it('associates only the faulty field and clears its error after correction', () => {
  const tree = (error) => <><p id="hint">Measured stock</p>
    <FormField label="Width (mm)" error={error}><input aria-describedby="hint" /></FormField>
    <FormField label="Height (mm)"><input /></FormField></>;
  const view = render(tree('Use whole millimetres'));
  const width = screen.getByLabelText('Width (mm)');
  expect(width).toHaveAttribute('aria-invalid', 'true');
  expect(width).toHaveAccessibleDescription('Measured stock Use whole millimetres');
  expect(screen.getByLabelText('Height (mm)')).not.toHaveAttribute('aria-describedby');
  const id = width.id;
  view.rerender(tree(''));
  expect(width.id).toBe(id);
  expect(width).not.toHaveAttribute('aria-invalid');
  expect(width).toHaveAccessibleDescription('Measured stock');
});
