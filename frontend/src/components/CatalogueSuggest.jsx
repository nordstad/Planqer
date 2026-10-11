/*
  "Suggest to Planqer": builds a pre-filled GitHub issue for one product. The
  admin reviews the snippet and chooses to open the issue; nothing is sent from
  here, and no catalogue data leaves the instance on its own.

  The issue is prepared as soon as there is an https source to cite (on open,
  for a product that has one), so the form has one action: open it on GitHub.
*/

import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCatalogueSuggestion } from '../utils/api';
import { useDebounce } from '../hooks/useDebounce';

const CatalogueSuggest = ({ product, onClose }) => {
  const { t } = useTranslation();
  const idBase = useId().replace(/:/g, '');
  const [source, setSource] = useState(product.sources[0] || '');
  const [country, setCountry] = useState(/^[A-Z]{2}$/.test(product.country) ? product.country : '');
  const [suggestion, setSuggestion] = useState(null);
  const [error, setError] = useState(null);
  const [opened, setOpened] = useState(false);
  // The issue is checked against its source, so there's nothing to prepare without one.
  const sourceOk = /^https:\/\/\S+$/.test(source.trim());
  const wanted = useDebounce(sourceOk ? `${source.trim()}\n${country.trim()}` : null, 400);

  useEffect(() => {
    if (!wanted) return undefined;
    let current = true;
    const [cite, code] = wanted.split('\n');
    setError(null);
    getCatalogueSuggestion(product.id, { source: cite, country: code })
      .then((result) => { if (current) setSuggestion(result); })
      .catch((err) => { if (current) setError(err.message); });
    return () => { current = false; };
  }, [wanted, product.id]);

  const changed = () => {
    setSuggestion(null);
    setOpened(false);
  };

  return (
    <form onSubmit={(e) => e.preventDefault()} className="synthetic" style={{ display: 'grid', gap: '10px', whiteSpace: 'normal', padding: '14px', border: '1px solid var(--rule)', borderRadius: '10px', margin: '12px 0' }} aria-label={t('catalogueAdmin.suggestTitle')}>
      <p>{t('catalogueAdmin.suggestIntro')}</p>
      <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '3fr 1fr' }}>
        <div>
          <label className="form-label" htmlFor={`${idBase}-source`}>{t('catalogueAdmin.sourceUrl')}</label>
          <input id={`${idBase}-source`} className="form-input" value={source} placeholder="https://" required aria-describedby={sourceOk ? undefined : `${idBase}-source-hint`} onChange={(e) => { setSource(e.target.value); changed(); }} />
          {!sourceOk && <p id={`${idBase}-source-hint`} style={{ marginTop: '6px' }}>{t('catalogueAdmin.sourceRequired')}</p>}
        </div>
        <div>
          <label className="form-label" htmlFor={`${idBase}-country`}>{t('catalogueAdmin.country')}</label>
          <input id={`${idBase}-country`} className="form-input" value={country} maxLength={2} placeholder="SE" onChange={(e) => { setCountry(e.target.value.toUpperCase()); changed(); }} />
        </div>
      </div>
      {error && <div className="alert-danger" role="alert">{error}</div>}
      {suggestion && (
        <>
          <pre data-testid="suggestion-snippet" style={{ margin: 0, padding: '10px', overflowX: 'auto', background: 'var(--ground-2)', borderRadius: '8px', fontSize: '12.5px' }}>{suggestion.snippet}</pre>
          <p>
            <a className="btn btn-primary" href={suggestion.url} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}>{t('catalogueAdmin.openIssue')}</a>
            {' '}{t('catalogueAdmin.openIssueHint')}
          </p>
        </>
      )}
      {opened && <p role="status">{t('catalogueAdmin.suggestNext')}</p>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" className="btn" onClick={onClose}>{t('ui.close')}</button>
      </div>
    </form>
  );
};

export default CatalogueSuggest;
