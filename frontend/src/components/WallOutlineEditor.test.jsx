import { fireEvent, render, screen } from '@testing-library/react';
import '../i18n';
import WallOutlineEditor from './WallOutlineEditor';

it('keeps one set of normal-size HTML controls independent of drawing scale', () => {
  const onChange = vi.fn();
  const { container } = render(<WallOutlineEditor wall={{ width_top: '3000', height_left: '2400', height_right: '1800', lower_left: '0', lower_right: '100' }} onChange={onChange} />);
  expect(container.querySelector('foreignObject')).toBeNull();
  const inputs = screen.getAllByRole('textbox');
  expect(inputs).toHaveLength(5);
  expect(inputs.every((input) => !input.closest('svg'))).toBe(true);
  expect(inputs.map((input) => input.value)).toEqual(['2400', '1800', '0', '100', '3000']);
  fireEvent.change(inputs[4], { target: { value: '3200' } });
  expect(onChange).toHaveBeenCalledWith({ width_top: '3200', width_middle: '3200', width_bottom: '3200' });
  fireEvent.change(inputs[1], { target: { value: '1900' } });
  expect(onChange).toHaveBeenCalledWith({ height_right: '1900' });
});
