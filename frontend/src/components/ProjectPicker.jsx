/*
  Which project a plan gets filed under. "New project…" is a value like any
  other: the page holds the name and makes the project when it saves the plan,
  so there is no separate create step to forget.

  Enter in the name field saves the plan — it submits the enclosing form, or
  calls `onSubmit` where the page has no form.
*/

import { useTranslation } from 'react-i18next';
import FormField from './FormField';

export const NEW_PROJECT = '__new__';

const ProjectPicker = ({ groups, value, onChange, newName, onNewNameChange, onSubmit }) => {
  const { t } = useTranslation();

  return (
    <div>
      <FormField label={t('ui.project')} required tip={t('ui.projectSaveHint')}>
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
      </FormField>

      {value === NEW_PROJECT && (
        <div style={{ marginTop: '14px' }}>
          <FormField label={t('ui.newProjectName')} required>
            <input
              type="text"
              className="form-input"
              value={newName}
              onChange={(e) => onNewNameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (e.currentTarget.form) e.currentTarget.form.requestSubmit();
                else onSubmit?.();
              }}
            />
          </FormField>
        </div>
      )}
    </div>
  );
};

export default ProjectPicker;
