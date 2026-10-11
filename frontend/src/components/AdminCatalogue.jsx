/*
  The Catalogue tab of the admin page: search the product catalogue this
  instance serves, add what's missing, adjust or hide what doesn't fit, and
  restore anything. Built-in data files are never changed; every edit here is
  stored in this instance's database.
*/

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from './ConfirmDialog';
import CatalogueEntryForm from './CatalogueEntryForm';
import CatalogueSuggest from './CatalogueSuggest';
import Loader from './Loader';
import {
  createCatalogueEntry, getAdminCatalogue, hideCatalogueEntry, resetCatalogueEntry,
  restoreCatalogueEntry, updateCatalogueEntry,
} from '../utils/api';
import { loadCatalogue, resetCatalogueCache } from '../utils/catalogue';
import {
  LIST_FILTERS, filterItems, formFromProduct, itemName, itemState, summarizeItem,
} from '../utils/catalogueAdmin';

const SMALL = { padding: '5px 10px', minHeight: 0 };
// The cell holding a row's edit or suggest form: undo the table's first-column type.
const PANEL_CELL = { textAlign: 'left', fontSize: '14px', fontWeight: 400, letterSpacing: 'normal', color: 'var(--ink)', paddingTop: 0 };

const AdminCatalogue = () => {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState(null);
  const [catalogue, setCatalogue] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [panel, setPanel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [pendingReset, setPendingReset] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      resetCatalogueCache();
      const [list, vocabulary] = await Promise.all([getAdminCatalogue(), loadCatalogue()]);
      setItems(list);
      setCatalogue(vocabulary);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const shown = useMemo(
    () => (items ? filterItems(items, { query, filter, catalogue, language: i18n.language }) : []),
    [items, query, filter, catalogue, i18n.language],
  );

  const run = async (action, { inForm = false } = {}) => {
    setBusy(true);
    setError(null);
    setFormError(null);
    try {
      await action();
      setPanel(null);
      await refresh();
    } catch (err) {
      if (inForm) setFormError(err.message);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!items && !error) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}><Loader /></div>;
  }

  const countryName = catalogue?.country_name || t('catalogueAdmin.genericCountry');
  const isLocalOrModified = (item) => item.origin !== 'builtin';
  // Same type and size as a built-in on show: a local entry an upgrade made redundant.
  const sizeKey = (product) => product.id.split(':').slice(1).join(':');
  const shippedSizes = new Set((items || []).filter((item) => item.origin !== 'local' && !item.hidden).map((item) => sizeKey(item.product)));

  return (
    <div>
      {error && <div className="alert-danger" role="alert" style={{ marginBottom: '16px' }}>{error}</div>}
      <p className="synthetic" style={{ whiteSpace: 'normal', marginBottom: '12px' }}>
        {t('catalogueAdmin.intro', { country: countryName })}
      </p>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'end' }}>
        <div style={{ flex: '1 1 240px' }}>
          <label className="form-label" htmlFor="catalogue-search">{t('catalogueAdmin.search')}</label>
          <input id="catalogue-search" type="search" className="form-input" value={query} placeholder={t('productUi.searchPlaceholder')} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div>
          <label className="form-label" htmlFor="catalogue-filter">{t('catalogueAdmin.show')}</label>
          <select id="catalogue-filter" className="form-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {LIST_FILTERS.map((key) => <option key={key} value={key}>{t(`catalogueAdmin.filter.${key}`)}</option>)}
          </select>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => { setFormError(null); setPanel({ mode: 'add' }); }}>{t('catalogueAdmin.addTitle')}</button>
      </div>

      {panel?.mode === 'add' && catalogue && (
        <CatalogueEntryForm
          catalogue={catalogue}
          creating
          busy={busy}
          error={formError}
          onSubmit={(payload) => run(() => createCatalogueEntry(payload), { inForm: true })}
          onCancel={() => setPanel(null)}
        />
      )}

      <p className="synthetic" role="status" style={{ margin: '12px 0 6px' }}>
        {t('catalogueAdmin.count', { shown: shown.length, total: items?.length ?? 0 })}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table className="cat-table">
          <thead>
            <tr>
              <th>{t('catalogueAdmin.product')}</th>
              <th style={{ textAlign: 'left' }}>{t('ui.status')}</th>
              <th style={{ textAlign: 'left' }}>{t('catalogueAdmin.summary')}</th>
              <th aria-label={t('ui.actions')} />
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 200).map((item) => {
              const { product } = item;
              const open = panel && panel.mode !== 'add' && panel.item.product.id === product.id ? panel.mode : null;
              return (
                <Fragment key={product.id}>
                  <tr style={item.hidden ? { opacity: 0.6 } : undefined}>
                    <td style={{ textAlign: 'left', color: 'var(--ink)', fontWeight: 700 }}>
                      {itemName(item, catalogue, i18n.language)}
                      {item.origin === 'local' && shippedSizes.has(sizeKey(product)) && (
                        <span className="block" style={{ marginTop: '3px', fontWeight: 500, color: 'var(--accent)' }}>{t('catalogueAdmin.builtInNow')}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'left' }}>
                      <span className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                        <span className={`status-badge status-badge-${itemState(item)}`}>{t(`catalogueAdmin.state.${itemState(item)}`)}</span>
                        {item.hidden && item.origin !== 'builtin' && (
                          <span className={`status-badge status-badge-${item.origin}`}>{t(`catalogueAdmin.state.${item.origin}`)}</span>
                        )}
                      </span>
                    </td>
                    <td style={{ textAlign: 'left' }}>{summarizeItem(product)}</td>
                    <td style={{ minWidth: '320px' }}>
                      <span className="flex justify-end gap-2" style={{ flexWrap: 'wrap' }}>
                        <button type="button" className="btn" style={SMALL} disabled={busy} onClick={() => { setFormError(null); setPanel({ mode: 'edit', item }); }}>{t('catalogueAdmin.edit')}</button>
                        {item.hidden ? (
                          <button type="button" className="btn" style={SMALL} disabled={busy} onClick={() => run(() => restoreCatalogueEntry(product.id))}>{t('catalogueAdmin.restore')}</button>
                        ) : (
                          <button type="button" className="btn" style={SMALL} disabled={busy} onClick={() => run(() => hideCatalogueEntry(product.id))}>{t('catalogueAdmin.hide')}</button>
                        )}
                        {isLocalOrModified(item) && (
                          <button type="button" className="btn btn-outline-danger" style={SMALL} disabled={busy} onClick={() => setPendingReset(item)}>
                            {item.origin === 'local' ? t('ui.delete') : t('catalogueAdmin.revert')}
                          </button>
                        )}
                        {isLocalOrModified(item) && (
                          <button type="button" className="btn" style={SMALL} onClick={() => setPanel({ mode: 'suggest', item })}>{t('catalogueAdmin.suggest')}</button>
                        )}
                      </span>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={4} style={PANEL_CELL}>
                        {open === 'edit' && catalogue && (
                          <CatalogueEntryForm
                            catalogue={catalogue}
                            initial={formFromProduct(product)}
                            busy={busy}
                            error={formError}
                            onSubmit={(payload) => run(() => updateCatalogueEntry(product.id, payload), { inForm: true })}
                            onCancel={() => setPanel(null)}
                          />
                        )}
                        {open === 'suggest' && <CatalogueSuggest product={product} onClose={() => setPanel(null)} />}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {shown.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'left', color: 'var(--ink-3)' }}>{t('catalogueAdmin.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {shown.length > 200 && <p className="synthetic">{t('catalogueAdmin.narrow')}</p>}

      <ConfirmDialog
        open={!!pendingReset}
        title={pendingReset?.origin === 'local' ? t('ui.delete') : t('catalogueAdmin.revert')}
        message={pendingReset && t(pendingReset.origin === 'local' ? 'catalogueAdmin.deleteConfirm' : 'catalogueAdmin.revertConfirm', { name: itemName(pendingReset, catalogue, i18n.language) })}
        confirmLabel={pendingReset?.origin === 'local' ? t('ui.delete') : t('catalogueAdmin.revert')}
        onConfirm={() => { const { product } = pendingReset; setPendingReset(null); run(() => resetCatalogueEntry(product.id)); }}
        onCancel={() => setPendingReset(null)}
      />
    </div>
  );
};

export default AdminCatalogue;
