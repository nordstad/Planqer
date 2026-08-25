/*
  An advanced option, folded away. Most people never price their stock or pick a
  packing strategy, so those controls stay closed behind one line that says what
  is inside — and, when the option is on, what it is currently set to.
*/

import { Chevron } from './icons';

const Disclosure = ({ title, hint, open, onToggle, children }) => (
  <section className="fold" data-open={open}>
    <button type="button" className="fold-head" onClick={onToggle} aria-expanded={open}>
      <Chevron open={open} />
      <span className="fold-title">{title}</span>
      {hint && <span className="fold-hint">{hint}</span>}
    </button>
    {open && <div className="fold-body">{children}</div>}
  </section>
);

export default Disclosure;
