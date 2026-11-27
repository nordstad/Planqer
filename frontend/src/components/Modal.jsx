import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const focusable = (container) => [...container.querySelectorAll(
  'button, input, select, textarea, a[href], [tabindex]',
)].filter((element) => element.tabIndex >= 0 && !element.matches(':disabled')
  && !element.closest('[hidden], [inert]') && getComputedStyle(element).display !== 'none');

const stack = [];

// Safari does not focus a button on pointer activation. Capture that trigger
// before mounting an overlay so pointer and keyboard dismissal recover alike.
export const modalTrigger = (open) => (event) => {
  (event.nativeEvent?.submitter || event.currentTarget).focus({ preventScroll: true });
  open(event);
};

// One mounted modal owns background isolation, keyboard containment and recovery.
const Modal = ({ children, onClose, title, sheetStyle, ...props }) => {
  const { t } = useTranslation();
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [trigger] = useState(() => document.activeElement);

  useLayoutEffect(() => {
    const modal = ref.current;
    stack.push(modal);
    const background = [...document.body.children].filter((element) => element !== modal);
    const inert = background.map((element) => element.inert);
    background.forEach((element) => { element.inert = true; });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const enter = () => (focusable(modal)[0] || modal).focus();
    if (!modal.contains(document.activeElement)) enter();
    const keydown = (event) => {
      if (stack.at(-1) !== modal) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      } else if (event.key === 'Tab') {
        const controls = focusable(modal);
        const index = controls.indexOf(document.activeElement);
        if (!controls.length || (event.shiftKey ? index <= 0 : index === controls.length - 1 || index < 0)) {
          event.preventDefault();
          ((event.shiftKey ? controls.at(-1) : controls[0]) || modal).focus();
        }
      }
    };
    const contain = (event) => { if (stack.at(-1) === modal && !modal.contains(event.target)) enter(); };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('focusin', contain);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('focusin', contain);
      stack.splice(stack.indexOf(modal), 1);
      background.forEach((element, index) => { element.inert = inert[index]; });
      document.body.style.overflow = overflow;
      // An explicit destination (e.g. Show in cut list) takes precedence.
      if (modal.contains(document.activeElement) || document.activeElement === document.body) {
        const target = trigger?.isConnected && trigger !== document.body && !trigger.matches(':disabled')
          ? trigger : document.querySelector('main');
        target?.focus({ preventScroll: true });
      }
    };
  }, [trigger]);

  return createPortal(
    <div {...props} ref={ref} className="cat-overlay" role={props.role || 'dialog'} aria-modal="true" tabIndex={-1}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      {title ? <div className="cat-sheet" style={sheetStyle}>
        <div className="masthead" style={{ marginTop: 0 }}>
          <span className="masthead-brand" style={{ fontSize: '13px' }}>{title}</span>
          <span className="masthead-section" />
          <button type="button" className="masthead-flash" onClick={onClose}>{t('common.close')}</button>
        </div>
        {children}
      </div> : children}
    </div>,
    document.body,
  );
};

export default Modal;
