import { render, screen } from '@testing-library/react';
import BoardLengthRow from './BoardLengthRow';

describe('BoardLengthRow', () => {
  it('renders the board length input and derived stock code', () => {
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
    expect(screen.getByText('SPF-3')).toBeInTheDocument();
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
});
