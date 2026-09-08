/*
  One opening in the surface — a window, door, socket, or extractor hood.
  Mirrors SheetPartRow's ruled-cell grammar: x/y share one "At" cell the same
  way width/height share one "Size" cell there, so the column count reads the
  same way (At/Size/Label/Remove).
*/
import { Strike } from './icons';

const CutoutRow = ({ cutout, index, handleCutoutChange, removeCutout, error }) => {
  return (
    <tr>
      <td>{String(index + 1).padStart(2, '0')}</td>
      <td style={{ width: '128px' }}>
        <div className="flex items-center gap-1">
          <input
            aria-label={`Cutout x position in millimetres, item ${index + 1}`}
            type="number"
            step="0.1"
            placeholder="1000"
            value={cutout.x}
            onChange={(e) => handleCutoutChange(index, 'x', e.target.value)}
            className={`cell-input ${error?.x ? 'is-error' : ''}`}
            style={{ width: '56px' }}
            min="0"
          />
          <span style={{ color: 'var(--ink-3)' }}>,</span>
          <input
            aria-label={`Cutout y position in millimetres, item ${index + 1}`}
            type="number"
            step="0.1"
            placeholder="400"
            value={cutout.y}
            onChange={(e) => handleCutoutChange(index, 'y', e.target.value)}
            className={`cell-input ${error?.y ? 'is-error' : ''}`}
            style={{ width: '56px' }}
            min="0"
          />
        </div>
        {(error?.x || error?.y) && (
          <p className="text-danger text-[11px] font-semibold text-right">{error.x || error.y}</p>
        )}
      </td>
      <td style={{ width: '128px' }}>
        <div className="flex items-center gap-1">
          <input
            aria-label={`Cutout width in millimetres, item ${index + 1}`}
            type="number"
            step="0.1"
            placeholder="300"
            value={cutout.width}
            onChange={(e) => handleCutoutChange(index, 'width', e.target.value)}
            className={`cell-input ${error?.width ? 'is-error' : ''}`}
            style={{ width: '56px' }}
            min="0.1"
          />
          <span style={{ color: 'var(--ink-3)' }}>×</span>
          <input
            aria-label={`Cutout height in millimetres, item ${index + 1}`}
            type="number"
            step="0.1"
            placeholder="300"
            value={cutout.height}
            onChange={(e) => handleCutoutChange(index, 'height', e.target.value)}
            className={`cell-input ${error?.height ? 'is-error' : ''}`}
            style={{ width: '56px' }}
            min="0.1"
          />
        </div>
        {(error?.width || error?.height) && (
          <p className="text-danger text-[11px] font-semibold text-right">{error.width || error.height}</p>
        )}
      </td>
      <td>
        <input
          aria-label={`Cutout label, item ${index + 1}`}
          type="text"
          placeholder="Window"
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
          aria-label={`Remove cutout, item ${index + 1}`}
          title="Strike this line"
        >
          <Strike />
        </button>
      </td>
    </tr>
  );
};

export default CutoutRow;
