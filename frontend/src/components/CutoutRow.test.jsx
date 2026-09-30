import { fireEvent, render, screen } from '@testing-library/react';
import CutoutRow from './CutoutRow';

const mockTranslate = jest.fn((key, options) => {
  if (key === 'workflow.width') return 'Bredd';
  if (key === 'workflow.height') return 'Hojd';
  if (key === 'ui.cutoutSizeAria') return `${options.axis} ${options.item}`;
  return key;
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockTranslate }),
}));

it('localizes dimension labels without changing the edited field names', () => {
  const handleCutoutChange = jest.fn();
  render(
    <table><tbody>
      <CutoutRow
        cutout={{ x: '0', y: '0', width: '100', height: '200' }}
        index={1}
        handleCutoutChange={handleCutoutChange}
        removeCutout={jest.fn()}
      />
    </tbody></table>,
  );

  fireEvent.change(screen.getByRole('spinbutton', { name: 'Bredd 2' }), { target: { value: '150' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Hojd 2' }), { target: { value: '250' } });
  expect(handleCutoutChange).toHaveBeenCalledWith(1, 'width', '150');
  expect(handleCutoutChange).toHaveBeenCalledWith(1, 'height', '250');
});
