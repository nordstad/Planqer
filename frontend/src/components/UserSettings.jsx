import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FormField, { FormLegend } from './FormField';
import { getUserSettings, updateUserSettings } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Loader from './Loader';
import CatalogueCountrySelect from './CatalogueCountrySelect';
import { setCatalogueChoice } from '../utils/catalogueChoice';
import { readMillimetres } from '../utils/measurementInput';
import { useLocalDataRevision } from '../hooks/useLocalDataRevision';

const UserSettings = () => {
  const { user } = useAuth();
  const restored = useLocalDataRevision();
  return <SettingsForUser key={`${user?.id ?? 'signed-out'}:${restored}`} userId={user?.id} />;
};

const SettingsForUser = ({ userId }) => {
  const { t } = useTranslation();
  const { language: activeLanguage, changeLanguage } = useLanguage();
  const [settings, setSettings] = useState(null);
  const [boardLengthsInput, setBoardLengthsInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');
  const active = useRef(false);
  const savePending = useRef(false);
  const noticeTimer = useRef(null);

  useEffect(() => {
    if (userId == null) return;
    let current = true;
    active.current = true;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const loadedSettings = await getUserSettings();
        if (!current) return;
        const boardLengths = loadedSettings.default_board_lengths.join(', ');
        setSettings({
          ...loadedSettings,
          default_vat_rate: loadedSettings.default_vat_rate ?? 25,
          default_prices_include_vat: loadedSettings.default_prices_include_vat ?? true,
          preferred_language: loadedSettings.preferred_language || activeLanguage,
          spare_margin_percent: loadedSettings.spare_margin_percent ?? 10,
          catalogue_country: loadedSettings.catalogue_country ?? 'auto',
        });
        setBoardLengthsInput(boardLengths);
      } catch (err) {
        if (current) setError(t('settings.loadError', { message: err.message }));
      } finally {
        if (current) setLoading(false);
      }
    })();
    return () => {
      current = false;
      active.current = false;
      clearTimeout(noticeTimer.current);
    };
  }, [userId, loadAttempt]);

  const handleBoardLengthsChange = (value) => {
    setBoardLengthsInput(value);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!active.current || !settings || loading || savePending.current) return;
    savePending.current = true;
    clearTimeout(noticeTimer.current);
    setSaving(true);
    setError('');
    setSavedNotice('');

    try {
      const boardLengths = boardLengthsInput
        .split(',')
        .map((length) => readMillimetres(length.trim(), 1, 15000));
      const kerf = readMillimetres(settings.default_saw_blade_width, 1, 100);
      await updateUserSettings({ ...settings, default_board_lengths: boardLengths, default_saw_blade_width: kerf });
      if (!active.current) return;
      await changeLanguage(settings.preferred_language, { persistAccount: false });
      if (!active.current) return;
      setCatalogueChoice(settings.catalogue_country === 'auto' ? null : settings.catalogue_country);
      setSavedNotice(t('common.settingsSaved'));
      noticeTimer.current = setTimeout(() => setSavedNotice(''), 3000);
    } catch (err) {
      if (active.current) setError(t('settings.saveError', { message: err.message }));
    } finally {
      if (active.current) {
        savePending.current = false;
        setSaving(false);
      }
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <Loader />
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: '520px' }}>
      <h2 className="section-title" style={{ marginBottom: '16px' }}>{t('settings.title')}</h2>

      {error && <div className="alert-danger" role="alert" style={{ marginBottom: '14px' }}>{error}</div>}
      {savedNotice && <div className="alert-note" role="status" style={{ marginBottom: '14px' }}>{savedNotice}</div>}

      {!settings ? (
        <button type="button" className="btn" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
          {t('settings.retryLoad')}
        </button>
      ) : <form onSubmit={handleSave}>
        <FormLegend />
        <div className="space-y-2" style={{ marginBottom: '14px' }}>
          <FormField label={t('settings.boardLengths')} required>
          <input
            id="board-lengths"
            type="text"
            className="form-input"
            value={boardLengthsInput}
            onChange={(e) => handleBoardLengthsChange(e.target.value)}
            placeholder={t('settings.boardLengthsPlaceholder')}
            disabled={saving}
          />
          </FormField>
          <p className="synthetic">{t('settings.boardLengthsHelp')}</p>
        </div>

        <div className="space-y-2" style={{ marginBottom: '14px' }}>
          <FormField label={t('settings.sawBladeWidth')} required>
          <input
            id="kerf"
            type="number"
            step="1"
            min="1"
            className="form-input dimension-input"
            value={settings.default_saw_blade_width}
            onChange={(e) => setSettings((prev) => ({ ...prev, default_saw_blade_width: e.target.value }))}
            disabled={saving}
          />
          </FormField>
        </div>

        <div className="space-y-2" style={{ marginBottom: '20px' }}>
          <FormField label={t('settings.spareMargin')} required>
          <input id="spare-margin" type="number" min="0" max="100" step="1" className="form-input dimension-input" value={settings.spare_margin_percent}
            onChange={(e) => setSettings((prev) => ({ ...prev, spare_margin_percent: parseFloat(e.target.value) || 0 }))} disabled={saving} />
          </FormField>
          <p className="synthetic">{t('settings.spareMarginHelp')}</p>
        </div>

        <div className="space-y-2" style={{ marginBottom: '20px' }}>
          <FormField label={t('settings.currency')} required>
          <select
            id="currency"
            className="form-select"
            value={settings.default_currency || 'SEK'}
            onChange={(e) => setSettings((prev) => ({ ...prev, default_currency: e.target.value }))}
            disabled={saving}
          >
            <option value="SEK">SEK</option>
            <option value="NOK">NOK</option>
            <option value="DKK">DKK</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
          </FormField>
        </div>

        <div className="space-y-2" style={{ marginBottom: '20px' }}>
          <FormField label={t('settings.vatRate')} required>
          <input id="vat-rate" type="number" min="0" max="100" step="0.1" className="form-input dimension-input" value={settings.default_vat_rate}
            onChange={(e) => setSettings((prev) => ({ ...prev, default_vat_rate: parseFloat(e.target.value) || 0 }))} disabled={saving} />
          </FormField>
          <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={settings.default_prices_include_vat}
              onChange={(e) => setSettings((prev) => ({ ...prev, default_prices_include_vat: e.target.checked }))} disabled={saving} />
            <span>{t('settings.pricesIncludeVat')}</span>
          </label>
          <p className="synthetic">{t('settings.vatHelp')}</p>
        </div>

        <div className="space-y-2" style={{ marginBottom: '20px' }}>
          <FormField label={t('settings.language')} required>
          <select
            id="settings-language"
            className="form-select"
            value={settings.preferred_language || activeLanguage}
            onChange={(e) => setSettings((prev) => ({ ...prev, preferred_language: e.target.value }))}
            disabled={saving}
          >
            <option value="en-GB">English</option>
            <option value="sv-SE">Svenska</option>
            <option value="nb-NO">Norsk</option>
          </select>
          </FormField>
        </div>

        <div className="space-y-2" style={{ marginBottom: '20px' }}>
          <FormField label={t('settings.catalogueCountry')} required>
          <CatalogueCountrySelect
            id="settings-catalogue"
            className="form-select"
            value={settings.catalogue_country}
            onChange={(value) => setSettings((prev) => ({ ...prev, catalogue_country: value }))}
            disabled={saving}
          />
          </FormField>
          <p className="synthetic">{t('settings.catalogueCountryHelp')}</p>
        </div>

        <button type="submit" className="btn-order" disabled={saving}>
          {saving ? t('common.saving') : t('common.saveSettings')}
        </button>
      </form>}
    </div>
  );
};

export default UserSettings;
