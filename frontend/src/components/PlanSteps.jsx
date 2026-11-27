/*
  The rail that carries a plan from parts to saved. It borrows the top nav's own
  grammar — plain label, amber underline on the current one — so it reads as
  wayfinding rather than a second navigation surface.

  A step is reachable only once the work before it exists, and each finished
  step keeps its one-line summary on show, so nothing that has been decided has
  to be re-opened to be checked.
*/

import { useTranslation } from 'react-i18next';
import { useLayoutEffect, useRef } from 'react';
import { focusDestination } from '../utils/focusDestination';

const PlanSteps = ({ steps, current, onSelect }) => {
  const { t } = useTranslation();
  const rail = useRef(null);
  const previous = useRef(current);
  useLayoutEffect(() => {
    if (previous.current !== current) {
      focusDestination(rail.current?.parentElement.querySelector('.step-view h1'));
      previous.current = current;
    }
  }, [current]);
  return (
  <ol ref={rail} className="plan-steps" aria-label={t('ui.planProgress')}>
    {steps.map((step, index) => {
      const number = String(index + 1).padStart(2, '0');
      const isCurrent = index === current;
      const reachable = step.reachable && !isCurrent;

      return (
        <li key={step.label} className="plan-step">
          <button
            type="button"
            className="plan-step-btn"
            data-state={isCurrent ? 'current' : step.reachable ? 'done' : 'locked'}
            onClick={() => reachable && onSelect(index)}
            disabled={!reachable}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <span className="plan-step-no">{number}</span>
            <span className="plan-step-label">{step.label}</span>
            <span className="plan-step-sum">
              {isCurrent || step.reachable ? step.summary : step.locked}
            </span>
          </button>
        </li>
      );
    })}
  </ol>
  );
};

export default PlanSteps;
