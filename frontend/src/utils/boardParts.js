export const normalizeBoardParts = (parts) => parts.reduce((normalized, part) => {
  const length = parseFloat(part.length);
  const quantity = parseInt(part.quantity, 10);
  if (Number.isFinite(length) && Number.isFinite(quantity)) {
    normalized.push({
      name: String(part.name || '').trim(),
      length,
      quantity,
    });
  }
  return normalized;
}, []);

export const restoreBoardParts = (partsData) => {
  if (Array.isArray(partsData)) {
    return partsData.map((part) => ({
      name: part.name || '',
      length: String(part.length),
      quantity: String(part.quantity),
    }));
  }
  return Object.entries(partsData || {}).map(([length, quantity]) => ({
    name: '',
    length,
    quantity: String(quantity),
  }));
};

export const boardPartCount = (partsData) => (Array.isArray(partsData)
  ? partsData.reduce((sum, part) => sum + (parseInt(part.quantity, 10) || 0), 0)
  : Object.values(partsData || {}).reduce((sum, quantity) => sum + (parseInt(quantity, 10) || 0), 0));
