/*
  Which project a cutlist gets filed under, plus the way to make a new one.

  This lived inline on both optimizer pages, which meant two copies of the same
  two bugs: picking "New project…" snapped the select straight back to "Not in a
  project" (it is controlled by the selected id, which "New project…" never
  sets), and pressing Enter in the name field submitted the enclosing save form
  instead of creating the project — so the obvious way to use it silently did
  nothing and complained about the plan name. One component, one fix.

  It owns the naming state itself; the page only supplies the groups and does
  the API call, returning truthy so this knows whether to close.
*/

import { useState } from 'react';
import InfoTip from './InfoTip';

const NEW = '__new__';

const ProjectPicker = ({ groups, value, onChange, onCreate }) => {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const cancel = () => {
    setCreating(false);
    setName('');
  };

  const create = async () => {
    if (!name.trim()) return;
    if (await onCreate(name.trim())) cancel();
  };

  return (
    <div>
      <div className="flex items-center gap-2" style={{ marginBottom: '6px' }}>
        <label className="form-label" htmlFor="plan-project" style={{ marginBottom: 0 }}>Project</label>
        <InfoTip label="What a project is">
          A project holds several plans for the same build. A chair's rails cut
          from boards and its seat cut from a sheet can sit together, so you find
          both when you come back to it.
        </InfoTip>
      </div>

      <select
        id="plan-project"
        className="form-select"
        // Holds on NEW while the name field is open, so the control keeps
        // showing the choice the user actually made.
        value={creating ? NEW : value}
        onChange={(e) => {
          if (e.target.value === NEW) {
            setCreating(true);
            return;
          }
          setCreating(false);
          onChange(e.target.value);
        }}
      >
        <option value="">Not in a project</option>
        {groups.map((group) => (
          <option key={group.id} value={group.id}>{group.name}</option>
        ))}
        <option value={NEW}>New project…</option>
      </select>

      {creating && (
        <div className="flex gap-2" style={{ marginTop: '10px', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="form-input"
            style={{ flex: '1 1 200px', width: 'auto' }}
            placeholder="Dining chair"
            value={name}
            onChange={(e) => setName(e.target.value)}
            // This input sits inside the save form, where Enter would otherwise
            // try to save the plan. Enter here means "create this project".
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                create();
              } else if (e.key === 'Escape') {
                cancel();
              }
            }}
            aria-label="New project name"
            autoFocus
          />
          <button type="button" className="btn" onClick={create} disabled={!name.trim()}>
            Create project
          </button>
          <button type="button" className="btn" onClick={cancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export default ProjectPicker;
