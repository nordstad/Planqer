import { useTranslation } from 'react-i18next';

const usesTouch = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(pointer: coarse)').matches
);

/* The viewers pan with a shift or right-button drag, which nothing on screen
   suggests, so say it. Touch screens have no such buttons and get their own
   wording. */
const NavigationHint = () => {
  const { t } = useTranslation();
  return (
    <p className="synthetic" style={{ margin: '4px 0 0' }}>
      {t(usesTouch() ? 'modelUi.navHintTouch' : 'modelUi.navHintMouse')}
    </p>
  );
};

export default NavigationHint;
