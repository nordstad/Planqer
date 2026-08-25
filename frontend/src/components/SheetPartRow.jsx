/*
  One line item in the PARTS TO CUT table. Mirrors PartInputRow's ruled-cell
  grammar. Width and height share one "Size" cell — a genuine 2D-vs-1D
  difference from board parts, not a style choice — so the column count
  matches PartInputRow's (Item/Size/Qty/Name/Remove = 5, same as
  Item/Length/Qty/Total/Remove) and Name keeps a real column width.
*/
import { Strike } from './icons';

const SheetPartRow = ({ part, index, handlePartChange, removePart, error, canRemove }) => {
  return (
    <tr>
      <td>{String(index + 1).padStart(2, '0')}</td>
      <td style={{ width: '128px' }}>
        <div className="flex items-center gap-1">
          <input
            aria-label={`Part width in millimetres, item ${index + 1}`}
            type="number"
            step="0.1"
            placeholder="800"
            value={part.width}
            onChange={(e) => handlePartChange(index, 'width', e.target.value)}
            className={`cell-input ${error?.width ? 'is-error' : ''}`}
            style={{ width: '56px' }}
            required
            min="0.1"
          />
          <span style={{ color: 'var(--ink-3)' }}>×</span>
          <input
            aria-label={`Part height in millimetres, item ${index + 1}`}
            type="number"
            step="0.1"
            placeholder="400"
            value={part.height}
            onChange={(e) => handlePartChange(index, 'height', e.target.value)}
            className={`cell-input ${error?.height ? 'is-error' : ''}`}
            style={{ width: '56px' }}
            required
            min="0.1"
          />
        </div>
        {(error?.width || error?.height) && (
          <p className="text-danger text-[11px] font-semibold text-right">{error.width || error.height}</p>
        )}
      </td>
      <td style={{ width: '52px' }}>
        <input
          aria-label={`Quantity, item ${index + 1}`}
          type="number"
          step="1"
          placeholder="2"
          value={part.quantity}
          onChange={(e) => handlePartChange(index, 'quantity', e.target.value)}
          className={`cell-input ${error?.quantity ? 'is-error' : ''}`}
          required
          min="1"
        />
        {error?.quantity && <p className="text-danger text-[11px] font-semibold text-right">{error.quantity}</p>}
      </td>
      <td>
        <input
          aria-label={`Part name, item ${index + 1}`}
          type="text"
          placeholder="Optional"
          value={part.name || ''}
          onChange={(e) => handlePartChange(index, 'name', e.target.value)}
          className="cell-input"
          style={{ textAlign: 'left' }}
        />
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

export default SheetPartRow;
