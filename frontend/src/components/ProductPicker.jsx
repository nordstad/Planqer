/*
  Pick the product a cutlist is for.

  One search box does the work: type a name ("regel", "plywood") or a size
  ("45x95", "15") and pick a result. A result can be a whole type (any size) or
  a type at a size. Whatever the user types can also be kept as their own
  product, so nothing is ever blocked on the catalogue. Species, treatment,
  grade and surface are optional and sit behind one fold; picking a product
  never requires them.

  The selection shape and everything that decides it live in utils/catalogue.js.
*/

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Disclosure from './Disclosure';
import {
  DETAIL_FIELDS, browseTypes, detailLabel, detailOptions, emptySelection, findType,
  freeTextSelection, isEmptySelection, labelIn, loadCatalogue, rememberChoice, searchProducts,
  selectionSummary, sizeLabel, typeSelection,
} from '../utils/catalogue';

const spaced = (n) => Math.round(n).toLocaleString('sv-SE');
const DETAIL_LABEL_KEYS = {
  species: 'productUi.species',
  treatment: 'productUi.treatment',
  grade: 'productUi.grade',
  profile: 'productUi.profile',
};

export const useCatalogue = () => {
  const [state, setState] = useState({ catalogue: null, failed: false });
  useEffect(() => {
    let live = true;
    loadCatalogue()
      .then((catalogue) => live && setState({ catalogue, failed: false }))
      .catch(() => live && setState({ catalogue: null, failed: true }));
    return () => { live = false; };
  }, []);
  return state;
};

/* The product's own sizes and stock, offered but never forced. */
export const StockSuggestions = ({ selection, dims, onUseDimensions, onUseLengths, onUseFormat }) => {
  const { t } = useTranslation();
  const product = selection?.product;
  if (!product) return null;

  const differs = onUseDimensions && dims && (
    product.thickness !== dims.thickness || (product.width != null && product.width !== dims.width)
  );
  const showLengths = onUseLengths && product.lengths?.length > 0;
  const showFormats = onUseFormat && product.formats?.length > 0;
  if (!differs && !showLengths && !showFormats && !product.max_length) return null;

  return (
    <div className="synthetic" style={{ marginTop: '8px', whiteSpace: 'normal' }} data-testid="stock-suggestions">
      {differs && (
        <p style={{ marginBottom: '6px' }}>
          <button type="button" className="btn btn-sm" onClick={() => onUseDimensions(product)}>
            {t('productUi.useSize', { size: sizeLabel(product) })}
          </button>
        </p>
      )}
      {showLengths && (
        <p style={{ marginBottom: '6px' }}>
          {t('productUi.standardLengths', { lengths: product.lengths.map(spaced).join(', ') })}{' '}
          <button type="button" className="btn btn-sm" onClick={() => onUseLengths(product.lengths)}>
            {t('productUi.useLengths')}
          </button>
        </p>
      )}
      {product.max_length && <p style={{ marginBottom: '6px' }}>{t('productUi.stockedUpTo', { max: spaced(product.max_length) })}</p>}
      {showFormats && (
        <p style={{ marginBottom: '6px' }}>
          {t('productUi.standardSheets')}{' '}
          {product.formats.map((format) => (
            <button
              key={`${format.width}x${format.height}`}
              type="button"
              className="btn btn-sm"
              style={{ marginRight: '6px' }}
              onClick={() => onUseFormat(format)}
            >
              {spaced(format.width)} × {spaced(format.height)} mm
            </button>
          ))}
        </p>
      )}
    </div>
  );
};

const DetailFields = ({ catalogue, value, onChange, idBase, label }) => {
  const { t, i18n } = useTranslation();
  const type = findType(catalogue, value.type);
  const applies = new Set(type?.details || []);
  const product = value.product;
  const listFor = (field) => {
    const own = { species: product?.species, treatment: product?.treatments, profile: product?.profiles }[field];
    const keys = own?.length ? own : detailOptions(catalogue, field).map((option) => option.key);
    return value.details[field] && !keys.includes(value.details[field]) ? [value.details[field], ...keys] : keys;
  };

  return (
    <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
      {DETAIL_FIELDS.filter((field) => applies.has(field)).map((field) => (
        <div key={field}>
          <label className="form-label" htmlFor={`${idBase}-${field}`}>{t(DETAIL_LABEL_KEYS[field])}</label>
          {field === 'grade' ? (
            <>
              <input
                id={`${idBase}-grade`}
                className="form-input"
                list={`${idBase}-grades`}
                value={value.details.grade}
                onChange={(e) => onChange('grade', e.target.value)}
                aria-label={`${t('productUi.grade')} — ${label}`}
              />
              <datalist id={`${idBase}-grades`}>
                {(product?.grades || []).map((grade) => <option key={grade} value={grade} />)}
              </datalist>
            </>
          ) : (
            <select
              id={`${idBase}-${field}`}
              className="form-select"
              value={value.details[field]}
              onChange={(e) => onChange(field, e.target.value)}
              aria-label={`${t(DETAIL_LABEL_KEYS[field])} — ${label}`}
            >
              <option value="">{t('productUi.notSpecified')}</option>
              {listFor(field).map((key) => (
                <option key={key} value={key}>{detailLabel(catalogue, field, key, i18n.language)}</option>
              ))}
            </select>
          )}
        </div>
      ))}
      <div style={{ gridColumn: '1 / -1' }}>
        <label className="form-label" htmlFor={`${idBase}-note`}>{t('productUi.note')}</label>
        <input
          id={`${idBase}-note`}
          className="form-input"
          value={value.details.text}
          maxLength={200}
          onChange={(e) => onChange('text', e.target.value)}
          placeholder={t('productUi.notePlaceholder')}
          aria-label={`${t('productUi.note')} — ${label}`}
        />
      </div>
    </div>
  );
};

const ProductPicker = ({
  kind, value, onChange, dims, memoryKey, label,
  onUseDimensions, onUseLengths, onUseFormat,
}) => {
  const { t, i18n } = useTranslation();
  const { catalogue, failed } = useCatalogue();
  const idBase = useId().replace(/:/g, '');
  const listId = `${idBase}-list`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const wrapper = useRef(null);

  const selection = value || emptySelection();
  const text = query.trim();

  const rows = useMemo(() => {
    const found = !catalogue ? [] : text ? searchProducts(catalogue, text, { kind }) : browseTypes(catalogue, kind);
    return text ? [...found, { kind: 'free', score: 0 }] : found;
  }, [catalogue, text, kind]);

  useEffect(() => setActive(0), [text]);

  const commit = (next) => {
    onChange(next);
    if (memoryKey) rememberChoice(memoryKey, next);
  };

  const pick = (row) => {
    if (!row) return;
    commit(row.kind === 'free'
      ? freeTextSelection(kind, text)
      : typeSelection(row.type, row.kind === 'product' ? row.product : null));
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => (index + step + Math.max(rows.length, 1)) % Math.max(rows.length, 1));
    } else if (event.key === 'Enter' && open && rows[active]) {
      event.preventDefault();
      pick(rows[active]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const setDetail = (field, detail) => commit({
    ...selection, details: { ...selection.details, [field]: detail }, suggested: false,
  });

  const rowLabel = (row) => {
    if (row.kind === 'free') return t('productUi.useAsOwn', { text });
    const name = labelIn(row.type.labels, i18n.language);
    return row.kind === 'product' ? `${name} ${sizeLabel(row.product)}` : name;
  };
  const rowHint = (row) => {
    if (row.kind === 'type') return t('productUi.anySize');
    if (row.kind === 'product') return [row.product.grades?.[0], row.product.country].filter(Boolean).join(' · ');
    return '';
  };

  const hasSelection = !isEmptySelection(selection);
  const free = hasSelection && !!selection.text;
  const summary = selectionSummary(selection, i18n.language, dims, catalogue);
  const source = selection.product?.sources?.[0];

  return (
    <div
      ref={wrapper}
      style={{ position: 'relative' }}
      onBlur={(event) => { if (!wrapper.current?.contains(event.relatedTarget)) setOpen(false); }}
    >
      <input
        type="text"
        role="combobox"
        className="form-input"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rows[active] ? `${idBase}-opt-${active}` : undefined}
        autoComplete="off"
        value={query}
        placeholder={t('productUi.searchPlaceholder')}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t('productUi.results')}
          style={{
            position: 'absolute', zIndex: 20, left: 0, right: 0, margin: '4px 0 0', padding: '4px',
            listStyle: 'none', maxHeight: '260px', overflowY: 'auto',
            background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: '10px',
            boxShadow: '0 6px 20px rgba(0,0,0,.12)',
          }}
        >
          {!catalogue && <li className="synthetic" style={{ padding: '8px 10px' }}>{failed ? t('productUi.loadFailed') : t('common.loading')}</li>}
          {catalogue && rows.every((row) => row.kind === 'free') && <li className="synthetic" style={{ padding: '8px 10px' }}>{t('productUi.noResults')}</li>}
          {rows.map((row, index) => (
            <li
              key={row.product?.id || `${row.kind}-${row.type?.key}`}
              id={`${idBase}-opt-${index}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(e) => { e.preventDefault(); pick(row); }}
              onMouseEnter={() => setActive(index)}
              style={{
                display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '8px 10px',
                borderRadius: '8px', cursor: 'pointer', fontSize: '13.5px',
                background: index === active ? 'var(--accent-bg)' : 'transparent',
                fontWeight: row.kind === 'free' ? 600 : 400,
              }}
            >
              <span>{rowLabel(row)}</span>
              <span className="synthetic">{rowHint(row)}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="synthetic" style={{ marginTop: '6px', whiteSpace: 'normal' }} role="status" data-testid="product-summary">
        {hasSelection ? (
          <>
            <strong style={{ color: 'var(--ink)' }}>{summary}</strong>
            {selection.suggested && <span style={{ color: 'var(--accent)', fontWeight: 700 }}> · {t('productUi.suggested')}</span>}
            {source && <> · <a href={source} target="_blank" rel="noreferrer">{t('productUi.source')}</a></>}
          </>
        ) : failed ? t('productUi.loadFailed') : t('productUi.noneChosen')}
      </p>
      {hasSelection && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
          {selection.suggested && (
            <button type="button" className="btn btn-sm" onClick={() => commit({ ...selection, suggested: false })}>
              {t('productUi.confirm')}
            </button>
          )}
          <button type="button" className="btn btn-sm" onClick={() => commit(emptySelection())}>{t('productUi.clear')}</button>
        </div>
      )}

      <StockSuggestions
        selection={selection}
        dims={dims}
        onUseDimensions={onUseDimensions}
        onUseLengths={onUseLengths}
        onUseFormat={onUseFormat}
      />

      {hasSelection && catalogue && !free && (
        <div style={{ marginTop: '8px' }}>
          <Disclosure
            title={t('productUi.details')}
            hint={t('productUi.detailsHint')}
            open={detailsOpen}
            onToggle={() => setDetailsOpen((v) => !v)}
          >
            <DetailFields catalogue={catalogue} value={selection} onChange={setDetail} idBase={idBase} label={label} />
          </Disclosure>
        </div>
      )}
    </div>
  );
};

export default ProductPicker;
