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
    preferred_language: activeLanguage,
  });
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
        setSettings({ ...loadedSettings, preferred_language: loadedSettings.preferred_language || activeLanguage });
      } catch (err) {
        setError(t('settings.loadError', { message: err.message }));
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const handleBoardLengthsChange = (value) => {
    const lengths = value.split(',').map((l) => parseFloat(l.trim())).filter((l) => !isNaN(l));
    setSettings((prev) => ({ ...prev, default_board_lengths: lengths }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSavedNotice('');

    try {
      await updateUserSettings(settings);
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
            value={settings.default_board_lengths.join(', ')}
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
