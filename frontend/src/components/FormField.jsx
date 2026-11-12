import { Children, cloneElement, useId } from 'react';
import { useTranslation } from 'react-i18next';
import InfoTip from './InfoTip';

const TRAILING_UNIT = /\s*\((mm|%)\)$/;

// Labels carry their unit in the translation ("Wall width (mm)"). The unit is
// moved into the field, and kept in the accessible name for screen readers.
export const splitUnit = (label) => {
  const match = label.match(TRAILING_UNIT);
  return match ? { text: label.slice(0, match.index), unit: match[1] } : { text: label, unit: null };
};

const FormField = ({ label, unit: unitOverride, required = false, optional = false, tip, fill = false, className = '', children }) => {
  const { t } = useTranslation();
  const generatedId = useId();
  const control = Children.only(children);
  const id = control.props.id || generatedId;
  const { text, unit: labelUnit } = splitUnit(label);
  const unit = unitOverride ?? labelUnit;
  // Optional fields get their own look (dashed edge, no recessed fill) on top of the "(optional)" label.
  const input = cloneElement(control, {
    id,
    ...(required ? { 'aria-required': true } : {}),
    ...(optional ? { className: `${control.props.className || ''} is-optional`.trim() } : {}),
  });

  return (
    <div className={`form-field${fill ? ' is-fill' : ''} ${className}`.trim()}>
      <div className="form-field-head">
        <label className="form-label" htmlFor={id}>
          {text}
          {unit && <span className="sr-only"> ({unit})</span>}
          {required && <span className="req-mark" aria-hidden="true" />}
          {optional && <>{' '}<span className="opt-mark">{t('formUi.optionalMark')}</span></>}
        </label>
        {tip && <InfoTip label={text}>{tip}</InfoTip>}
      </div>
      {unit
        ? <span className="field-unit-wrap">{input}<span className="field-unit" aria-hidden="true">{unit}</span></span>
        : input}
    </div>
  );
};

// A section card's header status: a problem, what is still empty, a neutral
// to-do, or done. `live` announces changes (use sparingly).
export const SectionStatus = ({ missing = [], error = null, todo = null, done = null, live = false }) => {
  const { t } = useTranslation();
  const role = live ? 'status' : undefined;
  if (error) return <span className="sec-card-status is-error" role={role}>{error}</span>;
  if (missing.length) {
    return <span className="sec-card-status" role={role}>{t('formUi.requiredEmpty', { count: missing.length, fields: missing.join(', ') })}</span>;
  }
  if (todo) return <span className="sec-card-status" role={role}>{todo}</span>;
  return <span className="sec-card-status is-done" role={role}>{done || t('formUi.complete')}</span>;
};

// A card with a header band: title, optional summary and ⓘ, and a status.
export const SectionCard = ({ id, title, titleRef, optional = false, summary, tip, tipLabel, status, sectionRef, className = '', children }) => {
  const { t } = useTranslation();
  const titleId = `${id}-title`;
  return (
    <section id={id} ref={sectionRef} tabIndex={sectionRef ? -1 : undefined} className={`sec-card ${className}`.trim()} aria-labelledby={titleId}>
      <div className="sec-card-head">
        <span className="sec-card-text">
          <span className="flex items-center">
            <h2 id={titleId} ref={titleRef} tabIndex={titleRef ? -1 : undefined} className="sec-card-title">{title}</h2>
            {optional && <>{' '}<span className="opt-mark">{t('formUi.optionalMark')}</span></>}
            {tip && <InfoTip label={tipLabel || title}>{tip}</InfoTip>}
          </span>
          {summary && <span className="sec-card-summary">{summary}</span>}
        </span>
        {status}
      </div>
      <div className="sec-card-body">{children}</div>
    </section>
  );
};

export default FormField;
