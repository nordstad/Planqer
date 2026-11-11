import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createProjectGroup } from '../utils/api';
import { NEW_PROJECT } from '../components/ProjectPicker';

const LAST_PROJECT_KEY = 'planqer.lastProjectGroup';

const readLast = () => {
  try { return localStorage.getItem(LAST_PROJECT_KEY); } catch { return null; }
};

const remember = (id) => {
  try { localStorage.setItem(LAST_PROJECT_KEY, String(id)); } catch { /* storage unavailable */ }
};

/*
  Which project a plan is saved into. Every plan lives in a project, so there is
  always a choice: the last project used, else the first one, else a new project
  that is made when the plan is saved — never a separate "create" step.

  Nothing is stored for the default; it is worked out from `groups`, so it
  follows them as they load.
*/
export function useProjectChoice({ groups, onCreated, fallbackName }) {
  const { t } = useTranslation();
  const [picked, setPicked] = useState('');
  const [typedName, setTypedName] = useState(null);

  const find = (id) => groups.find((group) => String(group.id) === String(id));
  const defaultGroup = find(readLast()) || groups[0];
  const groupId = picked === NEW_PROJECT || find(picked) ? picked : defaultGroup?.id ?? NEW_PROJECT;
  const defaultName = t('ui.defaultProjectName');
  const newName = typedName ?? (groups.length === 0 ? defaultName : '');

  // Returns the id to save under, making the project first so that a failure
  // there saves nothing.
  const resolve = async () => {
    if (groupId !== NEW_PROJECT) {
      remember(groupId);
      return groupId;
    }
    const name = newName.trim() || fallbackName?.trim() || defaultName;
    const existing = groups.find((group) => group.name.trim().toLowerCase() === name.toLowerCase());
    const group = existing || await createProjectGroup(name);
    if (!existing) onCreated(group);
    setPicked(group.id);
    remember(group.id);
    return group.id;
  };

  return { groupId, setGroupId: setPicked, newName, setNewName: setTypedName, resolve };
}
