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
  const input = cloneElement(control, { id, ...(required ? { 'aria-required': true } : {}) });

  return (
    <div className={`form-field${fill ? ' is-fill' : ''} ${className}`.trim()}>
      <div className="form-field-head">
        <label className="form-label" htmlFor={id}>
          {text}
          {unit && <span className="sr-only"> ({unit})</span>}
          {required && <span className="req-mark" aria-hidden="true" />}
          {optional && <span className="opt-mark">{t('formUi.optionalMark')}</span>}
        </label>
        {tip && <InfoTip label={text}>{tip}</InfoTip>}
      </div>
      {unit
        ? <span className="field-unit-wrap">{input}<span className="field-unit" aria-hidden="true">{unit}</span></span>
        : input}
    </div>
  );
};

// A section card's header status: what is still empty, a problem, or done.
export const SectionStatus = ({ missing = [], error = null }) => {
  const { t } = useTranslation();
  if (error) return <span className="sec-card-status is-error">{error}</span>;
  if (missing.length) {
    return <span className="sec-card-status">{t('formUi.requiredEmpty', { count: missing.length, fields: missing.join(', ') })}</span>;
  }
  return <span className="sec-card-status is-done">{t('formUi.complete')}</span>;
};

export default FormField;
