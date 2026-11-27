import i18n from '../i18n';

export const isWholeMillimetres = (value) => (
  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
  && Number.isSafeInteger(Number(value))
);

export const millimetresError = (value, min, max, t = i18n.t.bind(i18n)) => (
  isWholeMillimetres(value) && Number(value) >= min && Number(value) <= max
    ? ''
    : max === Number.MAX_SAFE_INTEGER
      ? t('measurementUi.whole', { min })
      : t('measurementUi.range', { min, max })
);

export const readMillimetres = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const error = millimetresError(value, min, max);
  if (error) throw new Error(error);
  return Number(value);
};
