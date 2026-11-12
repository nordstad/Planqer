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
import FormField, { SectionCard, SectionStatus } from './FormField';

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

const PRICING_SHORT = { none: 'boardUi.noPrices', partial: 'modelForm.somePrices', complete: 'modelForm.priced' };

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

  const hasErrors = errors.kerf || errors.width || errors.height || errors.boards?.some(Boolean);

  return (
    <SectionCard
      id={`group-${idBase}`}
      title={label}
      summary={group.kind === 'board' ? t('legacy.stockAvailable') : t('legacy.sheetFrom')}
      status={hasErrors ? <SectionStatus error={t('formUi.checkValues')} />
        : state === 'complete' ? <SectionStatus done={t(PRICING_SHORT[state])} />
          : <SectionStatus todo={t(PRICING_SHORT[state])} />}
      className="model-group-settings"
    >
      <div data-testid={`group-settings-${idBase}`}>
        {group.kind === 'board' ? (
          <>
            <div className="stock-table-wrap">
              <table className="cat-table">
                <thead>
                  <tr>
                    <th>{t('workflow.lengthMm')}<span className="req-mark" aria-hidden="true" /></th>
                    <th>{t('legacy.metres')}</th>
                    <th>{t('ui.stockPrice')}{' '}<span className="opt-mark">{t('formUi.optionalMark')}</span></th>
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
            <button type="button" className="btn-primary" style={{ marginTop: '14px' }} onClick={addBoard}>
              <Plus /> {t('workflow.addStockLength')}
            </button>
            <StockSuggestions
              selection={config.product}
              onUseLengths={(lengths) => onChange({ boards: lengths.map((length) => ({ length: String(length), price: '' })) })}
            />
            <div style={{ marginTop: '18px' }}>
              <FormField label={t('legacy.sawBlade')} unit="mm" required>
                <input
                  id={`${idBase}-kerf`}
                  type="number"
                  min={SAW_KERF_MIN}
                  max={SAW_KERF_MAX}
                  step="0.1"
                  value={config.kerf}
                  onChange={(e) => onChange({ kerf: e.target.value })}
                  className={`form-input kerf-input dimension-input ${errors.kerf ? 'form-input-error' : ''}`}
                />
              </FormField>
              {errors.kerf && <p className="text-danger text-[12.5px] font-semibold" style={{ marginTop: '5px' }}>{errors.kerf}</p>}
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
              <FormField label={t('legacy.width')} unit="mm" required>
                <input
                  type="number" step="0.1" min="100" max="10000"
                  value={config.sheetWidth}
                  onChange={(e) => onChange({ sheetWidth: e.target.value })}
                  className={`form-input dimension-input ${errors.width ? 'form-input-error' : ''}`}
                  aria-label={`${t('ui.sheetWidthAria')} — ${label}`}
                />
              </FormField>
              <FormField label={t('legacy.height')} unit="mm" required>
                <input
                  type="number" step="0.1" min="100" max="10000"
                  value={config.sheetHeight}
                  onChange={(e) => onChange({ sheetHeight: e.target.value })}
                  className={`form-input dimension-input ${errors.height ? 'form-input-error' : ''}`}
                  aria-label={`${t('ui.sheetHeightAria')} — ${label}`}
                />
              </FormField>
              <FormField label={t('legacy.kerf')} unit="mm" required>
                <input
                  type="number" step="0.1" min={SAW_KERF_MIN} max="50"
                  value={config.kerf}
                  onChange={(e) => onChange({ kerf: e.target.value })}
                  className={`form-input dimension-input ${errors.kerf ? 'form-input-error' : ''}`}
                  aria-label={`${t('modelUi.sheetKerfAria')} — ${label}`}
                />
              </FormField>
              <FormField label={t('ui.pricePerSheet', { currency })} optional>
                <input
                  type="number" min="0" step="0.01"
                  value={config.sheetPrice}
                  onChange={(e) => onChange({ sheetPrice: e.target.value })}
                  className="form-input dimension-input"
                  aria-label={`${t('ui.pricePerSheet', { currency })} — ${label}`}
                />
              </FormField>
            </div>
            <StockSuggestions
              selection={config.product}
              onUseFormat={(format) => onChange({ sheetWidth: String(format.width), sheetHeight: String(format.height) })}
            />
            {(errors.width || errors.height || errors.kerf) && (
              <p className="text-danger text-[12.5px] font-semibold" style={{ marginTop: '10px' }}>
                {errors.width || errors.height || errors.kerf}
              </p>
            )}
          </>
        )}

        <p className="synthetic" style={{ marginTop: '12px' }} role="status" data-testid={`pricing-state-${idBase}`}>
          {t(PRICING_MESSAGE[group.kind][state])}
        </p>

        {onApplyAll && (
          <button type="button" className="btn-text" style={{ marginTop: '6px' }} onClick={onApplyAll}>
            {t(group.kind === 'board' ? 'modelUi.applyAllBoards' : 'modelUi.applyAllSheets')}
          </button>
        )}
      </div>
    </SectionCard>
  );
};

export default ModelGroupSettings;
