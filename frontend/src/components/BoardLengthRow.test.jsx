import { render, screen } from '@testing-library/react';
import BoardLengthRow from './BoardLengthRow';

describe('BoardLengthRow', () => {
  it('renders the board length input without an invented stock code', () => {
    render(
      <table>
        <tbody>
          <BoardLengthRow
            board="300"
            index={0}
            handleBoardChange={() => {}}
            handleBoardsPaste={() => {}}
            removeBoard={() => {}}
            error=""
            canRemove
          />
        </tbody>
      </table>
    );
    expect(screen.getByLabelText(/Board length in millimetres, row 1/i)).toHaveValue(300);
    expect(screen.queryByText(/SPF-/)).not.toBeInTheDocument();
    expect(screen.getByText('0.3 m')).toBeInTheDocument();
  });

  it('shows the error message when given one', () => {
    render(
      <table>
        <tbody>
          <BoardLengthRow
            board="300"
            index={0}
            handleBoardChange={() => {}}
            handleBoardsPaste={() => {}}
            removeBoard={() => {}}
            error="Too short"
            canRemove
          />
        </tbody>
      </table>
    );
    expect(screen.getByText('Too short')).toBeInTheDocument();
  });

  it('allows fractional board lengths', () => {
    render(
      <table>
        <tbody>
          <BoardLengthRow
            board="300.5"
            index={0}
            handleBoardChange={() => {}}
            handleBoardsPaste={() => {}}
            removeBoard={() => {}}
            error=""
            canRemove
          />
        </tbody>
      </table>
    );

    expect(screen.getByLabelText(/Board length in millimetres, row 1/i)).toHaveValue(300.5);
    expect(screen.getByLabelText(/Board length in millimetres, row 1/i)).toHaveAttribute('step', 'any');
  });
});
