/*
  One stock line in the STOCK AVAILABLE table. Stock codes are derived from the
  length the way a supplier's catalog does it: SPF-51 is a 5100 mm board.
*/
import { Strike } from './icons';

const BoardLengthRow = ({ board, index, handleBoardChange, handleBoardsPaste, removeBoard, error, canRemove, inPlan }) => {
  const mm = parseFloat(board);
  const code = Number.isFinite(mm) && mm > 0 ? `SPF-${Math.round(mm / 100)}` : '—';
  // once a plan exists, the stock the plan actually buys is knocked out in signal
  const solved = inPlan !== null && inPlan !== undefined;

  return (
    <tr className={solved && !inPlan ? 'is-out' : undefined}>
      <td>{code}</td>
      <td>
        <input
          aria-label={`Board length in millimetres, row ${index + 1}`}
          type="number"
          step="1"
          placeholder="3000"
          value={board}
          onChange={(e) => handleBoardChange(index, e.target.value)}
          onPaste={(e) => handleBoardsPaste(index, e)}
          className={`cell-input ${error ? 'is-error' : ''}`}
          required
          min="1"
        />
        {error && <p className="text-danger text-[11px] font-semibold text-right">{error}</p>}
      </td>
      {solved ? (
        <td style={{ width: '86px' }} className={inPlan ? 'cell-in-plan' : undefined}>
          {inPlan || '—'}
        </td>
      ) : (
        <td style={{ width: '86px', color: 'var(--ink-3)' }}>
          {Number.isFinite(mm) && mm > 0 ? `${(mm / 1000).toFixed(1)} m` : '—'}
        </td>
      )}
      <td style={{ width: '34px' }}>
        {canRemove && (
          <button
            type="button"
            onClick={() => removeBoard(index)}
            className="cell-strike"
            aria-label={`Remove board length, row ${index + 1}`}
            title="Strike this line"
          >
            <Strike />
          </button>
        )}
      </td>
    </tr>
  );
};

export default BoardLengthRow;
