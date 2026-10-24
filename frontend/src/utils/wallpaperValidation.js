// Mirrors the backend wall-outline checks so mistakes are shown beside the
// field. The backend stays authoritative.
const MIN_MM = 1;
const MAX_MM = 100000;
const IMPLAUSIBLE_MM = 100;

const num = (value) => Number(value) || 0;
const fmt = (value) => Math.round(value).toLocaleString('en-GB');

const GROUPS = [
  ['Width', ['width_top', 'width_middle', 'width_bottom']],
  ['Height', ['height_left', 'height_middle', 'height_right']],
];

export const wallDimensionIssues = (wall) => {
  const errors = [];
  const warnings = [];
  GROUPS.forEach(([label, fields]) => {
    const values = fields.map((field) => num(wall[field]));
    if (values.some((value) => value < MIN_MM || value > MAX_MM)) {
      errors.push(`${label} must be between ${MIN_MM} and ${fmt(MAX_MM)} mm.`);
    } else if (Math.min(...values) < IMPLAUSIBLE_MM) {
      warnings.push(`A ${label.toLowerCase()} of ${fmt(Math.min(...values))} mm is unusually small for a wall. Check the measurement: the allowances will dominate the result.`);
    }
  });
  if (wall.profile === 'sloped') {
    if (num(wall.lower_left) >= num(wall.height_left)) errors.push('The lower left edge must be below the upper left height.');
    if (num(wall.lower_right) >= num(wall.height_right)) errors.push('The lower right edge must be below the upper right height.');
  }
  return { errors, warnings };
};

const wallWidth = (wall) => Math.max(num(wall.width_top), num(wall.width_middle), num(wall.width_bottom));

// Openings are measured upward from the wall's local lower edge.
const usableHeightAt = (wall, x) => {
  const width = wallWidth(wall);
  const along = width ? x / width : 0;
  const top = num(wall.height_left) + (num(wall.height_right) - num(wall.height_left)) * along;
  const bottom = wall.profile === 'sloped' ? num(wall.lower_left) + (num(wall.lower_right) - num(wall.lower_left)) * along : 0;
  return top - bottom;
};

export const cutoutIssue = (wall, cutout) => {
  const x = num(cutout.x);
  const y = num(cutout.y);
  const width = num(cutout.width);
  const height = num(cutout.height);
  if (width <= 0 || height <= 0) return 'Width and height must be greater than zero.';
  if (x < 0 || y < 0) return 'Position cannot be negative.';
  const wallW = wallWidth(wall);
  if (x + width > wallW) return `This opening is ${fmt(x + width - wallW)} mm too wide: it ends past the right edge of the wall (${fmt(wallW)} mm wide).`;
  const left = usableHeightAt(wall, x);
  const right = usableHeightAt(wall, x + width);
  const available = Math.min(left, right);
  if (y + height > available) {
    const side = right <= left ? 'right' : 'left';
    return `This opening is ${fmt(y + height - available)} mm too tall at the ${side} edge. Available height: ${fmt(available)} mm.`;
  }
  return null;
};

export const MAX_CORNER_OVERLAP_MM = 50;

export const overlapIssue = (value) => {
  const overlap = Number(value);
  if (value === '' || !Number.isInteger(overlap) || overlap < 0 || overlap > MAX_CORNER_OVERLAP_MM) {
    return `Corner overlap must be a whole number between 0 and ${MAX_CORNER_OVERLAP_MM} mm.`;
  }
  return null;
};

export const wallIssues = (wall) => {
  // An open wall gets no paper, so only its width (used by the room closure) is checked.
  if (wall.skip) {
    const width = wallDimensionIssues(wall);
    const errors = width.errors.filter((message) => message.startsWith('Width'));
    return { errors, warnings: [], cutouts: [], hasErrors: errors.length > 0 };
  }
  const dimensions = wallDimensionIssues(wall);
  const cutouts = (wall.cutouts || []).map((cutout) => cutoutIssue(wall, cutout));
  return { ...dimensions, cutouts, hasErrors: dimensions.errors.length > 0 || cutouts.some(Boolean) };
};
