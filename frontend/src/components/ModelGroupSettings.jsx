/*
  One cutlist's stock, kerf and optional prices on the save step.

  Each group gets its own, because they are different purchases: a 45 × 95 mm
  stud and a 15 mm plywood sheet share nothing but the model they came from.
  Prices are never required — only when every length (or the sheet) has one does
  the saved plan carry a cost.
*/

import { useTranslation } from 'react-i18next';
import BoardLengthRow from './BoardLengthRow';
import { Plus } from './icons';
import { SAW_KERF_MIN, SAW_KERF_MAX } from '../utils/validators';
import { StockSuggestions } from './ProductPicker';
import { pricingState } from '../utils/modelGroups';

const PRICING_MESSAGE = {
  board: {
    none: 'modelUi.pricingNone',
    partial: 'modelUi.pricingPartial',
    complete: 'modelUi.pricingComplete',
  },
  sheet: {
    none: 'modelUi.sheetPricingNone',
    complete: 'modelUi.pricingComplete',
  },
};

const ModelGroupSettings = ({ group, config, errors, label, currency, onChange, onApplyAll }) => {
  const { t } = useTranslation();
  const idBase = group.id.replace(/[^a-z0-9]+/gi, '-');
  const state = pricingState(group, config);

  const setBoardRow = (index, patch) => onChange({
    boards: config.boards.map((row, i) => (i === index ? { ...row, ...patch } : row)),
  });
  const addBoard = () => onChange({ boards: [...config.boards, { length: '', price: '' }] });
  const removeBoard = (index) => {
    if (config.boards.length > 1) onChange({ boards: config.boards.filter((_, i) => i !== index) });
  };
  const pasteBoards = (index, e) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\n')) return;
    e.preventDefault();
    const rows = text.split('\n').map((l) => l.trim()).filter(Boolean)
      .map((l) => ({ length: l.split(/[,\t]|\s+/)[0], price: '' }));
    if (!rows.length) return;
    const next = [...config.boards];
    next.splice(index, 1, ...rows);
    onChange({ boards: next });
  };

  return (
    <section style={{ marginBottom: '30px' }} aria-label={label} data-testid={`group-settings-${idBase}`}>
      <div className="section-rule">
        <h2 className="section-title">{label}</h2>
        <span className="folio">{group.kind === 'board' ? t('legacy.stockAvailable') : t('legacy.sheetFrom')}</span>
      </div>

      {group.kind === 'board' ? (
        <>
          <div className="stock-table-wrap" style={{ marginTop: '10px' }}>
            <table className="cat-table">
              <thead>
                <tr>
                  <th>{t('workflow.lengthMm')}</th>
                  <th>{t('legacy.metres')}</th>
                  <th>{t('ui.stockPrice')}</th>
                  <th aria-label={t('common.remove')} />
                </tr>
              </thead>
              <tbody>
                {config.boards.map((row, index) => (
                  <BoardLengthRow
                    key={index}
                    board={row.length}
                    index={index}
                    handleBoardChange={(i, value) => setBoardRow(i, { length: value })}
                    handleBoardsPaste={pasteBoards}
                    removeBoard={removeBoard}
                    error={errors.boards[index]}
                    canRemove={config.boards.length > 1}
                    inPlan={null}
                    currency={currency}
                    price={row.price}
                    handlePriceChange={(_, value) => setBoardRow(index, { price: value })}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn" style={{ marginTop: '12px' }} onClick={addBoard}>
            <Plus /> {t('workflow.addStockLength')}
          </button>
          <StockSuggestions
            selection={config.product}
            onUseLengths={(lengths) => onChange({ boards: lengths.map((length) => ({ length: String(length), price: '' })) })}
          />

          <div className="flex items-center gap-2" style={{ marginTop: '18px' }}>
            <label className="form-label" htmlFor={`${idBase}-kerf`} style={{ marginBottom: 0 }}>{t('legacy.sawBlade')}</label>
            <input
              id={`${idBase}-kerf`}
              type="number"
              min={SAW_KERF_MIN}
              max={SAW_KERF_MAX}
              step="0.1"
              value={config.kerf}
              onChange={(e) => onChange({ kerf: e.target.value })}
              className={`form-input kerf-input ${errors.kerf ? 'form-input-error' : ''}`}
              style={{ width: '78px' }}
            />
            <span style={{ fontSize: '13.5px', color: 'var(--ink-3)', fontWeight: 600 }}>mm</span>
          </div>
          {errors.kerf && <p className="text-danger text-[12.5px] font-semibold" style={{ marginTop: '5px' }}>{errors.kerf}</p>}
        </>
      ) : (
        <table className="cat-table" style={{ marginTop: '10px' }}>
          <tbody>
            <tr>
              <td style={{ textAlign: 'left' }}>{t('legacy.width')}</td>
              <td>
                <input
                  type="number" step="0.1" min="100" max="10000"
                  value={config.sheetWidth}
                  onChange={(e) => onChange({ sheetWidth: e.target.value })}
                  className={`cell-input ${errors.width ? 'is-error' : ''}`}
                  aria-label={`${t('ui.sheetWidthAria')} — ${label}`}
                />
              </td>
              <td style={{ width: '40px', color: 'var(--ink-3)' }}>mm</td>
            </tr>
            <tr>
              <td style={{ textAlign: 'left' }}>{t('legacy.height')}</td>
              <td>
                <input
                  type="number" step="0.1" min="100" max="10000"
                  value={config.sheetHeight}
                  onChange={(e) => onChange({ sheetHeight: e.target.value })}
                  className={`cell-input ${errors.height ? 'is-error' : ''}`}
                  aria-label={`${t('ui.sheetHeightAria')} — ${label}`}
                />
              </td>
              <td style={{ color: 'var(--ink-3)' }}>mm</td>
            </tr>
            <tr>
              <td style={{ textAlign: 'left' }}>{t('legacy.kerf')}</td>
              <td>
                <input
                  type="number" step="0.1" min={SAW_KERF_MIN} max="50"
                  value={config.kerf}
                  onChange={(e) => onChange({ kerf: e.target.value })}
                  className={`cell-input ${errors.kerf ? 'is-error' : ''}`}
                  aria-label={`${t('modelUi.sheetKerfAria')} — ${label}`}
                />
              </td>
              <td style={{ color: 'var(--ink-3)' }}>mm</td>
            </tr>
            <tr>
              <td style={{ textAlign: 'left' }}>{t('ui.pricePerSheet', { currency })}</td>
              <td>
                <input
                  type="number" min="0" step="0.01"
                  value={config.sheetPrice}
                  onChange={(e) => onChange({ sheetPrice: e.target.value })}
                  className="cell-input"
                  placeholder={t('ui.optional')}
                  aria-label={`${t('ui.pricePerSheet', { currency })} — ${label}`}
                />
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      )}
      {group.kind === 'sheet' && (
        <StockSuggestions
          selection={config.product}
          onUseFormat={(format) => onChange({ sheetWidth: String(format.width), sheetHeight: String(format.height) })}
        />
      )}
      {group.kind === 'sheet' && (errors.width || errors.height || errors.kerf) && (
        <p className="text-danger text-[12.5px] font-semibold" style={{ marginTop: '10px' }}>
          {errors.width || errors.height || errors.kerf}
        </p>
      )}

      <p className="synthetic" style={{ marginTop: '12px' }} role="status" data-testid={`pricing-state-${idBase}`}>
        {t(PRICING_MESSAGE[group.kind][state])}
      </p>

      {onApplyAll && (
        <button type="button" className="btn btn-sm" style={{ marginTop: '10px' }} onClick={onApplyAll}>
          {t(group.kind === 'board' ? 'modelUi.applyAllBoards' : 'modelUi.applyAllSheets')}
        </button>
      )}
    </section>
  );
};

export default ModelGroupSettings;
