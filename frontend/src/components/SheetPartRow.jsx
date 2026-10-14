/*
  One line item in the PARTS TO CUT table. Mirrors PartInputRow's ruled-cell
  grammar. Width and height share one "Size" cell — a genuine 2D-vs-1D
  difference from board parts, not a style choice — so the column count
  matches PartInputRow's (Item/Size/Qty/Name/Remove = 5, alongside
  Item/Length/Qty/Name/Remove) and Name keeps a real column width.
*/
import { Strike } from './icons';
import { useTranslation } from 'react-i18next';

const SheetPartRow = ({ part, index, handlePartChange, removePart, error, canRemove }) => {
  const { t } = useTranslation();
  const messages = [...new Set(Object.values(error || {}))];
  const errorId = messages.length > 0 ? `sheet-part-${part.id}-error` : undefined;
  return [
    <tr key="part" className={errorId ? 'is-error-row' : undefined}>
      <td>{String(index + 1).padStart(2, '0')}</td>
      <td className="sheet-part-size">
        <div className="sheet-part-dimensions">
          <input
            aria-label={t('ui.partLengthAria', { item: index + 1 })}
            type="number"
            step="1"
            value={part.width}
            onChange={(e) => handlePartChange(index, 'width', e.target.value)}
            className={`cell-input sheet-part-dimension ${error?.width ? 'is-error' : ''}`}
            aria-invalid={!!error?.width}
            aria-describedby={error?.width ? errorId : undefined}
            required
            min="1"
          />
          <span style={{ color: 'var(--ink-3)' }}>×</span>
          <input
            aria-label={t('ui.sheetHeightAria')}
            type="number"
            step="1"
            value={part.height}
            onChange={(e) => handlePartChange(index, 'height', e.target.value)}
            className={`cell-input sheet-part-dimension ${error?.height ? 'is-error' : ''}`}
            aria-invalid={!!error?.height}
            aria-describedby={error?.height ? errorId : undefined}
            required
            min="1"
          />
        </div>
      </td>
      <td>
        <input
          aria-label={t('ui.quantityAria', { item: index + 1 })}
          type="number"
          step="1"
          value={part.quantity}
          onChange={(e) => handlePartChange(index, 'quantity', e.target.value)}
          className={`cell-input ${error?.quantity ? 'is-error' : ''}`}
          aria-invalid={!!error?.quantity}
          aria-describedby={error?.quantity ? errorId : undefined}
          required
          min="1"
        />
      </td>
      <td>
        <input
           aria-label={`${t('workflow.name')}, ${t('workflow.item').toLowerCase()} ${index + 1}`}
          type="text"
           placeholder={t('ui.optional')}
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
             aria-label={t('ui.removePartAria', { item: index + 1 })}
             title={t('ui.strikeLine')}
          >
            <Strike />
          </button>
        )}
      </td>
    </tr>,
    errorId ? (
      <tr key="error" className="sheet-part-error-row">
        <td />
        <td colSpan="4">
          <p id={errorId} role="alert" className="text-danger text-[11px] font-semibold">{messages.join(' · ')}</p>
        </td>
      </tr>
    ) : null,
  ];
};

export default SheetPartRow;
