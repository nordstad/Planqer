import { useEffect, useId, useRef, useState } from 'react';

// Actions remain ordinary Tab/Enter buttons, not an application menu.
export const useActionDisclosure = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);
  return {
    open, setOpen, id,
    container: {
      ref,
      onKeyDown: (event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
          ref.current.querySelector('button').focus();
        }
      },
      onBlur: (event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)
          && !event.relatedTarget.closest('[role="dialog"], [role="alertdialog"]')) setOpen(false);
      },
    },
  };
};
