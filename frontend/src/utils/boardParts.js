import { isValidBoardQuantity, MAX_PART_QUANTITY } from './validators';
import { readMillimetres } from './measurementInput';

export const normalizeBoardParts = (parts) => parts.reduce((normalized, part, index) => {
  const length = readMillimetres(part.length, 1, 15000);
  if (!isValidBoardQuantity(part.quantity)) {
    throw new Error(`Board part ${index + 1} quantity must be a whole number between 1 and ${MAX_PART_QUANTITY}`);
  }
  const quantity = Number(part.quantity);
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
