/*
  One line item in the REQUIRED PARTS table. The ruled cell is the field —
  no pill, no box. Item numbers are catalog line numbers, not decoration.
*/
import { Strike } from './icons';

const PartInputRow = ({ part, index, handlePartChange, handlePartsPaste, removePart, error, canRemove }) => {
  const total = (parseFloat(part.length) || 0) * (parseFloat(part.quantity) || 0);

  return (
    <tr>
      <td>{String(index + 1).padStart(2, '0')}</td>
      <td>
        <input
          id={`length-${index}`}
          aria-label={`Part length in millimetres, item ${index + 1}`}
          type="number"
          step="1"
          placeholder="1000"
          value={part.length}
          onChange={(e) => handlePartChange(index, 'length', e.target.value)}
          onPaste={(e) => handlePartsPaste(index, e)}
          className={`cell-input ${error ? 'is-error' : ''}`}
          required
          min="1"
        />
        {error && <p className="text-danger text-[11px] font-semibold text-right">{error}</p>}
      </td>
      <td style={{ width: '72px' }}>
        <input
          id={`quantity-${index}`}
          aria-label={`Quantity, item ${index + 1}`}
          type="number"
          step="1"
          placeholder="5"
          value={part.quantity}
          onChange={(e) => handlePartChange(index, 'quantity', e.target.value)}
          className="cell-input"
          required
          min="1"
        />
      </td>
      <td style={{ width: '86px', color: 'var(--ink-3)' }}>
        {total ? total.toLocaleString('sv-SE') : '—'}
      </td>
      <td style={{ width: '34px' }}>
        {canRemove && (
          <button
            type="button"
            onClick={() => removePart(index)}
            className="cell-strike"
            aria-label={`Remove part, item ${index + 1}`}
            title="Strike this line"
          >
            <Strike />
          </button>
        )}
      </td>
    </tr>
  );
};

export default PartInputRow;
