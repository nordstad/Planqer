/*
  Which project a plan gets filed under. "New project…" is a value like any
  other: the page holds the name and makes the project when it saves the plan,
  so there is no separate create step to forget.

  Enter in the name field saves the plan — it submits the enclosing form, or
  calls `onSubmit` where the page has no form.
*/

import { useTranslation } from 'react-i18next';

export const NEW_PROJECT = '__new__';

const ProjectPicker = ({ groups, value, onChange, newName, onNewNameChange, onSubmit }) => {
  const { t } = useTranslation();

  return (
    <div>
      <label className="form-label" htmlFor="plan-project">{t('ui.project')}</label>

      <select
        id="plan-project"
        className="form-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {groups.map((group) => (
          <option key={group.id} value={group.id}>{group.name}</option>
        ))}
        <option value={NEW_PROJECT}>{t('ui.newProject')}</option>
      </select>

      <p className="synthetic" style={{ marginTop: '7px' }}>
        {t('ui.projectSaveHint')}
      </p>

      {value === NEW_PROJECT && (
        <div className="flex gap-2" style={{ marginTop: '10px', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="form-input"
            style={{ flex: '1 1 200px', width: 'auto' }}
            placeholder={t('ui.projectPlaceholder')}
            value={newName}
            onChange={(e) => onNewNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (e.currentTarget.form) e.currentTarget.form.requestSubmit();
              else onSubmit?.();
            }}
            aria-label={t('ui.newProjectName')}
          />
        </div>
      )}
    </div>
  );
};

export default ProjectPicker;
