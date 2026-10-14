import { render, screen } from '@testing-library/react';
import PartInputRow from './PartInputRow';

describe('PartInputRow', () => {
  it('renders inputs for part length, quantity, and name without numeric placeholders', () => {
    render(
      <table>
        <tbody>
          <PartInputRow
            index={0}
            part={{ length: '100', quantity: '2', name: 'Front rail' }}
            handlePartChange={() => {}}
            handlePartsPaste={() => {}}
            removePart={() => {}}
            error={null}
            canRemove
          />
        </tbody>
      </table>
    );
    expect(screen.getByLabelText(/Part length in millimetres, item 1/i)).toHaveValue(100);
    expect(screen.getByLabelText(/Part length in millimetres, item 1/i)).toHaveAttribute('min', '1');
    expect(screen.getByLabelText(/Part length in millimetres, item 1/i)).toHaveAttribute('step', '1');
    expect(screen.getByLabelText(/Quantity, item 1/i)).toHaveValue(2);
    expect(screen.getByLabelText(/Name, item 1/i)).toHaveValue('Front rail');
    expect(screen.getByLabelText(/Part length in millimetres, item 1/i)).not.toHaveAttribute('placeholder');
    expect(screen.getByLabelText(/Quantity, item 1/i)).not.toHaveAttribute('placeholder');
  });

  it('shows the error message when given one', () => {
    render(
      <table>
        <tbody>
          <PartInputRow
            index={0}
            part={{ length: '', quantity: '' }}
            handlePartChange={() => {}}
            handlePartsPaste={() => {}}
            removePart={() => {}}
            error={{ quantity: 'Required' }}
            canRemove
          />
        </tbody>
      </table>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(screen.getByRole('alert').closest('tr')).toHaveClass('part-error-row');
    expect(screen.getByLabelText(/Quantity, item 1/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/Part length in millimetres, item 1/i)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText(/Part length in millimetres, item 1/i)).toHaveClass('is-required-empty');
    expect(screen.getByLabelText(/Quantity, item 1/i)).toHaveClass('is-error');
    expect(screen.getByLabelText(/Name, item 1/i)).not.toHaveClass('is-required-empty');
  });
});
