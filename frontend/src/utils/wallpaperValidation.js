import i18n from '../i18n';

// Mirrors the backend wall-outline checks so mistakes are shown beside the
// field. The backend stays authoritative.
const MIN_MM = 1;
const MAX_MM = 100000;
const IMPLAUSIBLE_MM = 100;

const num = (value) => Number(value) || 0;
const fmt = (value) => Math.round(value).toLocaleString('en-GB');
// Messages are translated with the caller's `t`; without one they follow the active language.
const defaultT = (key, options) => i18n.t(key, options);

const GROUPS = [
  ['Width', ['width_top', 'width_middle', 'width_bottom']],
  ['Height', ['height_left', 'height_middle', 'height_right']],
];

const dimensionIssues = (wall, t, groups) => {
  const errors = [];
  const warnings = [];
  groups.forEach(([label, fields]) => {
    const values = fields.map((field) => num(wall[field]));
    if (values.some((value) => value < MIN_MM || value > MAX_MM)) {
      errors.push(t(`wallpaperUi.err${label}Range`, { min: MIN_MM, max: fmt(MAX_MM) }));
    } else if (Math.min(...values) < IMPLAUSIBLE_MM) {
      warnings.push(t(`wallpaperUi.warn${label}Small`, { value: fmt(Math.min(...values)) }));
    }
  });
  return { errors, warnings };
};

export const wallDimensionIssues = (wall, t = defaultT) => {
  const { errors, warnings } = dimensionIssues(wall, t, GROUPS);
  if (wall.profile === 'sloped') {
    if (num(wall.lower_left) >= num(wall.height_left)) errors.push(t('wallpaperUi.errLowerLeft'));
    if (num(wall.lower_right) >= num(wall.height_right)) errors.push(t('wallpaperUi.errLowerRight'));
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

export const cutoutIssue = (wall, cutout, t = defaultT) => {
  const x = num(cutout.x);
  const y = num(cutout.y);
  const width = num(cutout.width);
  const height = num(cutout.height);
  if (width <= 0 || height <= 0) return t('wallpaperUi.errCutoutZero');
  if (x < 0 || y < 0) return t('wallpaperUi.errCutoutNegative');
  const wallW = wallWidth(wall);
  if (x + width > wallW) return t('wallpaperUi.errCutoutWide', { over: fmt(x + width - wallW), width: fmt(wallW) });
  const left = usableHeightAt(wall, x);
  const right = usableHeightAt(wall, x + width);
  const available = Math.min(left, right);
  if (y + height > available) {
    const side = right <= left ? t('wallpaperUi.sideRight') : t('wallpaperUi.sideLeft');
    return t('wallpaperUi.errCutoutTall', { over: fmt(y + height - available), side, available: fmt(available) });
  }
  return null;
};

export const MAX_CORNER_OVERLAP_MM = 50;

export const overlapIssue = (value, t = defaultT) => {
  const overlap = Number(value);
  if (value === '' || !Number.isInteger(overlap) || overlap < 0 || overlap > MAX_CORNER_OVERLAP_MM) {
    return t('wallpaperUi.errOverlap', { max: MAX_CORNER_OVERLAP_MM });
  }
  return null;
};

export const wallIssues = (wall, t = defaultT) => {
  // An open wall gets no paper, so only its width (used by the room closure) is checked.
  if (wall.skip) {
    const { errors } = dimensionIssues(wall, t, GROUPS.slice(0, 1));
    return { errors, warnings: [], cutouts: [], hasErrors: errors.length > 0 };
  }
  const dimensions = wallDimensionIssues(wall, t);
  const cutouts = (wall.cutouts || []).map((cutout) => cutoutIssue(wall, cutout, t));
  return { ...dimensions, cutouts, hasErrors: dimensions.errors.length > 0 || cutouts.some(Boolean) };
};
