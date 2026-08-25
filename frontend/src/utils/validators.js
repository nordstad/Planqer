export const MAX_PART_LENGTH = 6000; // 6000mm = 6m
export const MAX_BOARD_LENGTH = 6000; // 6000mm = 6m

export const validateParts = (parts) => {
  return parts.map(part => {
    const length = parseFloat(part.length);
    const quantity = parseInt(part.quantity, 10);
    
    if (isNaN(length) || length <= 0) {
      return "Length must be a positive number";
    }
    if (length > MAX_PART_LENGTH) {
      return `Length cannot exceed ${MAX_PART_LENGTH}mm`;
    }
    if (isNaN(quantity) || quantity <= 0) {
      return "Quantity must be a positive number";
    }
    return null;
  });
};

export const validateBoards = (boards) => {
  return boards.map(board => {
    const length = parseFloat(board);
    
    if (isNaN(length) || length <= 0) {
      return "Length must be a positive number";
    }
    if (length > MAX_BOARD_LENGTH) {
      return `Length cannot exceed ${MAX_BOARD_LENGTH}mm`;
    }
    return null;
  });
};

export const validatePartLength = (length, maxLength = MAX_PART_LENGTH) => {
  if (isNaN(length) || length <= 0) {
    return "Length must be a positive number";
  }
  if (length > maxLength) {
    return `Length cannot exceed ${maxLength}mm`;
  }
  return null;
};

export const validateBoardLength = (length, maxLength = MAX_BOARD_LENGTH) => {
  if (isNaN(length) || length <= 0) {
    return "Length must be a positive number";
  }
  if (length > maxLength) {
    return `Length cannot exceed ${maxLength}mm`;
  }
  return null;
};
