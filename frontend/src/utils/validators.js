// These limits mirror the numeric contracts in backend/planqer/validation.py
// and backend/planqer/schemas/*.py. All dimensions are millimetres. Board and
// part lengths reach 15 m (long glulam); sheet sides stay at 10 m.
export const MIN_PART_LENGTH = 0.1;
export const MAX_PART_LENGTH = 15000;
export const MIN_BOARD_LENGTH = 1;
export const MAX_BOARD_LENGTH = 15000;
export const MAX_PART_QUANTITY = 10000;
export const SAW_KERF_MIN = 0.1;
export const SAW_KERF_MAX = 100;

const message = (t, key, vars) => (t ? t(key, vars) : key);

export const validateParts = (parts, t) => {
  return parts.map(part => {
    const length = parseFloat(part.length);
    const quantity = parseInt(part.quantity, 10);
    
    if (isNaN(length) || length < MIN_PART_LENGTH) {
      return message(t, 'validation.positiveLength');
    }
    if (length > MAX_PART_LENGTH) {
      return message(t, 'validation.maxLength', { max: MAX_PART_LENGTH });
    }
    if (isNaN(quantity) || !Number.isInteger(Number(part.quantity)) || quantity < 1) {
      return message(t, 'validation.positiveQuantity');
    }
    if (quantity > MAX_PART_QUANTITY) {
      return message(t, 'validation.maxQuantity', { max: MAX_PART_QUANTITY });
    }
    return null;
  });
};

export const validateBoards = (boards, t) => {
  return boards.map(board => {
    const length = parseFloat(board);
    
    if (isNaN(length) || length < MIN_BOARD_LENGTH) {
      return message(t, 'validation.positiveLength');
    }
    if (length > MAX_BOARD_LENGTH) {
      return message(t, 'validation.maxLength', { max: MAX_BOARD_LENGTH });
    }
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
  return null;
};

export const validateBoardLength = (length, maxLength = MAX_BOARD_LENGTH, t) => {
  if (isNaN(length) || length < MIN_BOARD_LENGTH) {
    return message(t, 'validation.positiveLength');
  }
  if (length > maxLength) {
    return message(t, 'validation.maxLength', { max: maxLength });
  }
  return null;
};
