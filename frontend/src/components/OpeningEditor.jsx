import FormField from './FormField';
import { KIND_KEYS } from './WallpaperPieceDiagram';
import { useTranslation } from 'react-i18next';

const OpeningEditor = ({ cutout, onChange, onRemove, fromVertical, error, errors = {} }) => {
  const { t } = useTranslation();
  return <div style={{ padding: '12px 0', borderBottom: '1px solid var(--rule-hair)' }}>
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <FormField label={t('wallpaperUi.type')} className="w-[220px] max-w-full">
        <select className="form-select" value={cutout.kind || 'window'} onChange={(event) => onChange('kind', event.target.value)}>{Object.entries(KIND_KEYS).map(([kind, key]) => <option key={kind} value={kind}>{t(key)}</option>)}</select>
      </FormField>
      {cutout.kind === 'custom' && <FormField label={t('wallpaperUi.customName')} className="min-w-[160px] flex-1"><input className="form-input" value={cutout.label || ''} onChange={(event) => onChange('label', event.target.value)} /></FormField>}
      <button type="button" className="btn-text is-quiet ml-auto" onClick={onRemove}>{t('common.remove')}</button>
    </div>
    <div className="mt-3 grid grid-cols-2 items-end gap-x-3 gap-y-3 md:grid-cols-4">
      <FormField label={t('wallpaperUi.fromLeftEdge')} fill required error={errors.x}><input className="form-input" inputMode="numeric" value={cutout.x} onChange={(event) => onChange('x', event.target.value)} /></FormField>
      <FormField label={t(fromVertical)} fill required error={errors.y}><input className="form-input" inputMode="numeric" value={cutout.y} onChange={(event) => onChange('y', event.target.value)} /></FormField>
      <FormField label={t('wallpaperUi.widthMm')} fill required error={errors.width}><input className="form-input" inputMode="numeric" value={cutout.width} onChange={(event) => onChange('width', event.target.value)} /></FormField>
      <FormField label={t('wallpaperUi.heightMm')} fill required error={errors.height}><input className="form-input" inputMode="numeric" value={cutout.height} onChange={(event) => onChange('height', event.target.value)} /></FormField>
    </div>
    {error && <p role="alert" className="synthetic" style={{ color: 'var(--revision)', marginTop: '8px' }}>{error}</p>}
  </div>;
};

export default OpeningEditor;
