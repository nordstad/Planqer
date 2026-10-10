/*
  "Suggest to Planqer": builds a pre-filled GitHub issue for one product. The
  admin reviews the snippet and chooses to open the issue; nothing is sent from
  here, and no catalogue data leaves the instance on its own.
*/

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCatalogueSuggestion } from '../utils/api';

const CatalogueSuggest = ({ product, onClose }) => {
  const { t } = useTranslation();
  const idBase = useId().replace(/:/g, '');
  const [source, setSource] = useState(product.sources[0] || '');
  const [country, setCountry] = useState(/^[A-Z]{2}$/.test(product.country) ? product.country : '');
  const [suggestion, setSuggestion] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const prepare = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSuggestion(await getCatalogueSuggestion(product.id, { source: source.trim(), country: country.trim() }));
    } catch (err) {
      setSuggestion(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={prepare} className="synthetic" style={{ display: 'grid', gap: '10px', whiteSpace: 'normal', padding: '14px', border: '1px solid var(--rule)', borderRadius: '10px', margin: '12px 0' }} aria-label={t('catalogueAdmin.suggestTitle')}>
      <p>{t('catalogueAdmin.suggestIntro')}</p>
      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '3fr 1fr' }}>
        <div>
          <label className="form-label" htmlFor={`${idBase}-source`}>{t('catalogueAdmin.sourceUrl')}</label>
          <input id={`${idBase}-source`} className="form-input" value={source} placeholder="https://" onChange={(e) => { setSource(e.target.value); setSuggestion(null); }} />
        </div>
        <div>
          <label className="form-label" htmlFor={`${idBase}-country`}>{t('catalogueAdmin.country')}</label>
          <input id={`${idBase}-country`} className="form-input" value={country} maxLength={2} placeholder="SE" onChange={(e) => { setCountry(e.target.value.toUpperCase()); setSuggestion(null); }} />
        </div>
      </div>
      {error && <div className="alert-danger" role="alert">{error}</div>}
      {suggestion && (
        <>
          <pre data-testid="suggestion-snippet" style={{ margin: 0, padding: '10px', overflowX: 'auto', background: 'var(--ground-2)', borderRadius: '8px', fontSize: '12.5px' }}>{suggestion.snippet}</pre>
          <p>
            <a className="btn btn-primary" href={suggestion.url} target="_blank" rel="noopener noreferrer">{t('catalogueAdmin.openIssue')}</a>
            {' '}{t('catalogueAdmin.openIssueHint')}
          </p>
        </>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="submit" className="btn" disabled={busy}>{t('catalogueAdmin.prepareIssue')}</button>
        <button type="button" className="btn" onClick={onClose}>{t('ui.close')}</button>
      </div>
    </form>
  );
};

export default CatalogueSuggest;
