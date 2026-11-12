import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

const InfoTip = ({ label, children }) => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const id = useId();
  const open = !dismissed && (hovered || pinned);

  return (
    <span className="info-tip" onMouseEnter={() => { setDismissed(false); setHovered(true); }} onMouseLeave={() => setHovered(false)}>
      <button
        type="button"
        className="info-tip-button"
        aria-label={t('ui.moreInfo', { label })}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onFocus={() => { setDismissed(false); setHovered(true); }}
        onBlur={() => { setDismissed(false); setHovered(false); setPinned(false); }}
        onClick={() => setPinned((value) => { setDismissed(value); return !value; })}
        onKeyDown={(event) => { if (event.key === 'Escape') { setPinned(false); setDismissed(true); } }}
      >
        ⓘ
      </button>
      {open && <span id={id} className="info-tip-content" role="tooltip">{children}</span>}
    </span>
  );
};

export default InfoTip;
