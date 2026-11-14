const patterns = [
  [/^Wallpaper roll is shorter than the tallest piece on wall '(.+)'$/, 'backendRollTooShort', ([wall]) => ({ wall })],
  [/^Wallpaper repeat cannot be longer than the roll$/, 'backendRepeatTooLong'],
  [/^Cutout is outside wall '(.+)'$/, 'backendCutoutOutside', ([wall]) => ({ wall })],
  [/^Cutout on wall '(.+)' is within 10 mm of a wall edge$/, 'backendCutoutNearEdge', ([wall]) => ({ wall })],
  [/^Ungrouped cutouts overlap on wall '(.+)'$/, 'backendCutoutsOverlap', ([wall]) => ({ wall })],
  [/^Opposite walls differ by more than 20 mm$/, 'backendOppositeWalls'],
  [/^roll_length must be greater than 0$/, 'backendInvalidRollLength'],
  [/^Piece '(.+)' cannot fit on a roll$/, 'backendPieceCannotFit', ([piece]) => ({ piece })],
  [/^roll_width must be greater than 0$/, 'backendInvalidRollWidth'],
  [/^first_strip_width must be greater than 0 and at most roll_width$/, 'backendInvalidFirstStripWidth'],
  [/^A seam falls on the outside corner before wall '(.+)'$/, 'backendSeamOutsideBefore', ([wall]) => ({ wall })],
  [/^A seam falls on the outside corner after wall '(.+)'$/, 'backendSeamOutsideAfter', ([wall]) => ({ wall })],
  [/^Strip (\d+) has no room to wrap (.+) mm past the corner after wall '(.+)'$/, 'backendInsufficientCornerWrap', ([strip, mm, wall]) => ({ strip, mm, wall })],
  [/^Strip (\d+) is (.+) mm on wall '(.+)', below the (.+) mm minimum$/, 'backendStripBelowMinimum', ([strip, mm, wall, min]) => ({ strip, mm, wall, min })],
  [/^Strip (\d+) leaves only (.+) mm on wall '(.+)' at a corner, below the (.+) mm minimum, and no first-strip width avoids it\. Consider choosing to start a new strip at this corner\.$/, 'backendCornerStripBelowMinimum', ([strip, mm, wall, min]) => ({ strip, mm, wall, min })],
  [/^Start a new strip at the corner between '(.+)' and '(.+)'\.$/, 'backendStartNewStrip', ([from, to]) => ({ from, to })],
  [/^x must be within the wall outline$/, 'backendPositionOutside'],
  [/^Strip must be within the wall outline$/, 'backendStripOutside'],
  [/^The corners do not turn through a full circle, so these walls cannot form a closed room\. Check the inside and outside corners\.$/, 'backendClosureTurns'],
  [/^The walls leave a (.+) mm gap where the last wall should meet the first\. Check the wall measurements before ordering\.$/, 'backendClosureGap', ([gap]) => ({ gap })],
];

export const translateWallpaperMessage = (message, t) => {
  for (const [pattern, key, variables] of patterns) {
    const match = String(message).match(pattern);
    if (match) return t(`wallpaperUi.${key}`, variables?.(match.slice(1)));
  }
  return message;
};
