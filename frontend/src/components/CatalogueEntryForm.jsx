/*
  Add or edit one catalogue entry. A new entry picks a type and size; an
  existing one keeps both (they make up its identity) and edits the rest.
*/

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FREE_TEXT_TYPE, detailOptions, labelIn, typesOfKind } from '../utils/catalogue';
import { detailsPayload, emptyForm, formProblem, newEntryPayload } from '../utils/catalogueAdmin';

const OptionChecks = ({ legend, options, value, onChange, language }) => (
  <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
    <legend className="form-label">{legend}</legend>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
      {options.map((option) => (
        <label key={option.key} style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13.5px' }}>
          <input
            type="checkbox"
            checked={value.includes(option.key)}
            onChange={(e) => onChange(e.target.checked ? [...value, option.key] : value.filter((key) => key !== option.key))}
          />
          {labelIn(option.labels, language)}
        </label>
      ))}
    </div>
  </fieldset>
);

const CatalogueEntryForm = ({ catalogue, initial, creating, busy, error, onSubmit, onCancel }) => {
  const { t, i18n } = useTranslation();
  const idBase = useId().replace(/:/g, '');
  const [form, setForm] = useState(initial || emptyForm());
  const [problem, setProblem] = useState(null);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const types = typesOfKind(catalogue, form.kind).filter((type) => type.key !== FREE_TEXT_TYPE[form.kind]);
  const board = form.kind === 'board';
  const applies = new Set(catalogue.types.find((type) => type.key === form.type)?.details || []);

  const submit = (event) => {
    event.preventDefault();
    const found = formProblem(form, { creating });
    setProblem(found);
    if (!found) onSubmit(creating ? newEntryPayload(form) : detailsPayload(form));
  };

  const field = (name, label, props = {}) => (
    <div>
      <label className="form-label" htmlFor={`${idBase}-${name}`}>{label}</label>
      <input
        id={`${idBase}-${name}`}
        className={`form-input${problem === name ? ' form-input-error' : ''}`}
        value={form[name]}
        onChange={(e) => set(name, e.target.value)}
        {...props}
      />
    </div>
  );

  return (
    <form onSubmit={submit} className="synthetic" style={{ display: 'grid', gap: '12px', whiteSpace: 'normal', padding: '14px', border: '1px solid var(--rule)', borderRadius: '10px', margin: '12px 0' }} aria-label={creating ? t('catalogueAdmin.addTitle') : t('catalogueAdmin.editTitle')}>
      {creating && (
        <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div>
            <label className="form-label" htmlFor={`${idBase}-kind`}>{t('catalogueAdmin.kind')}</label>
            <select
              id={`${idBase}-kind`}
              className="form-select"
              value={form.kind}
              onChange={(e) => setForm({ ...emptyForm(e.target.value), note: form.note })}
            >
              <option value="board">{t('catalogueAdmin.board')}</option>
              <option value="sheet">{t('catalogueAdmin.sheet')}</option>
            </select>
          </div>
          <div>
            <label className="form-label" htmlFor={`${idBase}-type`}>{t('catalogueAdmin.type')}</label>
            <select
              id={`${idBase}-type`}
              className={`form-select${problem === 'type' ? ' form-input-error' : ''}`}
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
            >
              <option value="">{t('catalogueAdmin.chooseType')}</option>
              {types.map((type) => <option key={type.key} value={type.key}>{labelIn(type.labels, i18n.language)}</option>)}
            </select>
          </div>
          {field('thickness', t('catalogueAdmin.thickness'), { inputMode: 'decimal' })}
          {board && field('width', t('catalogueAdmin.width'), { inputMode: 'decimal' })}
        </div>
      )}

      {board ? (
        <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '2fr 1fr' }}>
          {field('lengths', t('catalogueAdmin.lengths'), { placeholder: '2400, 3000, 3600' })}
          {field('maxLength', t('catalogueAdmin.maxLength'), { inputMode: 'numeric' })}
        </div>
      ) : (
        field('formats', t('catalogueAdmin.formats'), { placeholder: '1220x2440, 1200x2500' })
      )}

      {applies.size > 0 ? (
        <>
          <OptionChecks legend={t('productUi.species')} options={detailOptions(catalogue, 'species')} value={form.species} onChange={(v) => set('species', v)} language={i18n.language} />
          <OptionChecks legend={t('productUi.treatment')} options={detailOptions(catalogue, 'treatment')} value={form.treatments} onChange={(v) => set('treatments', v)} language={i18n.language} />
          <OptionChecks legend={t('productUi.profile')} options={detailOptions(catalogue, 'profile')} value={form.profiles} onChange={(v) => set('profiles', v)} language={i18n.language} />
          {field('grades', t('catalogueAdmin.grades'), { placeholder: 'C14, C24' })}
        </>
      ) : null}

      <div>
        <label className="form-label" htmlFor={`${idBase}-sources`}>{t('catalogueAdmin.sources')}</label>
        <textarea
          id={`${idBase}-sources`}
          className={`form-input${problem === 'sources' ? ' form-input-error' : ''}`}
          rows={2}
          value={form.sources}
          onChange={(e) => set('sources', e.target.value)}
          placeholder="https://"
        />
      </div>
      {field('note', t('productUi.note'), { maxLength: 200 })}

      {(problem || error) && (
        <div className="alert-danger" role="alert">
          {problem ? t(`catalogueAdmin.problem.${problem}`) : error}
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>{creating ? t('catalogueAdmin.add') : t('catalogueAdmin.save')}</button>
        <button type="button" className="btn" onClick={onCancel}>{t('ui.cancel')}</button>
      </div>
    </form>
  );
};

export default CatalogueEntryForm;
