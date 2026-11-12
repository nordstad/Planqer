import i18n from '../i18n';

// Mirrors the backend wall-outline checks so mistakes are shown beside the
// field. The backend stays authoritative.
const MIN_MM = 1;
const MAX_MM = 100000;
const IMPLAUSIBLE_MM = 100;

const num = (value) => Number(value) || 0;
const isBlank = (value) => value == null || String(value).trim() === '';
const fmt = (value) => Math.round(value).toLocaleString('en-GB');
// Messages are translated with the caller's `t`; without one they follow the active language.
const defaultT = (key, options) => i18n.t(key, options);

const GROUPS = [
  ['Width', ['width_top', 'width_middle', 'width_bottom']],
  ['Height', ['height_left', 'height_middle', 'height_right']],
];

// An empty measurement is reported as missing, not as an error: the maker
// has not got to it yet.
const dimensionIssues = (wall, t, groups) => {
  const errors = [];
  const warnings = [];
  const missing = [];
  groups.forEach(([label, fields]) => {
    if (fields.some((field) => isBlank(wall[field]))) {
      missing.push(label);
      return;
    }
    const values = fields.map((field) => num(wall[field]));
    if (values.some((value) => value < MIN_MM || value > MAX_MM)) {
      errors.push(t(`wallpaperUi.err${label}Range`, { min: MIN_MM, max: fmt(MAX_MM) }));
    } else if (Math.min(...values) < IMPLAUSIBLE_MM) {
      warnings.push(t(`wallpaperUi.warn${label}Small`, { value: fmt(Math.min(...values)) }));
    }
  });
  return { errors, warnings, missing };
};

export const wallDimensionIssues = (wall, t = defaultT) => {
  const { errors, warnings, missing } = dimensionIssues(wall, t, GROUPS);
  if (wall.profile === 'sloped') {
    if (num(wall.lower_left) >= num(wall.height_left)) errors.push(t('wallpaperUi.errLowerLeft'));
    if (num(wall.lower_right) >= num(wall.height_right)) errors.push(t('wallpaperUi.errLowerRight'));
  }
  return { errors, warnings, missing };
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

const CUTOUT_FIELDS = ['x', 'y', 'width', 'height'];
export const cutoutMissing = (cutout) => CUTOUT_FIELDS.filter((field) => isBlank(cutout[field]));

export const cutoutIssue = (wall, cutout, t = defaultT) => {
  // A field not filled in yet is missing, not wrong.
  if (cutoutMissing(cutout).length) return null;
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
    const { errors, missing } = dimensionIssues(wall, t, GROUPS.slice(0, 1));
    return { errors, warnings: [], missing, cutouts: [], cutoutsMissing: [], hasErrors: errors.length > 0 };
  }
  const dimensions = wallDimensionIssues(wall, t);
  // Openings cannot be checked against a wall that is not measured yet.
  const cutouts = (wall.cutouts || []).map((cutout) => (dimensions.missing.length ? null : cutoutIssue(wall, cutout, t)));
  const cutoutsMissing = (wall.cutouts || []).map(cutoutMissing);
  return { ...dimensions, cutouts, cutoutsMissing, hasErrors: dimensions.errors.length > 0 || cutouts.some(Boolean) };
};

/* ── where the walls are ──────────────────────────────────────────────────
   Walls are entered clockwise with the room on the right of the direction of
   travel. An inside corner turns right; an outside corner turns left. Corners
   are assumed square. A "none" corner starts a new wall run, placed below the
   previous walls and unconnected to them. */
export const wallLength = (wall) => Math.max(num(wall.width_top), num(wall.width_middle), num(wall.width_bottom));

export const layOutWalls = (walls, corners) => {
  let point = [0, 0];
  let heading = [1, 0];
  let lowest = 0;
  let run = 0;
  const gap = Math.max(...walls.map(wallLength), 1) * 0.25;
  return walls.map((wall, index) => {
    const length = wallLength(wall);
    const start = point;
    const end = [start[0] + heading[0] * length, start[1] + heading[1] * length];
    const placed = { start, end, heading, inward: [-heading[1], heading[0]], length, run };
    const corner = corners[index];
    if (corner) heading = corner.kind === 'outside' ? [heading[1], -heading[0]] : [-heading[1], heading[0]];
    point = end;
    lowest = Math.max(lowest, start[1], end[1]);
    if (corner?.kind === 'none') {
      heading = [1, 0];
      point = [0, lowest + gap];
      run += 1;
    }
    return placed;
  });
};

const EPS = 1;
const same = (a, b) => Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
const span = (a, b, axis) => [Math.min(a[axis], b[axis]), Math.max(a[axis], b[axis])];

// Square corners make every wall axis-aligned, so two walls meet exactly where
// their extents overlap on both axes. Meeting end to end at a corner is fine;
// lying along each other or running into each other is not.
const wallsClash = (a, b) => {
  const [ax0, ax1] = span(a.start, a.end, 0);
  const [ay0, ay1] = span(a.start, a.end, 1);
  const [bx0, bx1] = span(b.start, b.end, 0);
  const [by0, by1] = span(b.start, b.end, 1);
  const x0 = Math.max(ax0, bx0); const x1 = Math.min(ax1, bx1);
  const y0 = Math.max(ay0, by0); const y1 = Math.min(ay1, by1);
  if (x1 < x0 - EPS || y1 < y0 - EPS) return false;
  if (x1 - x0 > EPS || y1 - y0 > EPS) return true;
  const meet = [x0, y0];
  const isEnd = (wall) => same(meet, wall.start) || same(meet, wall.end);
  return !(isEnd(a) && isEnd(b));
};

/* Each later wall that overlaps, crosses or runs into an earlier wall of the
   same run, and the wall after which the room already closes, if any. */
export const wallCrossings = (walls, corners, closed) => {
  const placed = layOutWalls(walls, corners);
  const last = walls.length - 1;
  const neighbours = (i, j) => j === i + 1 || (closed && i === 0 && j === last);
  const crossings = [];
  placed.forEach((wall, j) => {
    if (wall.length < EPS) return;
    const other = placed.findIndex((earlier, i) => i < j && earlier.run === wall.run && earlier.length >= EPS && !neighbours(i, j) && wallsClash(earlier, wall));
    if (other >= 0) crossings.push({ wall: j, other });
  });
  const closesAfter = placed.findIndex((wall, index) => index >= 2 && index < last && wall.run === 0 && same(wall.end, placed[0].start));
  return { crossings, closesAfter: closesAfter >= 0 ? closesAfter : null };
};
