export const formatMillimetres = (value) => (
  Number.isFinite(value)
    ? value.toLocaleString('sv-SE', { maximumFractionDigits: 20 })
    : '—'
);
