import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getUserSettings, updateUserSettings } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Loader from './Loader';

const UserSettings = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { language: activeLanguage, changeLanguage } = useLanguage();
  const [settings, setSettings] = useState({
    default_board_lengths: [3000, 3600, 5000],
    default_saw_blade_width: 3.0,
    default_currency: 'SEK',
    default_vat_rate: 25,
    default_prices_include_vat: true,
    preferred_language: activeLanguage,
    spare_margin_percent: 10,
  });
  const [boardLengthsInput, setBoardLengthsInput] = useState('3000, 3600, 5000');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        setLoading(true);
        const loadedSettings = await getUserSettings();
        setSettings({
          ...loadedSettings,
          default_vat_rate: loadedSettings.default_vat_rate ?? 25,
          default_prices_include_vat: loadedSettings.default_prices_include_vat ?? true,
          preferred_language: loadedSettings.preferred_language || activeLanguage,
          spare_margin_percent: loadedSettings.spare_margin_percent ?? 10,
        });
        setBoardLengthsInput(loadedSettings.default_board_lengths.join(', '));
      } catch (err) {
        setError(t('settings.loadError', { message: err.message }));
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const handleBoardLengthsChange = (value) => {
    setBoardLengthsInput(value);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSavedNotice('');

    try {
      const boardLengths = boardLengthsInput
        .split(',')
        .map((length) => parseFloat(length.trim()))
        .filter((length) => !isNaN(length));
      await updateUserSettings({ ...settings, default_board_lengths: boardLengths });
      await changeLanguage(settings.preferred_language, { persistAccount: false });
      setSavedNotice(t('common.settingsSaved'));
      setTimeout(() => setSavedNotice(''), 3000);
    } catch (err) {
      setError(t('settings.saveError', { message: err.message }));
    } finally {
      setSaving(false);
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

      <form onSubmit={handleSave}>
        <div className="space-y-2" style={{ marginBottom: '14px' }}>
          <label className="form-label" htmlFor="board-lengths">{t('settings.boardLengths')}</label>
          <input
            id="board-lengths"
            type="text"
            className="form-input"
            value={boardLengthsInput}
            onChange={(e) => handleBoardLengthsChange(e.target.value)}
            placeholder={t('settings.boardLengthsPlaceholder')}
            disabled={saving}
          />
          <p className="synthetic">{t('settings.boardLengthsHelp')}</p>
        </div>

        <div className="space-y-2" style={{ marginBottom: '14px' }}>
          <label className="form-label" htmlFor="kerf">{t('settings.sawBladeWidth')}</label>
          <input
            id="kerf"
            type="number"
            step="0.1"
            min="0"
            className="form-input"
            value={settings.default_saw_blade_width}
            onChange={(e) => setSettings((prev) => ({ ...prev, default_saw_blade_width: parseFloat(e.target.value) || 0 }))}
            disabled={saving}
          />
        </div>

        <div className="space-y-2" style={{ marginBottom: '20px' }}>
          <label className="form-label" htmlFor="spare-margin">{t('settings.spareMargin')}</label>
          <input id="spare-margin" type="number" min="0" max="100" step="1" className="form-input" value={settings.spare_margin_percent}
            onChange={(e) => setSettings((prev) => ({ ...prev, spare_margin_percent: parseFloat(e.target.value) || 0 }))} disabled={saving} />
          <p className="synthetic">{t('settings.spareMarginHelp')}</p>
        </div>

        <div className="space-y-2" style={{ marginBottom: '20px' }}>
          <label className="form-label" htmlFor="currency">{t('settings.currency')}</label>
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
        </div>

        <div className="space-y-2" style={{ marginBottom: '20px' }}>
          <label className="form-label" htmlFor="vat-rate">{t('settings.vatRate')}</label>
          <input id="vat-rate" type="number" min="0" max="100" step="0.1" className="form-input" value={settings.default_vat_rate}
            onChange={(e) => setSettings((prev) => ({ ...prev, default_vat_rate: parseFloat(e.target.value) || 0 }))} disabled={saving} />
          <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={settings.default_prices_include_vat}
              onChange={(e) => setSettings((prev) => ({ ...prev, default_prices_include_vat: e.target.checked }))} disabled={saving} />
            <span>{t('settings.pricesIncludeVat')}</span>
          </label>
          <p className="synthetic">{t('settings.vatHelp')}</p>
        </div>

        <div className="space-y-2" style={{ marginBottom: '20px' }}>
          <label className="form-label" htmlFor="settings-language">{t('settings.language')}</label>
          <select
            id="settings-language"
            className="form-select"
            value={settings.preferred_language || activeLanguage}
            onChange={(e) => setSettings((prev) => ({ ...prev, preferred_language: e.target.value }))}
            disabled={saving}
          >
            <option value="en-GB">English</option>
            <option value="sv-SE">Svenska</option>
            <option value="nb-NO">Norsk bokmål</option>
          </select>
        </div>

        <button type="submit" className="btn-order" disabled={saving}>
          {saving ? t('common.saving') : t('common.saveSettings')}
        </button>
      </form>
    </div>
  );
};

export default UserSettings;
