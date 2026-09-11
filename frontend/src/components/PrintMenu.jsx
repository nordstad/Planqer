/*
  One button for exporting a project's plans — printing or saving as PDF are
  the same browser dialog, so this doesn't try to tell them apart. Clicking
  it opens a small menu rather than crowding the header with a paper-size
  select and two separate buttons: the choice a user actually makes here is
  rare (all plans, or the few they ticked below) and doesn't need to be on
  screen at all times.
*/

import { useEffect, useRef, useState } from 'react';
import { Chevron } from './icons';

const PrintMenu = ({
  paperSize, onPaperSizeChange, printableCount, selectedCount, printing, onPrintAll, onPrintSelected,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Closes on an outside click, same as a native <select> — there's no
  // other way out of this menu once a mouse user has already left it.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const run = (action) => {
    setOpen(false);
    action();
  };

  return (
    <div className="print-menu" ref={rootRef}>
      <button
        type="button"
        className="btn"
        onClick={() => setOpen((v) => !v)}
        disabled={printing}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {printing ? 'Preparing…' : 'Print'} <Chevron open={open} size={11} />
      </button>

      {open && (
        <div className="print-menu-panel" role="menu">
          <label className="print-menu-row">
            <span>Paper</span>
            <select
              className="form-select print-paper"
              value={paperSize}
              onChange={(e) => onPaperSizeChange(e.target.value)}
              aria-label="Paper size"
            >
              <option value="a4">A4</option>
              <option value="letter">Letter</option>
            </select>
          </label>

          <div className="print-menu-divider" />

          <button
            type="button"
            className="print-menu-action"
            role="menuitem"
            onClick={() => run(onPrintAll)}
          >
            Print all {printableCount === 1 ? 'the plan' : `${printableCount} plans`}
          </button>

          {printableCount > 1 && (
            <button
              type="button"
              className="print-menu-action"
              role="menuitem"
              onClick={() => run(onPrintSelected)}
              disabled={selectedCount === 0}
              title={selectedCount === 0 ? 'Tick a plan below first' : undefined}
            >
              Print selected {selectedCount > 0 ? `(${selectedCount})` : ''}
            </button>
          )}

          <p className="print-menu-hint">
            Opens your browser's print dialog — choose "Save as PDF" there to download a file.
          </p>
        </div>
      )}
    </div>
  );
};

export default PrintMenu;
