/*
  A short explanation on hover, and on keyboard focus — the tooltip is CSS-driven
  off :hover and :focus-visible rather than a click-to-open panel, so it never
  costs a step in the flow it is explaining.
*/

const InfoTip = ({ label, children }) => (
  <span className="infotip">
    <button type="button" className="infotip-dot" aria-label={label}>
      i
    </button>
    <span className="infotip-body" role="tooltip">{children}</span>
  </span>
);

export default InfoTip;
