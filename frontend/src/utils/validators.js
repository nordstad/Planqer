import { isWholeMillimetres, millimetresError } from './measurementInput';

// These limits mirror the numeric contracts in backend/partsible/validation.py
// and backend/partsible/schemas/*.py. All dimensions are millimetres. Board and
// part lengths reach 15 m (long glulam); sheet sides stay at 10 m.
export const MIN_PART_LENGTH = 1;
export const MAX_PART_LENGTH = 15000;
export const MIN_BOARD_LENGTH = 1;
export const MAX_BOARD_LENGTH = 15000;
export const MAX_PART_QUANTITY = 10000;
export const MAX_SHEET_PART_QUANTITY = 1000;
const isValidQuantity = (value, max) => (
  (typeof value === 'string' || typeof value === 'number')
  && Number.isInteger(Number(value))
  && Number(value) >= 1
  && Number(value) <= max
);
export const isValidBoardQuantity = (value) => isValidQuantity(value, MAX_PART_QUANTITY);
export const isValidSheetQuantity = (value) => isValidQuantity(value, MAX_SHEET_PART_QUANTITY);
export const SAW_KERF_MIN = 1;
export const SAW_KERF_MAX = 100;

const message = (t, key, vars) => (t ? t(key, vars) : key);

export const validatePartFields = (part, t) => {
  const errors = {};
  const length = Number(part.length);
  const quantity = Number(part.quantity);

  if (isNaN(length) || length < MIN_PART_LENGTH) {
    errors.length = message(t, 'validation.positiveLength');
  } else if (length > MAX_PART_LENGTH) {
    errors.length = message(t, 'validation.maxLength', { max: MAX_PART_LENGTH });
  } else if (!isWholeMillimetres(part.length)) {
    errors.length = millimetresError(part.length, MIN_PART_LENGTH, MAX_PART_LENGTH, t);
  }
  if (!isValidBoardQuantity(part.quantity)) {
    errors.quantity = Number.isInteger(quantity) && quantity > MAX_PART_QUANTITY
      ? message(t, 'validation.maxQuantity', { max: MAX_PART_QUANTITY })
      : message(t, 'validation.positiveQuantity');
  }
  return Object.keys(errors).length > 0 ? errors : null;
};

export const validateParts = (parts, t) => parts.map((part) => {
  const errors = validatePartFields(part, t);
  return errors ? Object.values(errors)[0] : null;
});

export const validateBoards = (boards, t) => {
  return boards.map(board => {
    const length = Number(board);
    
    if (isNaN(length) || length < MIN_BOARD_LENGTH) {
      return message(t, 'validation.positiveLength');
    }
    if (length > MAX_BOARD_LENGTH) {
      return message(t, 'validation.maxLength', { max: MAX_BOARD_LENGTH });
    }
    if (!isWholeMillimetres(board)) return millimetresError(board, MIN_BOARD_LENGTH, MAX_BOARD_LENGTH, t);
    return null;
  });
};

export const validatePartLength = (length, maxLength = MAX_PART_LENGTH, t) => {
  if (isNaN(length) || length < MIN_PART_LENGTH) {
    return message(t, 'validation.positiveLength');
  }
  if (length > maxLength) {
    return message(t, 'validation.maxLength', { max: maxLength });
  }
  if (!isWholeMillimetres(length)) return millimetresError(length, MIN_PART_LENGTH, maxLength, t);
  return null;
};

export const validateBoardLength = (length, maxLength = MAX_BOARD_LENGTH, t) => {
  if (isNaN(length) || length < MIN_BOARD_LENGTH) {
    return message(t, 'validation.positiveLength');
  }
  if (length > maxLength) {
    return message(t, 'validation.maxLength', { max: maxLength });
  }
  if (!isWholeMillimetres(length)) return millimetresError(length, MIN_BOARD_LENGTH, maxLength, t);
  return null;
};
