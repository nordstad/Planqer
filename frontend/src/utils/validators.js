export const MAX_PART_LENGTH = 6000; // 6000mm = 6m
export const MAX_BOARD_LENGTH = 6000; // 6000mm = 6m

const message = (t, key, vars) => (t ? t(key, vars) : key);

export const validateParts = (parts, t) => {
  return parts.map(part => {
    const length = parseFloat(part.length);
    const quantity = parseInt(part.quantity, 10);
    
    if (isNaN(length) || length <= 0) {
      return message(t, 'validation.positiveLength');
    }
    if (length > MAX_PART_LENGTH) {
      return message(t, 'validation.maxLength', { max: MAX_PART_LENGTH });
    }
    if (isNaN(quantity) || quantity <= 0) {
      return message(t, 'validation.positiveQuantity');
    }
    return null;
  });
};

export const validateBoards = (boards, t) => {
  return boards.map(board => {
    const length = parseFloat(board);
    
    if (isNaN(length) || length <= 0) {
      return message(t, 'validation.positiveLength');
    }
    if (length > MAX_BOARD_LENGTH) {
      return message(t, 'validation.maxLength', { max: MAX_BOARD_LENGTH });
    }
    return null;
  });
};

export const validatePartLength = (length, maxLength = MAX_PART_LENGTH, t) => {
  if (isNaN(length) || length <= 0) {
    return message(t, 'validation.positiveLength');
  }
  if (length > maxLength) {
    return message(t, 'validation.maxLength', { max: maxLength });
  }
  return null;
};

export const validateBoardLength = (length, maxLength = MAX_BOARD_LENGTH, t) => {
  if (isNaN(length) || length <= 0) {
    return message(t, 'validation.positiveLength');
  }
  if (length > maxLength) {
    return message(t, 'validation.maxLength', { max: maxLength });
  }
  return null;
};
