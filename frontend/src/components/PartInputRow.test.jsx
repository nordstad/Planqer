import { render, screen } from '@testing-library/react';
import PartInputRow from './PartInputRow';

describe('PartInputRow', () => {
  it('renders inputs for part length and quantity, and their total', () => {
    render(
      <table>
        <tbody>
          <PartInputRow
            index={0}
            part={{ length: '100', quantity: '2' }}
            handlePartChange={() => {}}
            handlePartsPaste={() => {}}
            removePart={() => {}}
            error=""
            canRemove
          />
        </tbody>
      </table>
    );
    expect(screen.getByLabelText(/Part length in millimetres, item 1/i)).toHaveValue(100);
    expect(screen.getByLabelText(/Quantity, item 1/i)).toHaveValue(2);
    expect(screen.getByText('200')).toBeInTheDocument();
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
            error="Required"
            canRemove
          />
        </tbody>
      </table>
    );
    expect(screen.getByText('Required')).toBeInTheDocument();
  });
});
