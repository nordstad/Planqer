import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const MovePlanMenu = ({ groups, currentGroupId, onMove, busy = false }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const targets = groups.filter((group) => group.id !== currentGroupId);

  if (targets.length === 0) return null;

  const move = async (group) => {
    if (await onMove(group)) setOpen(false);
  };

  return (
    <div className="move-plan-menu">
      <button
        type="button"
        className="btn btn-sm"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        disabled={busy}
      >
        {t('projectUi.moveTo')}
      </button>
      {open && (
        <div className="move-plan-options" role="menu" aria-label={t('projectUi.moveToProject')}>
          {targets.map((group) => (
            <button key={group.id} type="button" role="menuitem" onClick={() => move(group)} disabled={busy}>
              {group.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default MovePlanMenu;
