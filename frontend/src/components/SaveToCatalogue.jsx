/*
  For admins: keep a product someone typed in their own words as a real entry
  in this instance's catalogue, so it shows up in search for everyone from then
  on. The words become the entry's note; type and size come from the form.
*/

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createCatalogueEntry } from '../utils/api';
import { FREE_TEXT_TYPE, labelIn, typesOfKind } from '../utils/catalogue';

const finite = (value) => (Number.isFinite(value) ? String(value) : '');

const SaveToCatalogue = ({ catalogue, kind, dims, text, onSaved }) => {
  const { t, i18n } = useTranslation();
  const idBase = useId().replace(/:/g, '');
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('');
  const [thickness, setThickness] = useState(finite(dims?.thickness));
  const [width, setWidth] = useState(finite(dims?.width));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const board = kind === 'board';

  if (!open) {
    return (
      <button type="button" className="btn btn-sm" style={{ marginTop: '6px' }} onClick={() => setOpen(true)}>
        {t('catalogueAdmin.saveLocal')}
      </button>
    );
  }

  const save = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const size = parseFloat(thickness.replace(',', '.'));
    const across = parseFloat(width.replace(',', '.'));
    if (!type || !(size > 0) || (board && !(across > 0))) {
      setError(t('catalogueAdmin.problem.saveLocal'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await createCatalogueEntry({
        type, thickness: size, width: board ? across : null, note: text.slice(0, 200),
      });
      onSaved(created.product);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const types = typesOfKind(catalogue, kind).filter((entry) => entry.key !== FREE_TEXT_TYPE[kind]);
  return (
    <div className="synthetic" role="group" aria-label={t('catalogueAdmin.saveLocal')} style={{ marginTop: '8px', display: 'grid', gap: '8px', whiteSpace: 'normal' }}>
      <p>{t('catalogueAdmin.saveLocalHint', { text })}</p>
      <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
        <div>
          <label className="form-label" htmlFor={`${idBase}-type`}>{t('catalogueAdmin.type')}</label>
          <select id={`${idBase}-type`} className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t('catalogueAdmin.chooseType')}</option>
            {types.map((entry) => <option key={entry.key} value={entry.key}>{labelIn(entry.labels, i18n.language)}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor={`${idBase}-thickness`}>{t('catalogueAdmin.thickness')}</label>
          <input id={`${idBase}-thickness`} className="form-input" inputMode="decimal" value={thickness} onChange={(e) => setThickness(e.target.value)} />
        </div>
        {board && (
          <div>
            <label className="form-label" htmlFor={`${idBase}-width`}>{t('catalogueAdmin.width')}</label>
            <input id={`${idBase}-width`} className="form-input" inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} />
          </div>
        )}
      </div>
      {error && <div className="alert-danger" role="alert">{error}</div>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={save}>{t('catalogueAdmin.save')}</button>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(false)}>{t('ui.cancel')}</button>
      </div>
    </div>
  );
};

export default SaveToCatalogue;
