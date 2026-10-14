/*
  One line item in the REQUIRED PARTS table. The ruled cell is the field —
  no pill, no box. Item numbers are catalog line numbers, not decoration.
*/
import { Strike } from './icons';
import { useTranslation } from 'react-i18next';
import { translateWithFallback } from '../i18n/translate';
import { MIN_PART_LENGTH, MAX_PART_QUANTITY } from '../utils/validators';

const PartInputRow = ({ part, index, handlePartChange, handlePartsPaste, removePart, error, canRemove }) => {
  const { t } = useTranslation();
  const text = (key, vars) => translateWithFallback(t, key, vars);
  const messages = [...new Set(Object.values(error || {}))];
  const errorId = messages.length > 0 ? `board-part-${index}-error` : undefined;

  return [
    <tr key="part" className={errorId ? 'is-error-row' : undefined}>
      <td>{String(index + 1).padStart(2, '0')}</td>
      <td className="board-part-length">
        <input
          id={`length-${index}`}
          aria-label={text('ui.partLengthAria', { item: index + 1 })}
          type="number"
          step="1"
          value={part.length}
          onChange={(e) => handlePartChange(index, 'length', e.target.value)}
          onPaste={(e) => handlePartsPaste(index, e)}
          className={`cell-input ${part.length === '' ? 'is-required-empty' : ''} ${error?.length ? 'is-error' : ''}`}
          aria-invalid={!!error?.length}
          aria-describedby={error?.length ? errorId : undefined}
          required
          min={MIN_PART_LENGTH}
        />
      </td>
      <td>
        <input
          id={`quantity-${index}`}
          aria-label={text('ui.quantityAria', { item: index + 1 })}
          type="number"
          step="1"
          value={part.quantity}
          onChange={(e) => handlePartChange(index, 'quantity', e.target.value)}
          className={`cell-input ${part.quantity === '' ? 'is-required-empty' : ''} ${error?.quantity ? 'is-error' : ''}`}
          aria-invalid={!!error?.quantity}
          aria-describedby={error?.quantity ? errorId : undefined}
          required
          min="1"
          max={MAX_PART_QUANTITY}
        />
      </td>
      <td>
        <input
          aria-label={`${text('workflow.name')}, ${text('workflow.item').toLowerCase()} ${index + 1}`}
          type="text"
          placeholder={text('ui.optional')}
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
            aria-label={text('ui.removePartAria', { item: index + 1 })}
            title={text('ui.strikeLine')}
          >
            <Strike />
          </button>
        )}
      </td>
    </tr>,
    errorId ? (
      <tr key="error" className="part-error-row">
        <td />
        <td colSpan="4">
          <p id={errorId} role="alert" className="text-danger text-[11px] font-semibold">{messages.join(' · ')}</p>
        </td>
      </tr>
    ) : null,
  ];
};

export default PartInputRow;
