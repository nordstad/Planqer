import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import PlanSteps from './PlanSteps';
import ProjectPicker from './ProjectPicker';
import MovePlanMenu from './MovePlanMenu';
import { useProjectChoice } from '../hooks/useProjectChoice';
import WallOutlineEditor from './WallOutlineEditor';
import { ArrowLeft, Tick } from './icons';
import FormField, { SectionCard, SectionStatus, splitUnit } from './FormField';
import InfoTip from './InfoTip';
import WallpaperPieceGallery from './WallpaperPieceGallery';
import { KIND_KEYS, pieceFaces } from './WallpaperPieceDiagram';
import { wallIssues, overlapIssue, wallCrossings } from '../utils/wallpaperValidation';
import RoomOverview, { linkColour } from './RoomOverview';
import { createWallpaperPlan, getProjectGroups, getUserSettings, getWallpaperProjects, saveWallpaper, saveWallpaperProject, updateWallpaperProject, movePlanToProject } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useAccountContext } from '../contexts/useAccountContext';
import { isStaticMode } from '../utils/mode';

const numeric = (value) => Number(value) || 0;
// Plans saved before connected strips have no segments; treat them as one face.
const segmentsOf = (item) => (item.segments?.length ? item.segments : [item]);
const isOnWall = (item, wallIndex) => segmentsOf(item).some((segment) => segment.wall_index === wallIndex);
// Drawing-style letters: Wall A, B, … Z, AA. Walls are lettered clockwise from the first wall.
const letterOf = (index) => {
  let letters = '';
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) letters = String.fromCharCode(65 + (n % 26)) + letters;
  return letters;
};
const wallLetter = (index, t) => t('wallpaperUi.wallName', { letter: letterOf(index) });
const isBlank = (value) => value == null || String(value).trim() === '';
const isDesktop = () => window.matchMedia?.('(min-width: 1024px)').matches ?? true;

const initialWall = (t) => ({
  name: wallLetter(0, t), profile: 'rectangle', width_top: '2400', width_middle: '2400', width_bottom: '2400',
  height_left: '2400', height_middle: '2400', height_right: '2400', confirmed: true,
});

const SHAPE_PATHS = {
  rectangle: '2,3 26,3 26,19 2,19',
  sloped: '2,3 26,11 26,19 2,19',
};
const ShapeIcon = ({ profile }) => <svg width="34" height="24" viewBox="0 0 28 22" aria-hidden="true"><polygon points={SHAPE_PATHS[profile]} fill="var(--ground-2)" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" /></svg>;

const wallShapes = [['rectangle', 'wallpaperUi.shapeRectangle'], ['sloped', 'wallpaperUi.shapeSloped']];

const stripLabel = (t, number) => t('wallpaperUi.stripLabel', { number });

// The middle height is not asked for on sloped walls; keep it consistent with the measured edges.
const withDerivedMiddle = (wall) => {
  const left = numeric(wall.height_left);
  const right = numeric(wall.height_right);
  if (wall.profile === 'sloped') return { ...wall, height_middle: String(Math.max(left, right)) };
  return wall;
};

// Inside corners lap the final strip a little round the corner so it stays crisp; outside corners must wrap.
const defaultContinuation = (kind) => ({ inside: 'overlap', outside: 'continue' }[kind] || '');

const initialCorner = () => ({
  kind: 'inside',
  confirmed_continuation: defaultContinuation('inside'),
});

// Only standard values are pre-filled: outlet and switch boxes and their usual
// heights, and a standard door. Anything that differs from room to room starts
// empty, because a guessed value that is never corrected silently skews the plan.
const CUTOUT_DEFAULTS = {
  door: { y: '0', width: '900', height: '2100' },
  opening: { y: '0' },
  outlet: { y: '250', width: '85', height: '85' },
  switch: { y: '1100', width: '85', height: '85' },
};
const CUTOUT_FIELDS = ['x', 'y', 'width', 'height'];

const defaultCutout = (kind) => ({ kind, x: '', y: '', width: '', height: '', ...CUTOUT_DEFAULTS[kind], tuck_edges: [] });
// Changing the type swaps in the new type's standard values, but never over a
// value the user typed.
const changeCutoutKind = (cutout, kind) => {
  const before = CUTOUT_DEFAULTS[cutout.kind] || {};
  const after = CUTOUT_DEFAULTS[kind] || {};
  const untouched = (field) => isBlank(cutout[field]) || cutout[field] === before[field];
  return { ...cutout, kind, ...Object.fromEntries(CUTOUT_FIELDS.filter(untouched).map((field) => [field, after[field] ?? ''])) };
};

const CornerConnection = ({ from, to, corner, link, overlap }) => {
  const { t } = useTranslation();
  if (!corner) return null;
  if (corner.kind === 'none') return <div aria-label={t('wallpaperUi.separateRunsAria', { from, to })} className="synthetic" style={{ margin: '4px 0 28px', padding: '0 0 0 18px' }}>{t('wallpaperUi.noCornerBetween', { from, to })}</div>;
  const wraps = corner.confirmed_continuation === 'continue';
  const cornerName = corner.kind === 'outside' ? t('wallpaperUi.cornerOutside') : t('wallpaperUi.cornerInside');
  const action = wraps
    ? t('wallpaperUi.actionWraps', { to })
    : overlap
      ? t('wallpaperUi.actionOverlap', { mm: Math.round(overlap), to })
      : t('wallpaperUi.actionFresh', { to });
  return <div aria-label={t('wallpaperUi.cornerAria', { from, to, corner: cornerName, action })} style={{ display: 'flex', alignItems: 'stretch', gap: '12px', margin: '4px 0 28px', padding: '0 0 0 18px' }}>
    <div aria-hidden="true" style={{ width: link ? '5px' : '2px', minHeight: '46px', background: link ? linkColour(link) : 'var(--accent)' }} />
    <div style={{ padding: '5px 0' }}>
      <b style={{ display: 'block', fontSize: '13px' }}>{from} → {to}</b>
      <span className="synthetic">{cornerName} · {action}{link ? <b style={{ color: linkColour(link) }}> · {t('wallpaperUi.linkedStrip', { strip: stripLabel(t, link) })}</b> : null}</span>
    </div>
  </div>;
};

const pieceCount = (count, t) => t('wallpaperUi.pieceCount', { count });
const rollFitHint = (fit, rollLength, repeat, t) => {
  // Only worth saying when a slightly longer roll would fit one more piece on every roll.
  if (!fit || fit.shortfall <= 0 || fit.shortfall > rollLength * 0.2 || fit.full_pieces <= fit.pieces_per_roll) return null;
  return t('wallpaperUi.rollFitHint', { pieces: fit.pieces_per_roll, length: Math.round(rollLength), repeat: repeat ? t('wallpaperUi.rollFitRepeat', { repeat: Math.round(repeat) }) : '', next: fit.pieces_per_roll + 1, needed: Math.round(fit.length_for_next), short: Math.round(fit.shortfall) });
};
const leftoverSentence = (material, t) => {
  const used = [];
  if (material.short_pieces_count > 0) used.push(t('wallpaperUi.leftoverShort', { pieces: pieceCount(material.short_pieces_count, t), length: Math.round(material.short_pieces_length) }));
  if (material.offcuts_reused_count > 0) used.push(t('wallpaperUi.leftoverGaps', { pieces: pieceCount(material.offcuts_reused_count, t), length: Math.round(material.offcuts_reused_length) }));
  const reuse = used.length ? t('wallpaperUi.leftoversUsed', { list: used.join('; ') }) : t('wallpaperUi.leftoversNone');
  return material.largest_leftover > 0 ? t('wallpaperUi.largestLeftover', { reuse, length: Math.round(material.largest_leftover) }) : reuse;
};

export const WallElevation = ({ wall, wallIndex, plan, wallNames }) => {
  const { t } = useTranslation();
  const widthTop = numeric(wall.width_top);
  const widthMiddle = numeric(wall.width_middle);
  const widthBottom = numeric(wall.width_bottom);
  const heightLeft = numeric(wall.height_left);
  const heightMiddle = numeric(wall.height_middle);
  const heightRight = numeric(wall.height_right);
  const width = Math.max(widthTop, widthMiddle, widthBottom);
  const height = Math.max(heightLeft, heightMiddle, heightRight);
  const isSloped = wall.profile === 'sloped';
  const lowerLeft = isSloped ? numeric(wall.lower_left) : 0;
  const lowerRight = isSloped ? numeric(wall.lower_right) : 0;
  const isDetailed = widthTop !== widthMiddle || widthMiddle !== widthBottom || heightLeft !== heightMiddle || heightMiddle !== heightRight;
  const segments = (plan?.strips || []).flatMap((strip) => {
    const all = segmentsOf(strip);
    return all.map((segment, position) => ({
      ...segment,
      number: strip.number,
      link: all.length > 1 ? { colour: linkColour(strip.number), before: all[position - 1] ? wallNames[all[position - 1].wall_index] : null, after: all[position + 1] ? wallNames[all[position + 1].wall_index] : null } : null,
    })).filter((segment) => segment.wall_index === wallIndex);
  });
  const wrapOut = (plan?.strips || []).find((strip) => strip.return_overlap > 0 && strip.segments?.[strip.segments.length - 1]?.wall_index === wallIndex);
  const wrapIn = (plan?.strips || []).find((strip) => strip.return_overlap > 0 && strip.return_wall_index === wallIndex);
  const scaleX = (value) => 60 + (value / width) * 600;
  const scaleY = (value) => 290 - (value / height) * 240;
  // Strip and piece names cannot remain legible when their full text is wider
  // than the strip. Keep the elevation as a clear spatial drawing and move
  // those labels to a flowing key below it instead.
  const useStripKey = segments.some((segment) => scaleX(segment.x_end) - scaleX(segment.x_start) < 88);
  const outlinePath = isSloped
    ? `M ${scaleX(0)} ${scaleY(lowerLeft)} L ${scaleX(widthTop)} ${scaleY(lowerRight)} L ${scaleX(widthTop)} ${scaleY(heightRight)} L ${scaleX(0)} ${scaleY(heightLeft)} Z`
    : `M ${scaleX(0)} ${scaleY(0)} L ${scaleX(widthBottom)} ${scaleY(0)} L ${scaleX(widthMiddle)} ${scaleY(heightMiddle / 2)} L ${scaleX(widthTop)} ${scaleY(heightRight)} L ${scaleX(0)} ${scaleY(heightLeft)} Z`;
  const clipId = `wall-outline-${wallIndex}`;
  return <div className="wallpaper-elevation"><svg viewBox="0 0 720 390" className="wallpaper-wall-drawing" role="img" aria-label={t('wallpaperUi.elevationAria', { name: wall.name })}>
    <defs><marker id={`wall-arrow-${wallIndex}`} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M6 0L0 3L6 6" fill="none" stroke="var(--ink-3)" /></marker><clipPath id={clipId}><path d={outlinePath} /></clipPath></defs>
    <path d={outlinePath} fill="var(--ground-2)" stroke="var(--ink)" strokeWidth="2" />
    {segments.map((segment) => {
      const { link } = segment;
      const left = scaleX(segment.x_start);
      const right = scaleX(segment.x_end);
      const label = right - left < 60 ? stripLabel(t, segment.number) : `${stripLabel(t, segment.number)} · ${Math.round(segment.x_end - segment.x_start)} mm`;
      return <g key={`${segment.number}-${segment.x_start}`}>
        {link && <rect x={left} y="0" width={right - left} height="390" fill={link.colour} opacity="0.18" clipPath={`url(#${clipId})`} />}
        <line x1={right} x2={right} y1="50" y2="290" stroke={link ? link.colour : 'var(--accent)'} strokeWidth={link ? 2 : 1} strokeDasharray="5 4" clipPath={`url(#${clipId})`} />
        {link?.after && <g><line x1={right} x2={right} y1="0" y2="390" stroke={link.colour} strokeWidth="6" clipPath={`url(#${clipId})`} /><text x={right} y="36" textAnchor="end" className="wallpaper-svg-small" style={{ fill: link.colour, fontWeight: 700 }}>{t('wallpaperUi.stripContinuesOn', { strip: stripLabel(t, segment.number), wall: link.after })}</text></g>}
        {link?.before && <g><line x1={left} x2={left} y1="0" y2="390" stroke={link.colour} strokeWidth="6" clipPath={`url(#${clipId})`} /><text x={left} y="36" textAnchor="start" className="wallpaper-svg-small" style={{ fill: link.colour, fontWeight: 700 }}>{t('wallpaperUi.stripFrom', { strip: stripLabel(t, segment.number), wall: link.before })}</text></g>}
        {!useStripKey && <text x={(left + right) / 2} y="349" textAnchor="middle" className="wallpaper-svg-strip" style={link ? { fill: link.colour, fontWeight: 700 } : undefined}><title>{t('wallpaperUi.stripTitle', { number: segment.number, width: Math.round(segment.x_end - segment.x_start), wall: wall.name })}</title>{label}</text>}
      </g>;
    })}
    {!useStripKey && (plan?.pieces || []).filter((piece) => isOnWall(piece, wallIndex)).map((piece) => {
      const segment = segments.find((item) => item.number === piece.strip_number);
      if (!segment) return null;
      return <text key={`label-${piece.id}`} data-testid="piece-id" x={(scaleX(segment.x_start) + scaleX(segment.x_end)) / 2} y={scaleY(Math.min(piece.y_end, height)) - 5} textAnchor="middle" className="wallpaper-svg-small" style={{ fontWeight: 700 }}>{piece.id}</text>;
    })}
    {!isSloped && (plan?.pieces || []).filter((piece) => isOnWall(piece, wallIndex) && piece.y_end - piece.y_start < height - 1).map((piece) => {
      const segment = segments.find((item) => item.number === piece.strip_number);
      if (!segment) return null;
      const top = scaleY(piece.y_end);
      const bottom = scaleY(piece.y_start);
      return <g key={piece.id} data-testid="partial-piece"><rect x={scaleX(segment.x_start)} y={top} width={scaleX(segment.x_end) - scaleX(segment.x_start)} height={bottom - top} fill="var(--accent)" opacity="0.28" stroke="var(--accent)" strokeWidth="1.5" />{!useStripKey && <text x={(scaleX(segment.x_start) + scaleX(segment.x_end)) / 2} y={(top + bottom) / 2} textAnchor="middle" dominantBaseline="central" className="wallpaper-svg-small" style={{ fill: 'var(--accent)', fontWeight: 700 }}>{t('wallpaperUi.partialPiece', { height: Math.round(piece.y_end - piece.y_start) })}</text>}</g>;
    })}
    {wrapIn && <g data-testid="corner-overlap-in"><rect x={scaleX(0)} y="0" width={Math.max(6, (wrapIn.return_overlap / width) * 600)} height="390" fill="var(--accent)" opacity="0.3" clipPath={`url(#${clipId})`} /><text x={scaleX(0)} y="22" textAnchor="start" className="wallpaper-svg-small" style={{ fill: 'var(--accent)', fontWeight: 700 }}>{t('wallpaperUi.coversWrapped', { mm: Math.round(wrapIn.return_overlap), wall: wallNames[wrapIn.segments[wrapIn.segments.length - 1].wall_index], strip: stripLabel(t, wrapIn.number) })}</text></g>}
    {wrapOut && <g data-testid="corner-overlap-out"><rect x={scaleX(width)} y={scaleY(isSloped ? heightRight : height)} width={Math.max(6, (wrapOut.return_overlap / width) * 600)} height={scaleY(isSloped ? lowerRight : 0) - scaleY(isSloped ? heightRight : height)} fill="var(--accent)" opacity="0.55" /><text x={scaleX(width)} y="22" textAnchor="end" className="wallpaper-svg-small" style={{ fill: 'var(--accent)', fontWeight: 700 }}>{t('wallpaperUi.wrapsOnto', { strip: stripLabel(t, wrapOut.number), mm: Math.round(wrapOut.return_overlap), wall: wallNames[wrapOut.return_wall_index] })}</text></g>}
    {wall.cutouts?.map((cutout, index) => {
      const x = scaleX(numeric(cutout.x));
      const lowerAtCutout = isSloped ? lowerLeft + (lowerRight - lowerLeft) * numeric(cutout.x) / width : 0;
      const y = scaleY(lowerAtCutout + numeric(cutout.y) + numeric(cutout.height));
      const cutoutWidth = (numeric(cutout.width) / width) * 600;
      const cutoutHeight = (numeric(cutout.height) / height) * 240;
      const label = cutout.label || (KIND_KEYS[cutout.kind] ? t(KIND_KEYS[cutout.kind]).toLowerCase() : cutout.kind.replace('_', ' '));
      const lines = [label, `${numeric(cutout.width)} × ${numeric(cutout.height)} mm`, t('wallpaperUi.cutoutPosition', { x: numeric(cutout.x), ref: isSloped ? t('wallpaperUi.refLowerEdge') : t('wallpaperUi.refFloor'), y: numeric(cutout.y) })];
      // A box too small for its three lines gets them beside it, on the side with room, with a halo to stay legible.
      const small = cutoutWidth < 140 || cutoutHeight < 50;
      const leftSide = x + cutoutWidth + 190 > 720;
      const textX = small ? (leftSide ? x - 6 : x + cutoutWidth + 6) : x + cutoutWidth / 2;
      const anchor = small ? (leftSide ? 'end' : 'start') : 'middle';
      const textY = y + cutoutHeight / 2 - 10;
      return <g key={index}><rect x={x} y={y} width={cutoutWidth} height={cutoutHeight} fill="var(--card)" stroke="var(--ink)" />{lines.map((line, row) => <text key={row} x={textX} y={textY + row * 15} textAnchor={anchor} className="wallpaper-svg-small" style={small ? { paintOrder: 'stroke', stroke: 'var(--ground-2)', strokeWidth: 4 } : undefined}>{line}</text>)}</g>;
    })}
    <line x1="60" y1="316" x2={scaleX(widthBottom)} y2="316" stroke="var(--ink-3)" markerStart={`url(#wall-arrow-${wallIndex})`} markerEnd={`url(#wall-arrow-${wallIndex})`} /><text x={(60 + scaleX(widthBottom)) / 2} y="311" textAnchor="middle" className="wallpaper-svg-small">{isDetailed ? t('wallpaperUi.widthNearFloor', { mm: Math.round(widthBottom) }) : t('wallpaperUi.wallWidthDim', { mm: Math.round(width) })}</text>
    <line x1="35" y1={scaleY(0)} x2="35" y2={scaleY(heightLeft)} stroke="var(--ink-3)" markerStart={`url(#wall-arrow-${wallIndex})`} markerEnd={`url(#wall-arrow-${wallIndex})`} /><text x="25" y={(scaleY(0) + scaleY(heightLeft)) / 2} textAnchor="middle" transform={`rotate(-90 25 ${(scaleY(0) + scaleY(heightLeft)) / 2})`} className="wallpaper-svg-small">{isDetailed ? t('wallpaperUi.heightAtLeft', { mm: Math.round(heightLeft) }) : t('wallpaperUi.wallHeightDim', { mm: Math.round(height) })}</text>
    <text x="60" y="375" className="wallpaper-svg-small">{t('wallpaperUi.allOpeningsMeasured', { origin: isSloped ? t('wallpaperUi.originLocalLower') : t('wallpaperUi.originBottomLeft') })}</text>
  </svg>{useStripKey && <ol className="wallpaper-strip-key" data-testid="wallpaper-strip-key" aria-label={t('wallpaperUi.stripKey')}>
    {segments.map((segment) => {
      const pieces = (plan?.pieces || []).filter((piece) => piece.strip_number === segment.number && isOnWall(piece, wallIndex));
      return <li key={`${segment.number}-${segment.x_start}`}>
        <b>{stripLabel(t, segment.number)}</b> · {Math.round(segment.x_end - segment.x_start)} mm{pieces.length ? ` · ${pieces.map((piece) => `${piece.id} (${Math.round(piece.y_end - piece.y_start)} mm)`).join(', ')}` : ''}
      </li>;
    })}
  </ol>}</div>;
};

const RollDiagram = ({ roll, rollLength, pieces, wallIndex }) => {
  const { t } = useTranslation();
  return <svg viewBox="0 0 720 130" className="wallpaper-roll-diagram" style={{ width: '100%', maxWidth: '720px', margin: '12px 0' }} role="img" aria-label={t('wallpaperUi.rollAria', { number: roll.number })}>
  <rect x="35" y="36" width="650" height="54" fill="var(--ground-2)" stroke="var(--ink)" />
  {roll.cuts.filter((cut) => isOnWall(pieces.find((piece) => piece.id === cut.piece_id) || {}, wallIndex)).map((cut) => { const gapStart = 35 + ((cut.start - cut.alignment_gap) / rollLength) * 650; const x = 35 + (cut.start / rollLength) * 650; const width = ((cut.end - cut.start) / rollLength) * 650; return <g key={cut.piece_id}>{cut.alignment_gap > 0 && <rect x={gapStart} y="36" width={(cut.alignment_gap / rollLength) * 650} height="54" fill="var(--accent-bg)" stroke="var(--accent)" strokeDasharray="3 2" />}<rect x={x} y="36" width={width} height="54" fill="var(--card)" stroke="var(--ink)" /><text x={x + width / 2} y="68" textAnchor="middle" className="wallpaper-svg-small">{cut.piece_id}</text></g>; })}
  <text x="35" y="116" className="wallpaper-svg-small">{t('wallpaperUi.gapNote')}</text>
</svg>;
};

const CutInstruction = ({ cut, piece, strip, wallIndex, wallNames, progress, toggle, selected, onSelect }) => {
  const { t } = useTranslation();
  const faces = pieceFaces(piece, strip).filter((face) => face.wall_index === wallIndex);
  const notches = faces.flatMap((face) => face.notches.map((notch) => ({ ...notch, left: notch.x_start - face.x_start + face.offset })));
  return <div className="flex items-start gap-3 border-b border-[var(--rule-hair)] py-4"><button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => onSelect(piece.id)} aria-pressed={selected}>
    <span>{selected ? '●' : '○'}</span><span>
      <b>{t('wallpaperUi.cutHeading', { id: cut.piece_id, mm: Math.round(piece.cut_length ?? piece.length) })}</b>
      <small className="block synthetic">{t('wallpaperUi.stripHang', { strip: piece.strip_number, from: Math.round(piece.y_start), to: Math.round(piece.y_end) })}</small>
      <small className="block synthetic">{t('wallpaperUi.rollPosition', { start: Math.round(cut.start), end: Math.round(cut.end), phase: Math.round(cut.phase) })}{cut.alignment_gap > 0 ? ` · ${t('wallpaperUi.leaveGap', { mm: Math.round(cut.alignment_gap) })}` : ''}</small>
      {strip.return_overlap > 0 && faces.some((face) => face.wall_index === strip.segments[strip.segments.length - 1].wall_index) && <small className="block synthetic"><b>{t('wallpaperUi.cornerOverlapLabel')}</b> {t('wallpaperUi.cornerOverlapNote', { mm: Math.round(strip.return_overlap), wall: wallNames[strip.return_wall_index] })}</small>}
      {notches.map((notch, index) => <small className="block synthetic" key={index}><b>{notch.mode === 'mark' ? t('wallpaperUi.markOpeningLabel') : t('wallpaperUi.cutOpeningLabel')}</b> {t('wallpaperUi.openingOffsets', { x1: Math.round(notch.left), x2: Math.round(notch.left + notch.x_end - notch.x_start), y1: Math.round(notch.y_start - piece.y_start), y2: Math.round(notch.y_end - piece.y_start) })}</small>)}
    </span></button><button type="button" className="btn btn-primary btn-sm" onClick={() => toggle('cut', cut.piece_id)}>{progress.includes(cut.piece_id) ? t('wallpaperUi.cutDone') : t('wallpaperUi.markCut')}</button></div>;
};

const text = (value) => (value == null ? '' : String(value));
const restoreWalls = (walls) => walls.map((wall) => ({
  ...wall,
  ...Object.fromEntries(['width_top', 'width_middle', 'width_bottom', 'height_left', 'height_middle', 'height_right', 'lower_left', 'lower_right'].filter((key) => wall[key] != null).map((key) => [key, text(wall[key])])),
  detailedMeasurements: wall.width_top !== wall.width_middle || wall.width_middle !== wall.width_bottom || wall.height_left !== wall.height_middle || wall.height_middle !== wall.height_right,
  confirmed: true,
  cutouts: (wall.cutouts || []).map((cutout) => ({ ...cutout, x: text(cutout.x), y: text(cutout.y), width: text(cutout.width), height: text(cutout.height) })),
}));

const WallpaperOptimizer = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const accountContext = useAccountContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [wallpaper, setWallpaper] = useState({ name: '', manufacturer: '', roll_width: '530', roll_length: '10050', repeat: '0', match: 'straight', price_per_roll: '' });
  const [walls, setWalls] = useState(() => [initialWall(t)]);
  const [corners, setCorners] = useState([]);
  const [closed, setClosed] = useState(false);
  const [patterned, setPatterned] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState(() => t('wallpaperUi.defaultProjectName'));
  const [saved, setSaved] = useState(null);
  const [projectGroups, setProjectGroups] = useState([]);
  const { groupId: projectGroupId, setGroupId: setProjectGroupId, newName: newProjectName, setNewName: setNewProjectName, resolve: resolveProject } = useProjectChoice({
    groups: projectGroups,
    onCreated: (group) => setProjectGroups((current) => [group, ...current]),
    fallbackName: projectName,
  });
  const [progress, setProgress] = useState({ cut: [], hung: [] });
  const [cutWallIndex, setCutWallIndex] = useState(0);
  const [selectedPieceId, setSelectedPieceId] = useState(null);
  const [cornerOverlap, setCornerOverlap] = useState('15');
  // One wall card is open at a time; the others show their summary.
  const [openWall, setOpenWall] = useState(0);
  const [openCorners, setOpenCorners] = useState(() => new Set());
  const [detailsTried, setDetailsTried] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(isDesktop);
  // Account defaults (Defaults tab): spare margin, currency and VAT basis.
  const [spareMargin, setSpareMargin] = useState('10');
  const [pricing, setPricing] = useState({ currency: 'SEK', vatRate: 25, pricesIncludeVat: true });
  const [startChoice, setStartChoice] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const loadedFromProject = useRef(false);
  useEffect(() => { if (user) getProjectGroups().then(setProjectGroups).catch(() => {}); }, [user]);
  useEffect(() => {
    if (!user) return;
    getUserSettings().then((settings) => {
      if (loadedFromProject.current) return;
      setSpareMargin(text(settings.spare_margin_percent ?? 10));
      setPricing({ currency: settings.default_currency || 'SEK', vatRate: settings.default_vat_rate ?? 25, pricesIncludeVat: settings.default_prices_include_vat ?? true });
    }).catch(() => {});
  }, [user]);
  // "Modify" on a saved plan opens /wallpaper?edit=<id>.
  useEffect(() => {
    const editId = new URLSearchParams(location.search).get('edit');
    if (!user || !editId) return;
    getWallpaperProjects().then((projects) => {
      const project = projects.find((item) => String(item.id) === editId);
      if (!project) return;
      const { currency, vat_rate: vatRate, prices_include_vat: includesVat, ...spec } = project.wallpaper_data || {};
      const options = project.options_data || {};
      loadedFromProject.current = true;
      setWallpaper({ ...spec, roll_width: text(spec.roll_width), roll_length: text(spec.roll_length), repeat: text(spec.repeat ?? 0), match: spec.match || 'straight', price_per_roll: text(spec.price_per_roll) });
      setPatterned(Number(spec.repeat) > 0);
      setWalls(restoreWalls(project.room_data.walls));
      setOpenWall(project.room_data.walls.length === 1 ? 0 : null);
      setCorners((project.room_data.corners || []).map((corner) => ({ ...corner, confirmed_continuation: corner.confirmed_continuation || '' })));
      setClosed(!!project.room_data.closed);
      setCornerOverlap(text(options.corner_overlap ?? 15));
      setSpareMargin(text(options.spare_margin ?? 10));
      setStartChoice(options.start || null);
      setPricing({ currency: currency || 'SEK', vatRate: vatRate ?? 25, pricesIncludeVat: includesVat ?? true });
      setPlan(project.plan_result);
      setProgress(project.progress_data?.cut ? project.progress_data : { cut: [], hung: [] });
      setProjectName(project.name);
      setProjectGroupId(project.project_group_id ? String(project.project_group_id) : '');
      setEditingId(project.id);
      setStep(project.plan_result ? 2 : 1);
      navigate(location.pathname, { replace: true });
    }).catch(() => {});
  }, [user, location.pathname, location.search, navigate]);
  const updateWall = (index, field, value) => setWalls(walls.map((wall, i) => i === index ? withDerivedMiddle({ ...wall, [field]: value }) : wall));
  const updateWallDimension = (index, dimension, value) => setWalls(walls.map((wall, current) => {
    if (current !== index) return wall;
    const fields = dimension === 'width'
      ? ['width_top', 'width_middle', 'width_bottom']
      : ['height_left', 'height_middle', 'height_right'];
    return { ...wall, ...Object.fromEntries(fields.map((field) => [field, value])) };
  }));
  const toggleOpenWall = (index, open) => setWalls(walls.map((wall, i) => i !== index ? wall : open ? { ...wall, skip: true, profile: 'rectangle', cutouts: [], height_left: '2400', height_middle: '2400', height_right: '2400' } : { ...wall, skip: false }));
  const updateCutout = (wallIndex, cutoutIndex, field, value) => setWalls(walls.map((wall, index) => index !== wallIndex ? wall : { ...wall, cutouts: wall.cutouts.map((cutout, current) => {
    if (current !== cutoutIndex) return cutout;
    return field === 'kind' ? changeCutoutKind(cutout, value) : { ...cutout, [field]: value };
  }) }));
  const removeCutout = (wallIndex, cutoutIndex) => setWalls(walls.map((wall, index) => index !== wallIndex ? wall : { ...wall, cutouts: wall.cutouts.filter((_, current) => current !== cutoutIndex) }));
  const addWall = () => {
    setWalls([...walls, { ...initialWall(t), name: wallLetter(walls.length, t) }]);
    setOpenWall(walls.length);
    setCorners(closed ? [...corners.slice(0, -1), initialCorner(), corners[corners.length - 1]] : [...corners, initialCorner()]);
  };
  const toggleClosed = (value) => {
    setClosed(value);
    setCorners(value ? [...corners, initialCorner()] : corners.slice(0, -1));
    setError('');
  };
  const removeWall = (wallIndex) => {
    if (walls.length === 1) return;
    setWalls(walls.filter((_, index) => index !== wallIndex));
    setOpenWall(null);
    setOpenCorners(new Set());
    // Removing a wall reopens a closed room, so the user re-confirms the closing corner.
    const openCorners = closed ? corners.slice(0, -1) : corners;
    setClosed(false);
    if (wallIndex === 0) {
      setCorners(openCorners.slice(1));
    } else if (wallIndex === walls.length - 1) {
      setCorners(openCorners.slice(0, -1));
    } else {
      setCorners([
        ...openCorners.slice(0, wallIndex - 1),
        initialCorner(),
        ...openCorners.slice(wallIndex + 1),
      ]);
    }
    setError('');
  };
  const updateCorner = (index, update) => {
    setCorners(corners.map((corner, current) => current === index ? { ...corner, ...update } : corner));
    setError('');
  };
  // Corners beside an open wall have no paper to join, so they need no hanging decision.
  const needsDecision = (index) => {
    const corner = corners[index];
    return corner.kind !== 'none' && !corner.confirmed_continuation && !walls[index].skip && !walls[(index + 1) % walls.length].skip;
  };
  const payload = useMemo(() => ({
    wallpaper: { ...wallpaper, roll_width: numeric(wallpaper.roll_width), roll_length: numeric(wallpaper.roll_length), repeat: patterned ? numeric(wallpaper.repeat) : 0, match: patterned ? wallpaper.match : null, price_per_roll: wallpaper.price_per_roll === '' ? null : numeric(wallpaper.price_per_roll) },
    room: { walls: walls.map(({ cutouts = [], detailedMeasurements: _detailedMeasurements, lower_left: lowerLeft, lower_right: lowerRight, ...wall }) => ({ ...wall, ...(wall.profile === 'sloped' ? { lower_left: numeric(lowerLeft), lower_right: numeric(lowerRight) } : {}), ...Object.fromEntries(Object.entries(wall).map(([key, value]) => [key, key.startsWith('width_') || key.startsWith('height_') ? numeric(value) : value])), cutouts: cutouts.map((cutout) => ({ ...cutout, x: numeric(cutout.x), y: numeric(cutout.y), width: numeric(cutout.width), height: numeric(cutout.height) })) })), corners: corners.map((corner) => ({ ...corner, confirmed_continuation: corner.confirmed_continuation || null })), closed },
    allowances: { corner: numeric(cornerOverlap) },
    safety_margin_percent: numeric(spareMargin),
  }), [wallpaper, walls, corners, patterned, closed, cornerOverlap, spareMargin]);
  const makePlan = async () => {
    const overlapError = overlapIssue(cornerOverlap, t);
    if (overlapError) {
      setError(overlapError);
      return;
    }
    if (walls.every((wall) => wall.skip)) {
      setError(t('wallpaperUi.errNeedWall'));
      return;
    }
    if (corners.some((corner, index) => needsDecision(index))) {
      setError(t('wallpaperUi.errConfirmCorners'));
      return;
    }
    const invalidWall = walls.filter((wall) => !wall.skip).find((wall) => {
      const width = Math.max(numeric(wall.width_top), numeric(wall.width_middle), numeric(wall.width_bottom));
      const height = Math.max(numeric(wall.height_left), numeric(wall.height_middle), numeric(wall.height_right));
      return (wall.cutouts || []).some((cutout) => numeric(cutout.x) < 0 || numeric(cutout.y) < 0 || numeric(cutout.width) <= 0 || numeric(cutout.height) <= 0 || numeric(cutout.x) + numeric(cutout.width) > width || numeric(cutout.y) + numeric(cutout.height) > height);
    });
    if (invalidWall) {
      setError(t('wallpaperUi.errOpeningsFit', { wall: invalidWall.name }));
      return;
    }
    try { setError(''); const result = await createWallpaperPlan(payload); setStartChoice(null); setPlan(result); setStep(2); } catch (err) { setError(err.message); }
  };
  const chooseStart = async (candidate) => {
    const start = { wall_index: candidate.wall_index, first_strip_width: candidate.first_strip_widths[0] };
    try { setError(''); setPlan(await createWallpaperPlan({ ...payload, start })); setStartChoice(start); } catch (err) { setError(err.message); }
  };
  const continueToRoom = () => {
    setError('');
    if (detailsMissing.length) {
      setDetailsTried(true);
      return;
    }
    setDetailsTried(false);
    setStep(1);
  };
  const rollPrice = payload.wallpaper.price_per_roll != null && Number.isFinite(payload.wallpaper.price_per_roll) ? payload.wallpaper.price_per_roll : null;
  const formatMoney = (value) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${pricing.currency}`;
  const save = async () => {
    if (!projectName.trim()) { setError(t('auditUi.nameRequired')); return; }
    try {
      setError('');
      const body = { name: projectName.trim(), project_group_id: await resolveProject(), wallpaper_data: { ...payload.wallpaper, currency: pricing.currency, vat_rate: pricing.vatRate, prices_include_vat: pricing.pricesIncludeVat }, room_data: payload.room, options_data: { corner_overlap: cornerOverlap, spare_margin: spareMargin, start: startChoice }, plan_result: plan, ordered_rolls: plan.rolls_to_buy, progress_data: progress };
      const existingId = saved?.id ?? editingId;
      const result = existingId ? await updateWallpaperProject(existingId, body) : await saveWallpaperProject(body);
      setSaved(result);
      if (user && !isStaticMode()) await saveWallpaper({ name: wallpaper.name, data: payload.wallpaper });
    } catch (err) { setError(err.message); }
  };
  const planInvalid = !!plan && !!plan.closure && !plan.closure.valid;
  const moveSavedPlan = async (group) => {
    try {
      const moved = await movePlanToProject({ ...saved, projectType: 'wallpaper' }, group.id);
      setSaved(moved);
      setProjectGroupId(group.id);
      localStorage.setItem('planqer.lastProjectGroup', group.id);
      return true;
    } catch (err) {
      setError(t('projectUi.moveFailed', { message: err.message }));
      return false;
    }
  };
  const steps = [
    { label: t('common.wallpaperPlanner'), summary: wallpaper.name || t('wallpaperUi.chooseWallpaper'), locked: t('wallpaperUi.chooseWallpaper'), reachable: true },
    { label: t('wallpaperUi.stepRoom'), summary: t('wallpaperUi.wallsMeasured', { count: walls.length }), locked: t('wallpaperUi.measureRoom'), reachable: step >= 1 },
    { label: t('wallpaperUi.stepPlan'), summary: plan ? t(corners.some((corner) => corner.confirmed_continuation === 'continue') || walls.some((wall) => wall.profile === 'sloped') ? 'wallpaperUi.rollsDraft' : 'wallpaperUi.rollsToBuy', { rolls: plan.rolls_to_buy }) : t('wallpaperUi.calcMaterial'), locked: t('wallpaperUi.createPlanLocked'), reachable: !!plan },
    { label: t('wallpaperUi.stepCut'), summary: plan ? t('wallpaperUi.piecesSummary', { pieces: plan.pieces.length }) : t('wallpaperUi.prepareCutSheets'), locked: t('wallpaperUi.choosePlanLocked'), reachable: !!plan && !planInvalid },
    { label: t('workflow.save'), summary: saved ? t('wallpaperUi.savedLocally') : t('wallpaperUi.keepProject'), locked: t('wallpaperUi.prepareCutSheets'), reachable: !!plan && !planInvalid },
  ];
  const hasConnectedCorner = corners.some((corner) => corner.confirmed_continuation === 'continue');
  const hasSlopedWall = walls.some((wall) => wall.profile === 'sloped');
  // Walls that overlap or run into an earlier wall are an error on the later one.
  const { crossings, closesAfter } = wallCrossings(walls, corners, closed);
  const issues = walls.map((wall, index) => {
    const base = wallIssues(wall, t);
    const clashes = crossings.filter((crossing) => crossing.wall === index).map((crossing) => [
      t('wallpaperUi.errWallsCross', { wall: wall.name || wallLetter(index, t), other: walls[crossing.other].name || wallLetter(crossing.other, t) }),
      closesAfter != null && closesAfter < index ? t('wallpaperUi.roomClosesAfter', { wall: walls[closesAfter].name || wallLetter(closesAfter, t) }) : '',
    ].filter(Boolean).join(' '));
    return clashes.length ? { ...base, errors: [...base.errors, ...clashes], hasErrors: true } : base;
  });
  const overlapMessage = overlapIssue(cornerOverlap, t);
  const toggle = (kind, id) => setProgress((current) => ({ ...current, [kind]: current[kind].includes(id) ? current[kind].filter((item) => item !== id) : [...current[kind], id] }));

  // Step 01: required fields, in screen order, with the label used in the status.
  const unitless = (key) => splitUnit(t(key)).text;
  const rollMissing = [
    ['wallpaper-name', wallpaper.name, t('workflow.name')],
    ['wallpaper-manufacturer', wallpaper.manufacturer, t('wallpaperUi.manufacturer')],
    ['wallpaper-roll-width', wallpaper.roll_width, unitless('wallpaperUi.rollWidthMm')],
    ['wallpaper-roll-length', wallpaper.roll_length, unitless('wallpaperUi.rollLengthMm')],
    ['wallpaper-spare-margin', spareMargin, unitless('wallpaperUi.spareMarginPct')],
  ].filter(([, value]) => isBlank(value));
  const patternMissing = patterned && isBlank(wallpaper.repeat) ? [['wallpaper-repeat', '', unitless('wallpaperUi.repeatMm')]] : [];
  const detailsMissing = [...rollMissing, ...patternMissing];
  const flagged = (id) => detailsTried && detailsMissing.some(([fieldId]) => fieldId === id);
  const detailsInput = (id, extra = '') => ({ id, className: `form-input ${extra} ${flagged(id) ? 'form-input-error' : ''}`.replace(/\s+/g, ' ').trim(), 'aria-invalid': flagged(id) || undefined });

  // Step 02: what each wall still needs, and the first thing blocking the plan.
  const wallTitle = (index) => walls[index].name || wallLetter(index, t);
  const wallStates = walls.map((wall, index) => ({
    missing: [
      ...(isBlank(wall.name) ? [t('wallpaperUi.wallNameLabel')] : []),
      ...issues[index].missing.map((group) => unitless(group === 'Width' ? 'wallpaperUi.wallWidthMm' : 'wallpaperUi.wallHeightMm')),
      ...(wall.skip ? [] : (issues[index].cutoutsMissing || []).flatMap((fields, cutoutIndex) => fields.map((field) => `${t(KIND_KEYS[wall.cutouts[cutoutIndex].kind])}: ${unitless({ x: 'wallpaperUi.fromLeftEdge', y: wall.profile === 'sloped' ? 'wallpaperUi.fromLowerEdge' : 'wallpaperUi.fromFloor', width: 'wallpaperUi.widthMm', height: 'wallpaperUi.heightMm' }[field])}`))),
    ],
    hasErrors: issues[index].hasErrors,
  }));
  const wallsDone = wallStates.filter((state) => !state.missing.length && !state.hasErrors).length;
  const showRoomSettings = walls.length >= 3 || corners.length > 0;
  const settingsProblem = corners.length > 0 && !!overlapMessage;
  const cornerEnds = (index) => [wallTitle(index), wallTitle((index + 1) % walls.length)];
  const blocker = (() => {
    const missingAt = wallStates.findIndex((state) => state.missing.length);
    if (missingAt >= 0) return { wall: missingAt, name: wallTitle(missingAt), text: t('wallpaperUi.blockedMissing', { wall: wallTitle(missingAt), fields: wallStates[missingAt].missing.join(', ') }) };
    const errorAt = wallStates.findIndex((state) => state.hasErrors);
    if (errorAt >= 0) return { wall: errorAt, name: wallTitle(errorAt), text: t('wallpaperUi.blockedErrors', { wall: wallTitle(errorAt) }) };
    if (walls.every((wall) => wall.skip)) return { wall: 0, name: wallTitle(0), text: t('wallpaperUi.errNeedWall') };
    const cornerAt = corners.findIndex((corner, index) => needsDecision(index));
    if (cornerAt >= 0) {
      const [from, to] = cornerEnds(cornerAt);
      return { corner: cornerAt, name: `${from} → ${to}`, text: t('wallpaperUi.blockedCorner', { from, to }) };
    }
    if (settingsProblem) return { settings: true, name: t('wallpaperUi.roomSettings'), text: t('wallpaperUi.blockedOverlap') };
    return null;
  })();
  const goTo = (target) => {
    if (target.wall != null) setOpenWall(target.wall);
    if (target.corner != null) setOpenCorners((current) => new Set(current).add(target.corner));
    const id = target.wall != null ? `wall-card-${target.wall}` : target.corner != null ? `corner-${target.corner}` : 'room-settings';
    setTimeout(() => {
      const element = document.getElementById(id);
      if (!element) return;
      element.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      const fields = [...element.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select')];
      (fields.find((field) => !field.value) || fields[0] || element.querySelector('button'))?.focus({ preventScroll: true });
    }, 0);
  };
  const toggleCorner = (index) => setOpenCorners((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });
  const wallSummary = (wall) => {
    const width = isBlank(wall.width_top) ? '—' : wall.width_top;
    const size = wall.skip
      ? `${width} mm · ${t('wallpaperUi.noWallpaperShort')}`
      : wall.profile === 'sloped'
        ? `${width} mm · ${t('wallpaperUi.shapeSloped').toLowerCase()}`
        : `${width} × ${isBlank(wall.height_left) ? '—' : wall.height_left} mm`;
    const openings = wall.skip ? 0 : (wall.cutouts || []).length;
    return openings ? `${size} · ${t('wallpaperUi.openingCount', { count: openings })}` : size;
  };
  const cornerSummary = (corner, index) => {
    const name = corner.kind === 'outside' ? t('wallpaperUi.cornerOutside') : t('wallpaperUi.cornerInside');
    if (corner.kind === 'none') return t('wallpaperUi.cornerSeparate');
    if (walls[index].skip || walls[(index + 1) % walls.length].skip) return `${name} · ${t('wallpaperUi.cornerNoPaper')}`;
    if (needsDecision(index)) return `${name} · ${t('wallpaperUi.cornerDecisionNeeded')}`;
    const action = {
      overlap: t('wallpaperUi.cornerOverlapShort', { mm: cornerOverlap || 0 }),
      start_new: t('wallpaperUi.cornerNewStrip'),
      continue: corner.kind === 'outside' ? t('wallpaperUi.cornerWraps') : t('wallpaperUi.cornerContinues'),
    }[corner.confirmed_continuation];
    return `${name} · ${action}`;
  };
  return <CatalogPage>
    <style>{`@media (max-width: 767px) { .wallpaper-measured-sheet, .wallpaper-piece-sheet { box-sizing: border-box; max-width: 100%; overflow-x: auto; overscroll-behavior-inline: contain; } .wallpaper-measured-sheet { margin-inline: -16px; padding-inline: 16px; } .wallpaper-measured-sheet > svg { min-width: 620px; } .wallpaper-piece-sheet { min-width: 0; } .wallpaper-piece-sheet > svg { display: block; min-width: 500px; } } @media print { .plan-steps, nav, .step-head > button, .step-foot, .btn { display: none !important; } .step-view { max-width: none !important; } .wallpaper-wall-drawing { break-inside: avoid; page-break-inside: avoid; } }`}</style>
    <PlanSteps steps={steps} current={step} onSelect={setStep} />
    {error && <div className="alert-danger" role="alert">{error}</div>}
    {step === 0 && <section className="step-view is-form">
      <div className="step-head"><div>
        <h1 className="step-h1">{t('wallpaperUi.detailsTitle')}</h1>
        <p className="step-lede">{t('wallpaperUi.detailsLede')}</p>
        <p className="form-legend"><span className="req-mark" aria-hidden="true" />{t('formUi.requiredLegend')}</p>
      </div></div>
      <section className="sec-card" aria-labelledby="wallpaper-roll-title">
        <div className="sec-card-head"><span className="sec-card-text"><h2 id="wallpaper-roll-title" className="sec-card-title">{t('wallpaperUi.sectionRoll')}</h2></span><SectionStatus missing={rollMissing.map(([, , label]) => label)} /></div>
        <div className="sec-card-body grid gap-x-6 gap-y-4 md:grid-cols-2">
          <FormField label={t('workflow.name')} required><input {...detailsInput('wallpaper-name')} value={wallpaper.name} onChange={(event) => setWallpaper({ ...wallpaper, name: event.target.value })} /></FormField>
          <FormField label={t('wallpaperUi.manufacturer')} required><input {...detailsInput('wallpaper-manufacturer')} value={wallpaper.manufacturer} onChange={(event) => setWallpaper({ ...wallpaper, manufacturer: event.target.value })} /></FormField>
          <FormField label={t('wallpaperUi.rollWidthMm')} required><input {...detailsInput('wallpaper-roll-width', 'dimension-input')} inputMode="numeric" value={wallpaper.roll_width} onChange={(event) => setWallpaper({ ...wallpaper, roll_width: event.target.value })} /></FormField>
          <FormField label={t('wallpaperUi.rollLengthMm')} required><input {...detailsInput('wallpaper-roll-length', 'dimension-input')} inputMode="numeric" value={wallpaper.roll_length} onChange={(event) => setWallpaper({ ...wallpaper, roll_length: event.target.value })} /></FormField>
          <FormField label={t('wallpaperUi.spareMarginPct')} required tip={t('wallpaperUi.spareMarginHelp')}><input {...detailsInput('wallpaper-spare-margin', 'dimension-input')} inputMode="decimal" value={spareMargin} onChange={(event) => setSpareMargin(event.target.value)} /></FormField>
          <FormField label={t('wallpaperUi.pricePerRoll')} unit={pricing.currency} optional tip={t('wallpaperUi.priceHelp', { currency: pricing.currency })}><input className="form-input dimension-input" inputMode="decimal" value={wallpaper.price_per_roll} onChange={(event) => setWallpaper({ ...wallpaper, price_per_roll: event.target.value })} /></FormField>
        </div>
      </section>
      <section className="sec-card" aria-labelledby="wallpaper-pattern-title">
        <div className="sec-card-head"><span className="sec-card-text"><h2 id="wallpaper-pattern-title" className="sec-card-title">{t('wallpaperUi.sectionPattern')}</h2></span><SectionStatus missing={patternMissing.map(([, , label]) => label)} /></div>
        <div className="sec-card-body">
          <label className="flex items-center gap-2" style={{ fontSize: '13.5px', fontWeight: 600 }}><input type="checkbox" checked={patterned} onChange={() => setPatterned(!patterned)} /> {t('wallpaperUi.hasRepeat')}</label>
          {patterned && <div className="grid gap-x-6 gap-y-4 md:grid-cols-2" style={{ marginTop: '16px' }}>
            <FormField label={t('wallpaperUi.repeatMm')} required><input {...detailsInput('wallpaper-repeat', 'dimension-input')} inputMode="numeric" value={wallpaper.repeat} onChange={(event) => setWallpaper({ ...wallpaper, repeat: event.target.value })} /></FormField>
            <FormField label={t('wallpaperUi.match')} required><select className="form-select" value={wallpaper.match} onChange={(event) => setWallpaper({ ...wallpaper, match: event.target.value })}><option value="straight">{t('wallpaperUi.matchStraight')}</option><option value="half_drop">{t('wallpaperUi.matchHalfDrop')}</option></select></FormField>
          </div>}
        </div>
      </section>
      <div className="step-foot">
        {detailsTried && detailsMissing.length > 0 && <p className="step-foot-note synthetic" role="alert">{t('formUi.fillRequired', { fields: detailsMissing.map(([, , label]) => label).join(', ') })} <button type="button" className="btn-link" onClick={() => document.getElementById(detailsMissing[0][0])?.focus()}>{t('formUi.goTo', { name: detailsMissing[0][2] })}</button></p>}
        <button className="btn-order step-foot-act" onClick={continueToRoom}>{`${t('wallpaperUi.measureRoom')} →`}</button>
      </div>
    </section>}
    {step === 1 && <section className="step-view">
      <div className="step-head"><div>
        <h1 className="step-h1">{t('wallpaperUi.measureRoom')}</h1>
        <p className="step-lede">{t('wallpaperUi.roomLede')}<InfoTip label={t('wallpaperUi.measureRoom')}>{t('wallpaperUi.roomNote')}</InfoTip></p>
        <p className="form-legend"><span className="req-mark" aria-hidden="true" />{t('formUi.requiredLegend')}</p>
      </div></div>
      <div className="grid gap-x-10 gap-y-4 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)]">
        <div className="lg:order-2 lg:sticky lg:top-[100px] lg:self-start">
          <nav className="room-nav" aria-label={t('wallpaperUi.thisRoom')}>
            <div className="room-nav-head"><span>{t('wallpaperUi.thisRoom')}</span><span>{t('wallpaperUi.wallsDone', { done: wallsDone, total: walls.length })}</span></div>
            <ol>
              {walls.map((wall, index) => {
                const state = wallStates[index];
                return <li key={index}><button type="button" className="room-nav-item" aria-current={openWall === index ? 'true' : undefined} onClick={() => goTo({ wall: index })}>
                  <span className={`sec-card-badge ${wall.skip ? 'is-skip' : ''}`} aria-hidden="true">{letterOf(index)}</span>{wallTitle(index)}
                  {state.hasErrors ? <span className="room-nav-state is-error">{t('wallpaperUi.statusCheck')}</span>
                    : state.missing.length ? <span className="room-nav-state">{t('formUi.toFill', { count: state.missing.length })}</span>
                      : <span className="room-nav-state is-done"><span aria-hidden="true">✓</span><span className="sr-only">{t('formUi.complete')}</span></span>}
                </button></li>;
              })}
              {showRoomSettings && <li><button type="button" className="room-nav-item" onClick={() => goTo({ settings: true })}>
                <span className="sec-card-badge is-skip" aria-hidden="true">⚙</span>{t('wallpaperUi.roomSettings')}
                {settingsProblem ? <span className="room-nav-state is-error">{t('wallpaperUi.statusCheck')}</span> : <span className="room-nav-state is-done"><span aria-hidden="true">✓</span><span className="sr-only">{t('formUi.complete')}</span></span>}
              </button></li>}
            </ol>
          </nav>
          <details className="room-preview-fold" open={previewOpen} onToggle={(event) => setPreviewOpen(event.currentTarget.open)}>
            <summary>{t('wallpaperUi.roomPreview')}</summary>
            <aside aria-label={t('wallpaperUi.roomPreview')}><RoomOverview walls={walls} corners={corners} closed={closed} activeWallIndex={openWall} clashingWalls={crossings.map((crossing) => crossing.wall)} showStart /></aside>
          </details>
        </div>
        <div className="min-w-0 lg:order-1">
          {walls.map((wall, index) => {
            const open = openWall === index;
            const state = wallStates[index];
            const origin = wall.profile === 'sloped' ? t('wallpaperUi.originLocalLower') : t('wallpaperUi.originBottomLeft');
            return <Fragment key={index}>
              <section id={`wall-card-${index}`} className={`sec-card ${open ? 'is-open' : ''}`}>
                <h2 className="m-0"><button type="button" className={`sec-card-head ${open ? '' : 'is-closed'}`} aria-expanded={open} aria-controls={`wall-body-${index}`} onClick={() => setOpenWall(open ? null : index)}>
                  <span className={`sec-card-badge ${wall.skip ? 'is-skip' : ''}`} aria-hidden="true">{letterOf(index)}</span>
                  <span className="sec-card-text"><span className="sec-card-title">{wallTitle(index)}</span><span className="sr-only">, </span><span className="sec-card-summary">{wallSummary(wall)}</span></span>
                  <span className="sr-only">, </span><SectionStatus missing={state.missing} error={state.hasErrors ? t('wallpaperUi.statusCheck') : null} />
                  {open ? <span className="sec-card-chevron" aria-hidden="true" /> : <span className="sec-card-change" aria-hidden="true">{t('formUi.change')}</span>}
                </button></h2>
                {open && <div id={`wall-body-${index}`} className="sec-card-body">
                  <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
                    <FormField label={t('wallpaperUi.wallNameLabel')} required className="md:col-span-2"><input className="form-input" value={wall.name} onChange={(event) => updateWall(index, 'name', event.target.value)} /></FormField>
                    <label className="flex items-center gap-2 md:col-span-2" style={{ fontSize: '13.5px', fontWeight: 600 }}><input type="checkbox" checked={!!wall.skip} onChange={(event) => toggleOpenWall(index, event.target.checked)} />{t('wallpaperUi.noWallpaperOnWall')}</label>
                    {wall.profile !== 'sloped' && <FormField label={t('wallpaperUi.wallWidthMm')} required><input className="form-input dimension-input" inputMode="numeric" value={wall.width_top} onChange={(event) => updateWallDimension(index, 'width', event.target.value)} /></FormField>}
                    {wall.profile !== 'sloped' && !wall.skip && <FormField label={t('wallpaperUi.wallHeightMm')} required><input className="form-input dimension-input" inputMode="numeric" value={wall.height_left} onChange={(event) => updateWallDimension(index, 'height', event.target.value)} /></FormField>}
                  </div>
                  {wall.skip ? issues[index].errors.map((message) => <p key={message} role="alert" className="synthetic" style={{ color: 'var(--revision)', marginTop: '12px' }}>{message}</p>) : <>
                    <fieldset style={{ marginTop: '16px' }}><legend className="form-label">{t('wallpaperUi.wallShape')}<span className="req-mark" aria-hidden="true" /></legend><div className="grid gap-3 md:grid-cols-2">{wallShapes.map(([profile, labelKey]) => <label key={profile} className="choice-tile"><input type="radio" name={`wall-shape-${index}`} checked={(wall.profile || 'rectangle') === profile} onChange={() => setWalls(walls.map((current, currentIndex) => { if (currentIndex !== index) return current; const left = numeric(current.height_left); const flat = left === numeric(current.height_right); return withDerivedMiddle({ ...current, profile, ...(profile === 'sloped' ? { ...(flat ? { height_right: String(Math.max(left - 600, 300)) } : {}), lower_left: current.lower_left ?? '0', lower_right: current.lower_right ?? '0' } : {}) }); }))} /><ShapeIcon profile={profile} /><span>{t(labelKey)}</span></label>)}</div></fieldset>
                    {wall.profile === 'sloped' && <div style={{ marginTop: '16px' }}><p className="synthetic">{t('wallpaperUi.slopedHelp')}</p><WallOutlineEditor wall={wall} onChange={(update) => setWalls(walls.map((current, currentIndex) => currentIndex === index ? withDerivedMiddle({ ...current, ...update }) : current))} /></div>}
                    <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--rule-hair)' }}>
                      <div className="flex items-center"><h3 className="section-title" style={{ margin: 0 }}>{t('wallpaperUi.openingsTitle')}</h3>{' '}<span className="opt-mark">{t('formUi.optionalMark')}</span><InfoTip label={t('wallpaperUi.openingsTitle')}>{t('wallpaperUi.everyPosition', { origin })}</InfoTip></div>
                      {(wall.cutouts || []).map((cutout, cutoutIndex) => <div key={cutoutIndex} style={{ padding: '12px 0', borderBottom: '1px solid var(--rule-hair)' }}>
                        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                          <FormField label={t('wallpaperUi.type')} className="w-[220px] max-w-full"><select className="form-select" value={cutout.kind} onChange={(event) => updateCutout(index, cutoutIndex, 'kind', event.target.value)}>{Object.entries(KIND_KEYS).map(([kind, kindKey]) => <option key={kind} value={kind}>{t(kindKey)}</option>)}</select></FormField>
                          {cutout.kind === 'custom' && <FormField label={t('wallpaperUi.customName')} className="min-w-[160px] flex-1"><input className="form-input" value={cutout.label || ''} onChange={(event) => updateCutout(index, cutoutIndex, 'label', event.target.value)} /></FormField>}
                          <button type="button" className="btn-text is-quiet ml-auto" onClick={() => removeCutout(index, cutoutIndex)}>{t('common.remove')}</button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 items-end gap-x-3 gap-y-3 md:grid-cols-4">
                          <FormField label={t('wallpaperUi.fromLeftEdge')} fill required><input className="form-input" inputMode="numeric" value={cutout.x} onChange={(event) => updateCutout(index, cutoutIndex, 'x', event.target.value)} /></FormField>
                          <FormField label={wall.profile === 'sloped' ? t('wallpaperUi.fromLowerEdge') : t('wallpaperUi.fromFloor')} fill required><input className="form-input" inputMode="numeric" value={cutout.y} onChange={(event) => updateCutout(index, cutoutIndex, 'y', event.target.value)} /></FormField>
                          <FormField label={t('wallpaperUi.widthMm')} fill required><input className="form-input" inputMode="numeric" value={cutout.width} onChange={(event) => updateCutout(index, cutoutIndex, 'width', event.target.value)} /></FormField>
                          <FormField label={t('wallpaperUi.heightMm')} fill required><input className="form-input" inputMode="numeric" value={cutout.height} onChange={(event) => updateCutout(index, cutoutIndex, 'height', event.target.value)} /></FormField>
                        </div>
                        {issues[index].cutouts[cutoutIndex] && <p role="alert" className="synthetic" style={{ color: 'var(--revision)', marginTop: '8px' }}>{issues[index].cutouts[cutoutIndex]}</p>}
                      </div>)}
                      <button type="button" className="btn-text" style={{ marginTop: '10px' }} onClick={() => updateWall(index, 'cutouts', [...(wall.cutouts || []), defaultCutout('window')])}><span aria-hidden="true">+</span>{t('wallpaperUi.addOpening')}</button>
                    </div>
                    {issues[index].errors.map((message) => <p key={message} role="alert" className="synthetic" style={{ color: 'var(--revision)', marginTop: '12px' }}>{message}</p>)}
                    {issues[index].warnings.map((message) => <p key={message} className="synthetic" style={{ marginTop: '12px' }}>{message}</p>)}
                  </>}
                  {walls.length > 1 && <div className="sec-card-foot"><button type="button" className="btn-text is-quiet" onClick={() => removeWall(index)} aria-label={t('wallpaperUi.removeWallAria', { name: wall.name })}>{t('wallpaperUi.removeWall')}</button></div>}
                </div>}
              </section>
              {corners[index] && (() => {
                const corner = corners[index];
                const [from, to] = cornerEnds(index);
                const noPaper = walls[index].skip || walls[(index + 1) % walls.length].skip;
                const pending = needsDecision(index);
                const expanded = pending || openCorners.has(index);
                return <div id={`corner-${index}`} className={`corner-link ${corner.kind === 'none' || noPaper ? 'is-quiet' : ''} ${pending ? 'is-pending' : ''}`} style={{ scrollMarginTop: '110px' }}>
                  <div className="corner-link-row">
                    <span><b>{from} → {to}</b> · {cornerSummary(corner, index)}</span>
                    {!pending && <button type="button" className="btn-text" aria-expanded={expanded} aria-controls={`corner-body-${index}`} aria-label={expanded ? undefined : t('wallpaperUi.changeCornerAria', { from, to })} onClick={() => toggleCorner(index)}>{expanded ? t('formUi.done') : t('formUi.change')}</button>}
                  </div>
                  {expanded && <div id={`corner-body-${index}`} className="corner-link-body" role="group" aria-label={t('wallpaperUi.cornerSettingsAria', { from, to })}>
                    <div className="grid gap-4 md:grid-cols-[1fr_1.5fr]">
                      <FormField label={t('wallpaperUi.cornerType')} required><select className="form-select" value={corner.kind} onChange={(event) => updateCorner(index, { kind: event.target.value, confirmed_continuation: defaultContinuation(event.target.value) })}><option value="inside">{t('wallpaperUi.cornerInside')}</option><option value="outside">{t('wallpaperUi.cornerOutside')}</option>{!closed && <option value="none">{t('wallpaperUi.noCornerOption')}</option>}</select></FormField>
                      {corner.kind !== 'none' && noPaper && <p className="synthetic" style={{ alignSelf: 'center' }}>{t('wallpaperUi.noPaperAtCorner')}</p>}
                      {corner.kind !== 'none' && !noPaper && <FormField label={t('wallpaperUi.hangingDecision')} required><select className="form-select" value={corner.confirmed_continuation} onChange={(event) => updateCorner(index, { confirmed_continuation: event.target.value })}>{!corner.confirmed_continuation && <option value="">{t('wallpaperUi.confirmDecision')}</option>}{corner.kind === 'inside' && <option value="overlap">{t('wallpaperUi.optOverlap', { mm: cornerOverlap || 0 })}</option>}<option value="start_new">{corner.kind === 'inside' ? t('wallpaperUi.optStartNewInside') : t('wallpaperUi.optStartNewOutside')}</option><option value="continue">{corner.kind === 'inside' ? t('wallpaperUi.optContinueInside') : t('wallpaperUi.optWrapOutside')}</option></select></FormField>}
                    </div>
                    <p className="synthetic" style={{ marginTop: '10px' }}>{corner.kind === 'none' ? t('wallpaperUi.explainNone') : corner.kind === 'outside' ? t('wallpaperUi.explainOutside') : corner.confirmed_continuation === 'overlap' ? t('wallpaperUi.explainOverlap', { mm: cornerOverlap || 0 }) : corner.confirmed_continuation === 'continue' ? t('wallpaperUi.explainContinue') : t('wallpaperUi.explainButt')}</p>
                  </div>}
                </div>;
              })()}
            </Fragment>;
          })}
          <div style={{ marginTop: '18px' }}><button type="button" className="btn-primary" onClick={addWall}><span aria-hidden="true">+</span>{t('wallpaperUi.addWall')}</button></div>
          {showRoomSettings && <section id="room-settings" className="sec-card" style={{ marginTop: '22px' }} aria-labelledby="room-settings-title">
            <div className="sec-card-head"><span className="sec-card-text"><h2 id="room-settings-title" className="sec-card-title">{t('wallpaperUi.roomSettings')}</h2><span className="sec-card-summary">{`${closed ? t('wallpaperUi.closedRoom') : t('wallpaperUi.openRun')}${corners.length ? ` · ${t('wallpaperUi.overlapSummary', { mm: cornerOverlap || 0 })}` : ''}`}</span></span><SectionStatus error={settingsProblem ? t('wallpaperUi.statusCheck') : null} /></div>
            <div className="sec-card-body grid gap-4">
              {walls.length >= 3 && <label className="flex items-center gap-2" style={{ fontSize: '13.5px', fontWeight: 600 }}><input type="checkbox" checked={closed} disabled={!closed && corners.some((corner) => corner.kind === 'none')} onChange={(event) => toggleClosed(event.target.checked)} />{t('wallpaperUi.closedRoomToggle')}</label>}
              {corners.length > 0 && <div>
                <FormField label={t('wallpaperUi.cornerOverlapMm')} required tip={t('wallpaperUi.cornerOverlapHelp')}><input className={`form-input dimension-input ${overlapMessage ? 'form-input-error' : ''}`} inputMode="numeric" value={cornerOverlap} onChange={(event) => { setCornerOverlap(event.target.value); setError(''); }} aria-invalid={!!overlapMessage} /></FormField>
                {overlapMessage && <p role="alert" className="synthetic" style={{ color: 'var(--revision)', marginTop: '6px' }}>{overlapMessage}</p>}
              </div>}
            </div>
          </section>}
          <div className="step-foot">
            {blocker && <p className="step-foot-note synthetic">{blocker.text} <button type="button" className="btn-link" onClick={() => goTo(blocker)}>{t('formUi.goTo', { name: blocker.name })}</button></p>}
            <button className="btn-order step-foot-act" onClick={makePlan} disabled={!!blocker}>{`${t('wallpaperUi.createPlan')} →`}</button>
          </div>
        </div>
      </div>
    </section>}
    {step === 2 && plan && <section className="step-view"><div className="step-head"><div><h1 className="step-h1">{t('wallpaperUi.planTitle')}</h1><p className="step-lede">{plan.closure && !plan.closure.valid ? t('wallpaperUi.ledeInvalid') : hasSlopedWall ? t('wallpaperUi.ledeSloped') : hasConnectedCorner ? t('wallpaperUi.ledeConnected') : t('wallpaperUi.ledeBuy', { rolls: plan.rolls_to_buy })}</p></div><button className="btn btn-primary" onClick={() => setStep(1)}>{t('wallpaperUi.editMeasurements')}</button></div><div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_250px]"><div>{plan.closure && !plan.closure.valid && <p role="alert" style={{ padding: '12px 16px', border: '1px solid #c0392b', color: '#c0392b', marginBottom: '20px' }}>{plan.closure.message}</p>}{plan.corner_quality?.smallest != null && <section aria-label={t('wallpaperUi.cornerPiecesAria')} data-testid="corner-quality" style={{ marginBottom: '20px' }}><p className="synthetic">{t('wallpaperUi.smallestCorner')} <b>{Math.round(plan.corner_quality.smallest)} mm</b> {t('wallpaperUi.smallestCornerMin', { min: plan.corner_quality.minimum })}{plan.corner_quality.short_corners.length === 0 ? ` ${t('wallpaperUi.allCornersAbove')}` : ''}</p>{plan.corner_quality.short_corners.length > 0 && <ul role="alert" style={{ color: '#c0392b', paddingLeft: '20px' }}>{plan.corner_quality.short_corners.map((corner) => <li key={`${corner.strip}-${corner.from_wall}-${corner.to_wall}`}>{t('wallpaperUi.shortCorner', { strip: corner.strip, mm: Math.round(corner.width), from: corner.from_wall, to: corner.to_wall, action: corner.action })}</li>)}</ul>}</section>}{walls.length > 1 && <RoomOverview walls={walls} corners={plan.corners || payload.room.corners} plan={plan} closed={!!plan.closure} />}<p className="synthetic" style={{ marginBottom: '20px' }}>{t('wallpaperUi.stripKey')}</p>{walls.map((wall, index) => { const wallStrips = plan.strips.filter((strip) => isOnWall(strip, index)); const wallPieces = plan.pieces.filter((piece) => isOnWall(piece, index)); return <Fragment key={index}><section style={{ marginBottom: '32px' }}><div className="section-rule"><h2 className="section-title">{wall.name}</h2><span className="synthetic">{wall.skip ? t('wallpaperUi.noWallpaper') : t('wallpaperUi.stripsPieces', { strips: wallStrips.length, pieces: wallPieces.length })}</span></div>{wall.skip ? <p className="synthetic" data-testid="no-wallpaper-wall" style={{ padding: '14px 16px', border: '1px dashed var(--ink-3)', background: 'var(--ground-2)' }}>{t('wallpaperUi.noWallpaperWall', { width: wall.width_top })}</p> : <><WallElevation wall={wall} wallIndex={index} plan={plan} wallNames={walls.map((item) => item.name)} /><dl className="grid gap-3 md:grid-cols-3"><div><dt className="form-label">{wall.detailedMeasurements ? t('wallpaperUi.widthsDetailed') : t('wallpaperUi.measuredWidth')}</dt><dd>{wall.detailedMeasurements ? `${wall.width_top} / ${wall.width_middle} / ${wall.width_bottom} mm` : `${wall.width_top} mm`}</dd></div><div><dt className="form-label">{wall.detailedMeasurements ? t('wallpaperUi.heightsDetailed') : t('wallpaperUi.heights')}</dt><dd>{wall.detailedMeasurements ? `${wall.height_left} / ${wall.height_middle} / ${wall.height_right} mm` : `${wall.height_left} / ${wall.height_right} mm`}</dd></div><div><dt className="form-label">{t('workflow.openings')}</dt><dd>{(wall.cutouts || []).length || t('wallpaperUi.none')}</dd></div></dl></>}</section>{index < walls.length - 1 && <CornerConnection from={wall.name} to={walls[index + 1].name} corner={plan.corners?.[index] || payload.room.corners[index]} link={plan.strips.find((strip) => { const all = segmentsOf(strip); return all.some((segment, position) => segment.wall_index === index && all[position + 1]?.wall_index === index + 1); })?.number} overlap={plan.strips.find((strip) => strip.return_wall_index === index + 1 && strip.segments?.[strip.segments.length - 1]?.wall_index === index)?.return_overlap} />}</Fragment>; })}{[...new Set(plan.warnings)].map((warning) => <p className="synthetic" key={warning}>{warning}</p>)}</div><section aria-label={t('wallpaperUi.materialSummary')}><div className="section-rule"><h2 className="section-title">{t('wallpaperUi.materialSummary')}</h2></div><p><b>{t(hasSlopedWall || hasConnectedCorner ? 'wallpaperUi.rollsDraft' : 'wallpaperUi.rollsToBuy', { rolls: plan.rolls_to_buy })}</b></p><p className="synthetic" data-testid="spare-rolls">{t('wallpaperUi.rollsNeeded', { rolls: plan.rolls_needed })} {plan.rolls_to_buy > plan.rolls_needed ? t('wallpaperUi.rollsSpare', { spare: plan.rolls_to_buy - plan.rolls_needed, margin: text(spareMargin) }) : t('wallpaperUi.noSpareMargin')}</p>{rollPrice != null && <p data-testid="estimated-cost">{t('wallpaperUi.estimatedCost')} <b>{formatMoney(plan.rolls_to_buy * rollPrice)}</b><span className="synthetic" style={{ display: 'block' }}>{t('wallpaperUi.costBreakdown', { rolls: plan.rolls_to_buy, price: formatMoney(rollPrice), vat: pricing.pricesIncludeVat ? t('ui.includingVat') : t('ui.excludingVat'), rate: pricing.vatRate })}</span></p>}{plan.material && <><p className="synthetic">{t('wallpaperUi.wasteSummary', { percent: Math.round(((plan.waste.pattern + plan.waste.offcut) / plan.material.bought_length) * 100) })}</p><dl className="cat-table">{[[t('wallpaperUi.wastePattern'), plan.waste.pattern, t('wallpaperUi.wastePatternHelp')], [t('wallpaperUi.wasteEnds'), plan.waste.offcut, t('wallpaperUi.wasteEndsHelp')], [t('wallpaperUi.wasteAllowance'), plan.waste.allowance, t('wallpaperUi.wasteAllowanceHelp')]].map(([name, value, help]) => <div className="flex justify-between border-b border-[var(--rule-hair)] py-2" key={name} title={help}><dt>{name}</dt><dd>{Math.round(value)} mm · {Math.round((value / plan.material.bought_length) * 100)}%</dd></div>)}</dl><p className="synthetic" data-testid="offcut-reuse" style={{ marginTop: '12px' }}>{leftoverSentence(plan.material, t)}</p>{rollFitHint(plan.material.fit, numeric(wallpaper.roll_length), patterned ? numeric(wallpaper.repeat) : 0, t) && <p className="synthetic" data-testid="roll-fit-hint">{rollFitHint(plan.material.fit, numeric(wallpaper.roll_length), patterned ? numeric(wallpaper.repeat) : 0, t)}</p>}{plan.waste.trim > 0 && <p className="synthetic" data-testid="opening-trim">{t('wallpaperUi.openingTrim', { mm: Math.round(plan.waste.trim) })}</p>}</>}{plan.start_candidates?.length > 1 && <div data-testid="start-options" style={{ marginTop: '20px' }}><h3 className="section-title">{t('wallpaperUi.whereToStart')}</h3><p className="synthetic">{t('wallpaperUi.startTried', { widths: plan.start_candidates.length })}</p><dl className="cat-table">{plan.start_candidates.slice(0, 5).map((candidate, position) => <div className="flex items-center justify-between gap-2 border-b border-[var(--rule-hair)] py-2" key={candidate.first_strip_widths.join('-')}><dt>{t('wallpaperUi.firstStripWidth', { mm: Math.round(candidate.first_strip_widths[0]) })}<span className="synthetic" style={{ display: 'block' }}>{t('wallpaperUi.startDetail', { rolls: candidate.rolls_needed, mm: Math.round(candidate.narrowest_strip) })}{candidate.feasible ? '' : ` · ${t('wallpaperUi.needsAttention')}`}</span></dt><dd>{position === 0 ? <b>{t('wallpaperUi.chosen')}</b> : <button type="button" className="btn btn-primary btn-sm" onClick={() => chooseStart(candidate)}>{t('wallpaperUi.use')}</button>}</dd></div>)}</dl></div>}</section></div><div className="step-foot"><button className="btn-text" onClick={() => setStep(1)}><ArrowLeft /> {t('wallpaperUi.backToMeasurements')}</button><button className="btn-order step-foot-act" onClick={() => setStep(3)} disabled={planInvalid}>{`${t('wallpaperUi.prepareCutSheets')} →`}</button></div>{planInvalid && <p className="synthetic" style={{ marginTop: '12px', textAlign: 'right' }}>{t('wallpaperUi.correctRoomMeasurements')}</p>}</section>}
    {step === 3 && plan && <section className="step-view is-form">
      <div className="step-head">
        <div><h1 className="step-h1">{t('wallpaperUi.cutTitle')}</h1><p className="step-lede">{t('wallpaperUi.cutLede')}</p></div>
        <button className="btn btn-primary" onClick={() => window.print()}>{t('projectUi.printOne')}</button>
      </div>
      {walls.length > 1 && <div className="project-view-nav" style={{ marginTop: 0, flexWrap: 'wrap' }}>{walls.map((wall, index) => <button className={`project-view-tab ${cutWallIndex === index ? 'is-active' : ''}`} aria-pressed={cutWallIndex === index} key={wall.name} onClick={() => setCutWallIndex(index)}>{wall.name}</button>)}</div>}
      <section style={{ marginBottom: '24px' }}>
        <div className="section-rule"><h2 className="section-title">{walls[cutWallIndex].name}</h2><span className="synthetic">{t('wallpaperUi.originBottomLeftLabel')}</span></div>
        <div className="wallpaper-measured-sheet"><WallElevation wall={walls[cutWallIndex]} wallIndex={cutWallIndex} plan={plan} wallNames={walls.map((item) => item.name)} /></div>
      </section>
      <WallpaperPieceGallery pieces={plan.pieces.filter((piece) => isOnWall(piece, cutWallIndex))} strips={plan.strips} repeat={numeric(wallpaper.repeat)} wallNames={walls.map((item) => item.name)} openId={selectedPieceId} onOpen={setSelectedPieceId} />
      {plan.rolls.filter((roll) => roll.cuts.some((cut) => isOnWall(plan.pieces.find((piece) => piece.id === cut.piece_id) || {}, cutWallIndex))).map((roll) => <section key={roll.number} style={{ marginTop: '24px' }}>
        <div className="section-rule"><h2 className="section-title">{t('wallpaperUi.rollTitle', { number: roll.number })}</h2></div>
        <RollDiagram roll={roll} rollLength={numeric(wallpaper.roll_length)} pieces={plan.pieces} wallIndex={cutWallIndex} />
        <div className="cat-table">{roll.cuts.filter((cut) => isOnWall(plan.pieces.find((piece) => piece.id === cut.piece_id) || {}, cutWallIndex)).map((cut) => {
          const piece = plan.pieces.find((current) => current.id === cut.piece_id);
          const strip = plan.strips.find((current) => current.number === piece.strip_number);
          return <CutInstruction key={cut.piece_id} cut={cut} piece={piece} strip={strip} wallIndex={cutWallIndex} wallNames={walls.map((item) => item.name)} progress={progress.cut} toggle={toggle} selected={selectedPieceId === piece.id} onSelect={setSelectedPieceId} />;
        })}</div>
      </section>)}
      <div className="step-foot"><button className="btn-text" onClick={() => setStep(2)}><ArrowLeft /> {t('workflow.backToPlan')}</button><button className="btn-order step-foot-act" onClick={() => setStep(4)}>{`${t('workflow.savePlan')} →`}</button></div>
    </section>}
    {step === 4 && plan && (saved ? <section className="step-view"><div className="step-head"><div><h1 className="step-h1">{t('workflow.planSaved')}</h1><p className="step-lede">{t('wallpaperUi.savedLede')}</p></div></div><div className="saved-mark"><Tick size={16} /><div><b>{t('workflow.savedAs', { name: projectName })}</b><p>{projectGroupId ? t('wallpaperUi.filedUnder', { name: projectGroups.find((group) => String(group.id) === String(projectGroupId))?.name || t('wallpaperUi.selectedProject') }) : `${t('ui.notInProject')}.`}</p><MovePlanMenu groups={projectGroups} currentGroupId={saved.project_group_id} onMove={moveSavedPlan} /></div></div><div className="step-foot"><button className="btn-text" onClick={() => setStep(3)}><ArrowLeft /> {t('wallpaperUi.backToCutSheets')}</button><button className="btn-order step-foot-act" onClick={() => navigate('/dashboard')}>{t('wallpaperUi.openDashboard')}</button></div></section> : <section className="step-view is-form"><div className="step-head"><div><h1 className="step-h1">{t('workflow.saveThisPlan')}</h1><p className="step-lede">{t('wallpaperUi.saveLede')}</p>{rollPrice != null && <p className="synthetic" data-testid="save-estimated-cost">{t('wallpaperUi.saveEstimatedCost', { cost: formatMoney(plan.rolls_to_buy * rollPrice), rolls: plan.rolls_to_buy, price: formatMoney(rollPrice) })}</p>}</div></div><SectionCard id="wallpaper-save" title={t('workflow.planDetails')} status={<SectionStatus missing={projectName.trim() ? [] : [t('workflow.planName')]} />}><div style={{ marginBottom: '20px' }}><FormField label={t('workflow.planName')} required><input id="wallpaper-plan-name" className="form-input" value={projectName} onChange={(event) => setProjectName(event.target.value)} /></FormField></div><ProjectPicker groups={projectGroups} value={projectGroupId} onChange={setProjectGroupId} newName={newProjectName} onNewNameChange={setNewProjectName} onSubmit={save} /></SectionCard><div className="step-foot"><button className="btn-text" onClick={() => setStep(3)}><ArrowLeft /> {t('wallpaperUi.backToCutSheets')}</button><button className="btn-order step-foot-act" onClick={save}>{t('workflow.savePlan')}</button></div></section>)}
  </CatalogPage>;
};

export default WallpaperOptimizer;
