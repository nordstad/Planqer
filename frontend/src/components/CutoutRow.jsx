/*
  One opening in the surface — a window, door, socket, or extractor hood.
  Mirrors SheetPartRow's ruled-cell grammar: x/y share one "At" cell the same
  way width/height share one "Size" cell there, so the column count reads the
  same way (At/Size/Label/Remove). Unlike SheetPartRow, each cell here holds
  two *different* kinds of value (a position, a size), so every input gets a
  tiny "x"/"y"/"w"/"h" tag above it — the comma and "×" alone don't say which
  number is which. Errors run the full width of the row below the inputs
  instead of squeezed into a 128px cell, so "Runs past the right edge of the
  surface" doesn't wrap into the next column. Only the single most pressing
  message shows at a time — same convention as the Surface and Tile sections
  above (`widthError || heightError`) — rather than every failing field
  concatenated, which on a freshly added blank row read as four stacked
  complaints instead of one. The two-input groups are right-justified
  (`justify-content: flex-end`) to line up under their right-aligned "Position
  mm" / "Size mm" headers — a plain flex row defaults to hugging the left of
  the cell instead.

  A freshly added row starts with every field required and empty. So a row
  this blank ("pristine") stays quiet until either the person types something
  into it or tries to submit the surface (`attempted`), matching how the plan
  name field waits for `saveAttempted` before complaining in TileOptimizer.
  The numeric fields carry no placeholder text — people read a placeholder
  number sitting in an empty required field as data already entered, not a
  hint, especially once the row starts failing validation right beside it.
*/
import { Strike } from './icons';
import { useTranslation } from 'react-i18next';

const CutoutField = ({ tag, error, ...inputProps }) => (
  <label className="cutout-field">
    <span className="cutout-field-tag">{tag}</span>
    <input {...inputProps} className={`cell-input ${error ? 'is-error' : ''}`} />
  </label>
);

const CutoutRow = ({ cutout, index, handleCutoutChange, removeCutout, error, attempted }) => {
  const isPristine = !cutout.x && !cutout.y && !cutout.width && !cutout.height;
  const { t } = useTranslation();
  const showErrors = attempted || !isPristine;
  const fieldError = (key) => (showErrors ? error?.[key] : undefined);
  const rowError = showErrors && error && (error.x || error.y || error.width || error.height);

  return (
    <>
      <tr className={rowError ? 'is-error-row' : undefined}>
        <td>{String(index + 1).padStart(2, '0')}</td>
        <td style={{ width: '156px' }}>
          <div className="flex items-end justify-end gap-1">
            <CutoutField
              tag="x"
              aria-label={t('ui.cutoutPositionAria', { axis: 'x', item: index + 1 })}
              type="number"
              step="0.1"
              value={cutout.x}
              onChange={(e) => handleCutoutChange(index, 'x', e.target.value)}
              style={{ width: '62px' }}
              min="0"
              error={fieldError('x')}
            />
            <CutoutField
              tag="y"
              aria-label={t('ui.cutoutPositionAria', { axis: 'y', item: index + 1 })}
              type="number"
              step="0.1"
              value={cutout.y}
              onChange={(e) => handleCutoutChange(index, 'y', e.target.value)}
              style={{ width: '62px' }}
              min="0"
              error={fieldError('y')}
            />
          </div>
        </td>
        <td style={{ width: '156px' }}>
          <div className="flex items-end justify-end gap-1">
            <CutoutField
              tag="w"
              aria-label={t('ui.cutoutSizeAria', { axis: 'width', item: index + 1 })}
              type="number"
              step="0.1"
              value={cutout.width}
              onChange={(e) => handleCutoutChange(index, 'width', e.target.value)}
              style={{ width: '62px' }}
              min="0.1"
              error={fieldError('width')}
            />
            <CutoutField
              tag="h"
              aria-label={t('ui.cutoutSizeAria', { axis: 'height', item: index + 1 })}
              type="number"
              step="0.1"
              value={cutout.height}
              onChange={(e) => handleCutoutChange(index, 'height', e.target.value)}
              style={{ width: '62px' }}
              min="0.1"
              error={fieldError('height')}
            />
          </div>
        </td>
        <td>
          <input
            aria-label={t('ui.cutoutLabelAria', { item: index + 1 })}
            type="text"
            placeholder={t('ui.window')}
            value={cutout.label || ''}
            onChange={(e) => handleCutoutChange(index, 'label', e.target.value)}
            className="cell-input"
            style={{ textAlign: 'left' }}
          />
        </td>
        <td style={{ width: '34px' }}>
          <button
            type="button"
            onClick={() => removeCutout(index)}
            className="cell-strike"
            aria-label={t('ui.removeCutoutAria', { item: index + 1 })}
            title={t('ui.strikeLine')}
          >
            <Strike />
          </button>
        </td>
      </tr>
      {rowError && (
        <tr className="cutout-error-row">
          <td />
          <td colSpan={4}>
            <p className="text-danger text-[11px] font-semibold" style={{ textAlign: 'left' }} role="alert">
              {rowError}
            </p>
          </td>
        </tr>
      )}
    </>
  );
};

export default CutoutRow;
