import { useTranslation } from 'react-i18next';
import FormField, { SectionCard, SectionStatus } from './FormField';
import ProjectPicker from './ProjectPicker';

// The save step's form: plan name, whether to update an existing plan, and the project.
const SavePlanCard = ({
  id, nameId, modeId, nameLabel, projectName, onProjectName, nameError,
  editingProject, onEditingProject, saveMode, onSaveMode, userProjects,
  projectGroups, groupId, onGroupId, newName, onNewName,
}) => {
  const { t } = useTranslation();
  const pickPlan = (plan) => {
    onEditingProject(plan);
    onProjectName(plan.name);
    onGroupId(plan.project_group_id || '');
  };

  return (
    <SectionCard
      id={id}
      title={t('workflow.planDetails')}
      status={<SectionStatus missing={projectName.trim() ? [] : [nameLabel]} />}
    >
      <div style={{ marginBottom: '20px' }}>
        <FormField label={nameLabel} required tip={t('ui.savedNameHint')}>
          <input
            id={nameId}
            type="text"
            className={`form-input ${nameError ? 'form-input-error' : ''}`}
            value={projectName}
            onChange={(e) => onProjectName(e.target.value)}
            aria-invalid={!!nameError}
            aria-describedby={nameError ? `${nameId}-error` : undefined}
            autoFocus
          />
        </FormField>
        {nameError && (
          <p id={`${nameId}-error`} className="text-danger text-[12.5px] font-semibold" style={{ marginTop: '7px' }} role="alert">
            {nameError}
          </p>
        )}
      </div>
      {editingProject && (
        <div style={{ marginBottom: '20px' }}>
          <FormField label={t('ui.saveAs')} required>
            <select
              id={modeId}
              className="form-select"
              value={saveMode}
              onChange={(e) => {
                const mode = e.target.value;
                onSaveMode(mode);
                if (mode === 'update' && !editingProject && userProjects.length) pickPlan(userProjects[0]);
              }}
            >
              <option value="new">{t('ui.createNewPlan')}</option>
              <option value="update" disabled={!userProjects.length}>{t('ui.updateExistingPlan')}</option>
            </select>
          </FormField>
          {saveMode === 'update' && (
            <select
              className="form-select"
              style={{ marginTop: '10px' }}
              aria-label={t('ui.planToUpdate')}
              value={editingProject.id}
              onChange={(e) => pickPlan(userProjects.find((p) => p.id === e.target.value))}
            >
              {userProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
      )}
      <ProjectPicker
        groups={projectGroups}
        value={groupId}
        onChange={onGroupId}
        newName={newName}
        onNewNameChange={onNewName}
      />
    </SectionCard>
  );
};

export default SavePlanCard;
