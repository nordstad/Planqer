import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CatalogPage from './CatalogPage';
import PlanSteps from './PlanSteps';
import WallOutlineEditor from './WallOutlineEditor';
import { wallIssues, overlapIssue } from '../utils/wallpaperValidation';
import RoomOverview, { linkColour } from './RoomOverview';
import { createWallpaperPlan, getProjectGroups, getUserSettings, getWallpaperProjects, saveWallpaper, saveWallpaperProject, updateWallpaperProject } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const numeric = (value) => Number(value) || 0;
// Plans saved before connected strips have no segments; treat them as one face.
const segmentsOf = (item) => (item.segments?.length ? item.segments : [item]);
const isOnWall = (item, wallIndex) => segmentsOf(item).some((segment) => segment.wall_index === wallIndex);
const legacyFace = (piece, strip) => ({
  wall_index: piece.wall_index,
  x_start: strip.x_start,
  x_end: strip.x_end,
  notches: piece.notches || [],
});

// Drawing-style letters: Wall A, B, … Z, AA. Walls are lettered clockwise from the first wall.
const wallLetter = (index, t) => {
  let letters = '';
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) letters = String.fromCharCode(65 + (n % 26)) + letters;
  return t('wallpaperUi.wallName', { letter: letters });
};

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

const KIND_KEYS = {
  door: 'wallpaperUi.kindDoor', window: 'wallpaperUi.kindWindow', opening: 'wallpaperUi.kindOpening', heat_pump: 'wallpaperUi.kindHeatPump', radiator: 'wallpaperUi.kindRadiator',
  outlet: 'wallpaperUi.kindOutlet', switch: 'wallpaperUi.kindSwitch', pipe: 'wallpaperUi.kindPipe', custom: 'wallpaperUi.kindCustom',
};

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

const WallElevation = ({ wall, wallIndex, plan, wallNames }) => {
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
  const outlinePath = isSloped
    ? `M ${scaleX(0)} ${scaleY(lowerLeft)} L ${scaleX(widthTop)} ${scaleY(lowerRight)} L ${scaleX(widthTop)} ${scaleY(heightRight)} L ${scaleX(0)} ${scaleY(heightLeft)} Z`
    : `M ${scaleX(0)} ${scaleY(0)} L ${scaleX(widthBottom)} ${scaleY(0)} L ${scaleX(widthMiddle)} ${scaleY(heightMiddle / 2)} L ${scaleX(widthTop)} ${scaleY(heightRight)} L ${scaleX(0)} ${scaleY(heightLeft)} Z`;
  const clipId = `wall-outline-${wallIndex}`;
  return <svg viewBox="0 0 720 390" className="wallpaper-wall-drawing" role="img" aria-label={t('wallpaperUi.elevationAria', { name: wall.name })}>
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
        <text x={(left + right) / 2} y="349" textAnchor="middle" className="wallpaper-svg-strip" style={link ? { fill: link.colour, fontWeight: 700 } : undefined}><title>{t('wallpaperUi.stripTitle', { number: segment.number, width: Math.round(segment.x_end - segment.x_start), wall: wall.name })}</title>{label}</text>
      </g>;
    })}
    {!isSloped && (plan?.pieces || []).filter((piece) => isOnWall(piece, wallIndex) && piece.y_end - piece.y_start < height - 1).map((piece) => {
      const segment = segments.find((item) => item.number === piece.strip_number);
      if (!segment) return null;
      const top = scaleY(piece.y_end);
      const bottom = scaleY(piece.y_start);
      return <g key={piece.id} data-testid="partial-piece"><rect x={scaleX(segment.x_start)} y={top} width={scaleX(segment.x_end) - scaleX(segment.x_start)} height={bottom - top} fill="var(--accent)" opacity="0.28" stroke="var(--accent)" strokeWidth="1.5" /><text x={(scaleX(segment.x_start) + scaleX(segment.x_end)) / 2} y={(top + bottom) / 2} textAnchor="middle" dominantBaseline="central" className="wallpaper-svg-small" style={{ fill: 'var(--accent)', fontWeight: 700 }}>{t('wallpaperUi.partialPiece', { height: Math.round(piece.y_end - piece.y_start) })}</text></g>;
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
      return <g key={index}><rect x={x} y={y} width={cutoutWidth} height={cutoutHeight} fill="var(--card)" stroke="var(--ink)" /><text x={x + cutoutWidth / 2} y={y + cutoutHeight / 2 - 10} textAnchor="middle" className="wallpaper-svg-small">{label}</text><text x={x + cutoutWidth / 2} y={y + cutoutHeight / 2 + 5} textAnchor="middle" className="wallpaper-svg-small">{numeric(cutout.width)} × {numeric(cutout.height)} mm</text><text x={x + cutoutWidth / 2} y={y + cutoutHeight / 2 + 20} textAnchor="middle" className="wallpaper-svg-small">{t('wallpaperUi.cutoutPosition', { x: numeric(cutout.x), ref: isSloped ? t('wallpaperUi.refLowerEdge') : t('wallpaperUi.refFloor'), y: numeric(cutout.y) })}</text></g>;
    })}
    <line x1="60" y1="316" x2={scaleX(widthBottom)} y2="316" stroke="var(--ink-3)" markerStart={`url(#wall-arrow-${wallIndex})`} markerEnd={`url(#wall-arrow-${wallIndex})`} /><text x={(60 + scaleX(widthBottom)) / 2} y="311" textAnchor="middle" className="wallpaper-svg-small">{isDetailed ? t('wallpaperUi.widthNearFloor', { mm: Math.round(widthBottom) }) : t('wallpaperUi.wallWidthDim', { mm: Math.round(width) })}</text>
    <line x1="35" y1={scaleY(0)} x2="35" y2={scaleY(heightLeft)} stroke="var(--ink-3)" markerStart={`url(#wall-arrow-${wallIndex})`} markerEnd={`url(#wall-arrow-${wallIndex})`} /><text x="25" y={(scaleY(0) + scaleY(heightLeft)) / 2} textAnchor="middle" transform={`rotate(-90 25 ${(scaleY(0) + scaleY(heightLeft)) / 2})`} className="wallpaper-svg-small">{isDetailed ? t('wallpaperUi.heightAtLeft', { mm: Math.round(heightLeft) }) : t('wallpaperUi.wallHeightDim', { mm: Math.round(height) })}</text>
    <text x="60" y="375" className="wallpaper-svg-small">{t('wallpaperUi.allOpeningsMeasured', { origin: isSloped ? t('wallpaperUi.originLocalLower') : t('wallpaperUi.originBottomLeft') })}</text>
  </svg>;
};

const RollDiagram = ({ roll, rollLength, pieces, wallIndex }) => {
  const { t } = useTranslation();
  return <svg viewBox="0 0 720 130" style={{ width: '100%', maxWidth: '720px', margin: '12px 0' }} role="img" aria-label={t('wallpaperUi.rollAria', { number: roll.number })}>
  <rect x="35" y="36" width="650" height="54" fill="var(--ground-2)" stroke="var(--ink)" />
  {roll.cuts.filter((cut) => isOnWall(pieces.find((piece) => piece.id === cut.piece_id) || {}, wallIndex)).map((cut) => { const gapStart = 35 + ((cut.start - cut.alignment_gap) / rollLength) * 650; const x = 35 + (cut.start / rollLength) * 650; const width = ((cut.end - cut.start) / rollLength) * 650; return <g key={cut.piece_id}>{cut.alignment_gap > 0 && <rect x={gapStart} y="36" width={(cut.alignment_gap / rollLength) * 650} height="54" fill="var(--accent-bg)" stroke="var(--accent)" strokeDasharray="3 2" />}<rect x={x} y="36" width={width} height="54" fill="var(--card)" stroke="var(--ink)" /><text x={x + width / 2} y="68" textAnchor="middle" className="wallpaper-svg-small">{cut.piece_id}</text></g>; })}
  <text x="35" y="116" className="wallpaper-svg-small">{t('wallpaperUi.gapNote')}</text>
</svg>;
};

const pieceFaces = (piece, strip) => {
  let offset = 0;
  const segments = piece.segments?.length ? piece.segments : [legacyFace(piece, strip)];
  return segments.map((segment) => {
    const face = { ...segment, offset, notches: segment.notches || [] };
    offset += segment.x_end - segment.x_start;
    return face;
  });
};

const CutInstruction = ({ cut, piece, strip, wallIndex, wallNames, progress, toggle, selected, onSelect }) => {
  const { t } = useTranslation();
  const faces = pieceFaces(piece, strip).filter((face) => face.wall_index === wallIndex);
  const notches = faces.flatMap((face) => face.notches.map((notch) => ({ ...notch, left: notch.x_start - face.x_start + face.offset })));
  return <div className="flex items-start gap-3 border-b border-[var(--rule-hair)] py-4"><button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => onSelect(piece.id)} aria-pressed={selected}>
    <span>{selected ? '●' : '○'}</span><span>
      <b>{t('wallpaperUi.cutHeading', { id: cut.piece_id, mm: Math.round(piece.length) })}</b>
      <small className="block synthetic">{t('wallpaperUi.stripHang', { strip: piece.strip_number, from: Math.round(piece.y_start), to: Math.round(piece.y_end) })}</small>
      <small className="block synthetic">{t('wallpaperUi.rollPosition', { start: Math.round(cut.start), end: Math.round(cut.end), phase: Math.round(cut.phase) })}{cut.alignment_gap > 0 ? ` · ${t('wallpaperUi.leaveGap', { mm: Math.round(cut.alignment_gap) })}` : ''}</small>
      {strip.return_overlap > 0 && faces.some((face) => face.wall_index === strip.segments[strip.segments.length - 1].wall_index) && <small className="block synthetic"><b>{t('wallpaperUi.cornerOverlapLabel')}</b> {t('wallpaperUi.cornerOverlapNote', { mm: Math.round(strip.return_overlap), wall: wallNames[strip.return_wall_index] })}</small>}
      {notches.map((notch, index) => <small className="block synthetic" key={index}><b>{notch.mode === 'mark' ? t('wallpaperUi.markOpeningLabel') : t('wallpaperUi.cutOpeningLabel')}</b> {t('wallpaperUi.openingOffsets', { x1: Math.round(notch.left), x2: Math.round(notch.left + notch.x_end - notch.x_start), y1: Math.round(notch.y_start - piece.y_start), y2: Math.round(notch.y_end - piece.y_start) })}</small>)}
    </span></button><button type="button" className="btn" onClick={() => toggle('cut', cut.piece_id)}>{progress.includes(cut.piece_id) ? t('wallpaperUi.cutDone') : t('wallpaperUi.markCut')}</button></div>;
};

const PieceDiagram = ({ piece, strip, repeat }) => {
  const { t } = useTranslation();
  const faces = pieceFaces(piece, strip);
  const overlap = strip.return_overlap || 0;
  const faceWidth = strip.width || strip.x_end - strip.x_start;
  const width = faceWidth + overlap;
  const scale = Math.min(230 / width, 280 / piece.length);
  const paperWidth = width * scale;
  const paperHeight = piece.length * scale;
  const left = 270 - paperWidth / 2;
  const top = 55;
  return <svg viewBox="0 0 540 405" className="wallpaper-wall-drawing" role="img" aria-label={t('wallpaperUi.pieceAria', { id: piece.id })}>
    <rect x="0" y="0" width="540" height="405" fill="var(--card)" />
    <text x="28" y="34" className="wallpaper-svg-label">{t('wallpaperUi.pieceStrip', { id: piece.id, number: piece.strip_number })}</text><text x="478" y="34" textAnchor="end" className="wallpaper-svg-accent">{t('wallpaperUi.up')}</text>
    <rect x={left} y={top} width={paperWidth} height={paperHeight} fill="var(--ground-2)" stroke="var(--ink)" strokeWidth="2" />
    {overlap > 0 && <line x1={left + faceWidth * scale} x2={left + faceWidth * scale} y1={top} y2={top + paperHeight} stroke="var(--accent)" strokeDasharray="2 3" />}
    {faces.slice(1).map((face) => <line key={`fold-${face.offset}`} x1={left + face.offset * scale} x2={left + face.offset * scale} y1={top} y2={top + paperHeight} stroke="var(--ink-3)" strokeDasharray="2 3" />)}
    {faces.flatMap((face) => face.notches.map((notch) => ({ ...notch, left: notch.x_start - face.x_start + face.offset }))).map((notch, index) => { const x = left + notch.left * scale; const notchWidth = (notch.x_end - notch.x_start) * scale; const notchHeight = (notch.y_end - notch.y_start) * scale; const y = top + paperHeight - (notch.y_end - piece.y_start) * scale; return <g key={index}><rect x={x} y={y} width={notchWidth} height={notchHeight} fill="var(--card)" stroke="var(--accent)" strokeWidth="2" strokeDasharray={notch.mode === 'mark' ? '5 4' : undefined} /><text x={x + notchWidth / 2} y={y + notchHeight / 2} textAnchor="middle" className="wallpaper-svg-small">{notch.mode === 'mark' ? t('wallpaperUi.markOnWall') : t('wallpaperUi.tableCut')}</text><text x={x + notchWidth / 2} y={y + notchHeight / 2 + 13} textAnchor="middle" className="wallpaper-svg-small">{Math.round(notch.x_end - notch.x_start)} × {Math.round(notch.y_end - notch.y_start)} mm</text></g>; })}
    <line x1={left - 24} y1={top} x2={left - 24} y2={top + paperHeight} stroke="var(--ink-3)" /><text x={left - 32} y={top + paperHeight / 2} textAnchor="middle" transform={`rotate(-90 ${left - 32} ${top + paperHeight / 2})`} className="wallpaper-svg-small">{t('wallpaperUi.precut', { mm: Math.round(piece.length) })}</text>
    <line x1={left} y1={top + paperHeight + 16} x2={left + paperWidth} y2={top + paperHeight + 16} stroke="var(--ink-3)" /><line x1={left} y1={top + paperHeight + 11} x2={left} y2={top + paperHeight + 21} stroke="var(--ink-3)" /><line x1={left + paperWidth} y1={top + paperHeight + 11} x2={left + paperWidth} y2={top + paperHeight + 21} stroke="var(--ink-3)" /><text x={left + paperWidth / 2} y={top + paperHeight + 32} textAnchor="middle" className="wallpaper-svg-small">{overlap > 0 ? t('wallpaperUi.finishedWidthWrap', { width: Math.round(faceWidth), wrap: Math.round(overlap) }) : t('wallpaperUi.finishedWidth', { mm: Math.round(width) })}</text>
    <text x="28" y="374" className="wallpaper-svg-small">{repeat ? t('wallpaperUi.phaseRepeat', { phase: Math.round(piece.phase), repeat: Math.round(repeat) }) : t('wallpaperUi.phaseOnly', { phase: Math.round(piece.phase) })}</text><text x="28" y="397" className="wallpaper-svg-small">{t('wallpaperUi.diagramLegend')}</text>
  </svg>;
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
  const [projectGroupId, setProjectGroupId] = useState('');
  const [progress, setProgress] = useState({ cut: [], hung: [] });
  const [cutWallIndex, setCutWallIndex] = useState(0);
  const [selectedPieceId, setSelectedPieceId] = useState(null);
  const [cornerOverlap, setCornerOverlap] = useState('15');
  const [activeWall, setActiveWall] = useState(null);
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
    const editId = new URLSearchParams(window.location.search).get('edit');
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
      window.history.replaceState(null, '', window.location.pathname);
    }).catch(() => {});
  }, [user]);
  const updateWall = (index, field, value) => setWalls(walls.map((wall, i) => i === index ? withDerivedMiddle({ ...wall, [field]: value }) : wall));
  const updateWallDimension = (index, dimension, value) => setWalls(walls.map((wall, current) => {
    if (current !== index) return wall;
    const fields = dimension === 'width'
      ? ['width_top', 'width_middle', 'width_bottom']
      : ['height_left', 'height_middle', 'height_right'];
    return { ...wall, ...Object.fromEntries(fields.map((field) => [field, value])) };
  }));
  const toggleOpenWall = (index, open) => setWalls(walls.map((wall, i) => i !== index ? wall : open ? { ...wall, skip: true, profile: 'rectangle', cutouts: [], height_left: '2400', height_middle: '2400', height_right: '2400' } : { ...wall, skip: false }));
  const updateCutout = (wallIndex, cutoutIndex, field, value) => setWalls(walls.map((wall, index) => index !== wallIndex ? wall : { ...wall, cutouts: wall.cutouts.map((cutout, current) => current === cutoutIndex ? { ...cutout, [field]: value } : cutout) }));
  const removeCutout = (wallIndex, cutoutIndex) => setWalls(walls.map((wall, index) => index !== wallIndex ? wall : { ...wall, cutouts: wall.cutouts.filter((_, current) => current !== cutoutIndex) }));
  const addWall = () => {
    setWalls([...walls, { ...initialWall(t), name: wallLetter(walls.length, t) }]);
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
    if (!wallpaper.name.trim() || !wallpaper.manufacturer.trim()) {
      setError(t('wallpaperUi.errNameManufacturer'));
      return;
    }
    setError('');
    setStep(1);
  };
  const rollPrice = payload.wallpaper.price_per_roll != null && Number.isFinite(payload.wallpaper.price_per_roll) ? payload.wallpaper.price_per_roll : null;
  const formatMoney = (value) => `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${pricing.currency}`;
  const save = async () => {
    try {
      const body = { name: projectName, project_group_id: projectGroupId || null, wallpaper_data: { ...payload.wallpaper, currency: pricing.currency, vat_rate: pricing.vatRate, prices_include_vat: pricing.pricesIncludeVat }, room_data: payload.room, options_data: { corner_overlap: cornerOverlap, spare_margin: spareMargin, start: startChoice }, plan_result: plan, ordered_rolls: plan.rolls_to_buy, progress_data: progress };
      const existingId = saved?.id ?? editingId;
      const result = existingId ? await updateWallpaperProject(existingId, body) : await saveWallpaperProject(body);
      setSaved(result);
      if (user) await saveWallpaper({ name: wallpaper.name, data: payload.wallpaper });
    } catch (err) { setError(err.message); }
  };
  const planInvalid = !!plan && !!plan.closure && !plan.closure.valid;
  const steps = [
    { label: t('common.wallpaperPlanner'), summary: wallpaper.name || t('wallpaperUi.chooseWallpaper'), locked: t('wallpaperUi.chooseWallpaper'), reachable: true },
    { label: t('wallpaperUi.stepRoom'), summary: t('wallpaperUi.wallsMeasured', { count: walls.length }), locked: t('wallpaperUi.measureRoom'), reachable: step >= 1 },
    { label: t('wallpaperUi.stepPlan'), summary: plan ? t(corners.some((corner) => corner.confirmed_continuation === 'continue') || walls.some((wall) => wall.profile === 'sloped') ? 'wallpaperUi.rollsDraft' : 'wallpaperUi.rollsToBuy', { rolls: plan.rolls_to_buy }) : t('wallpaperUi.calcMaterial'), locked: t('wallpaperUi.createPlanLocked'), reachable: !!plan },
    { label: t('wallpaperUi.stepCut'), summary: plan ? t('wallpaperUi.piecesSummary', { pieces: plan.pieces.length }) : t('wallpaperUi.prepareCutSheets'), locked: t('wallpaperUi.choosePlanLocked'), reachable: !!plan && !planInvalid },
    { label: t('workflow.save'), summary: saved ? t('wallpaperUi.savedLocally') : t('wallpaperUi.keepProject'), locked: t('wallpaperUi.prepareCutSheets'), reachable: !!plan && !planInvalid },
  ];
  const hasConnectedCorner = corners.some((corner) => corner.confirmed_continuation === 'continue');
  const hasSlopedWall = walls.some((wall) => wall.profile === 'sloped');
  const issues = walls.map((wall) => wallIssues(wall, t));
  const hasBlockingIssues = issues.some((item) => item.hasErrors);
  const pendingCorners = corners.filter((corner, index) => needsDecision(index)).length;
  const overlapMessage = overlapIssue(cornerOverlap, t);
  const toggle = (kind, id) => setProgress((current) => ({ ...current, [kind]: current[kind].includes(id) ? current[kind].filter((item) => item !== id) : [...current[kind], id] }));
  return <CatalogPage>
    <style>{`@media (max-width: 767px) { .wallpaper-measured-sheet, .wallpaper-piece-sheet { box-sizing: border-box; max-width: 100%; overflow-x: auto; overscroll-behavior-inline: contain; } .wallpaper-measured-sheet { margin-inline: -16px; padding-inline: 16px; } .wallpaper-measured-sheet > svg { min-width: 620px; } .wallpaper-piece-sheet { min-width: 0; } .wallpaper-piece-sheet > svg { display: block; min-width: 500px; } } @media print { .plan-steps, nav, .step-head > button, .step-foot, .btn { display: none !important; } .step-view { max-width: none !important; } .wallpaper-wall-drawing { break-inside: avoid; page-break-inside: avoid; } }`}</style>
    <PlanSteps steps={steps} current={step} onSelect={setStep} />
    {error && <div className="alert-danger" role="alert">{error}</div>}
    {step === 0 && <section className="step-view is-form"><div className="step-head"><div><h1 className="step-h1">{t('wallpaperUi.detailsTitle')}</h1><p className="step-lede">{t('wallpaperUi.detailsLede')}</p></div></div><div className="grid gap-x-8 gap-y-5 md:grid-cols-2"><label className="form-label">{t('workflow.name')}<input className="form-input" value={wallpaper.name} onChange={(event) => setWallpaper({ ...wallpaper, name: event.target.value })} /></label><label className="form-label">{t('wallpaperUi.manufacturer')}<input className="form-input" value={wallpaper.manufacturer} onChange={(event) => setWallpaper({ ...wallpaper, manufacturer: event.target.value })} /></label><label className="form-label">{t('wallpaperUi.rollWidthMm')}<input className="form-input" value={wallpaper.roll_width} onChange={(event) => setWallpaper({ ...wallpaper, roll_width: event.target.value })} /></label><label className="form-label">{t('wallpaperUi.rollLengthMm')}<input className="form-input" value={wallpaper.roll_length} onChange={(event) => setWallpaper({ ...wallpaper, roll_length: event.target.value })} /></label><label className="form-label">{t('wallpaperUi.pricePerRollOptional')}<input className="form-input" inputMode="decimal" value={wallpaper.price_per_roll} onChange={(event) => setWallpaper({ ...wallpaper, price_per_roll: event.target.value })} aria-describedby="roll-price-help" /><span id="roll-price-help" className="synthetic" style={{ display: 'block', marginTop: '6px' }}>{t('wallpaperUi.priceHelp', { currency: pricing.currency })}</span></label><label className="form-label">{t('wallpaperUi.spareMarginPct')}<input className="form-input" inputMode="decimal" value={spareMargin} onChange={(event) => setSpareMargin(event.target.value)} aria-describedby="spare-margin-help" /><span id="spare-margin-help" className="synthetic" style={{ display: 'block', marginTop: '6px' }}>{t('wallpaperUi.spareMarginHelp')}</span></label></div><div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--rule-hair)' }}><label className="flex items-center gap-2" style={{ fontSize: '13px', fontWeight: 600 }}><input type="checkbox" checked={patterned} onChange={() => setPatterned(!patterned)} /> {t('wallpaperUi.hasRepeat')}</label>{patterned && <div className="grid gap-x-8 gap-y-5 md:grid-cols-2" style={{ marginTop: '18px' }}><label className="form-label">{t('wallpaperUi.repeatMm')}<input className="form-input" value={wallpaper.repeat} onChange={(event) => setWallpaper({ ...wallpaper, repeat: event.target.value })} /></label><label className="form-label">{t('wallpaperUi.match')}<select className="form-select" value={wallpaper.match} onChange={(event) => setWallpaper({ ...wallpaper, match: event.target.value })}><option value="straight">{t('wallpaperUi.matchStraight')}</option><option value="half_drop">{t('wallpaperUi.matchHalfDrop')}</option></select></label></div>}</div><div className="step-foot"><button className="btn-order step-foot-act" onClick={continueToRoom}>{`${t('wallpaperUi.measureRoom')} →`}</button></div></section>}
    {step === 1 && <section className="step-view"><div className="step-head"><div><h1 className="step-h1">{t('wallpaperUi.measureRoom')}</h1><p className="step-lede">{t('wallpaperUi.roomLede')}</p><p className="synthetic" style={{ marginTop: '8px', maxWidth: '620px' }}>{t('wallpaperUi.roomNote')}</p></div></div><div className="grid gap-10 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)]"><div>{walls.map((wall, index) => <section key={index} onFocus={() => setActiveWall(index)} style={{ marginTop: index ? '26px' : 0, paddingTop: index ? '22px' : 0, borderTop: index ? '1px solid var(--rule-hair)' : undefined }}><div className="section-rule"><label className="form-label" style={{ flex: 1 }}>{t('wallpaperUi.wallNameLabel')}<input className="form-input" value={wall.name} onChange={(event) => updateWall(index, 'name', event.target.value)} /></label>{walls.length > 1 && <button type="button" className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => removeWall(index)} aria-label={t('wallpaperUi.removeWallAria', { name: wall.name })}>{t('wallpaperUi.removeWall')}</button>}</div><label className="form-label" style={{ display: 'flex', gap: '10px', alignItems: 'center', margin: '14px 0' }}><input type="checkbox" checked={!!wall.skip} onChange={(event) => toggleOpenWall(index, event.target.checked)} />{t('wallpaperUi.noWallpaperOnWall')}</label>{wall.profile !== 'sloped' && <div className="grid gap-x-8 gap-y-5 md:grid-cols-2"><label className="form-label">{t('wallpaperUi.wallWidthMm')}<input className="form-input" value={wall.width_top} onChange={(event) => updateWallDimension(index, 'width', event.target.value)} /></label>{!wall.skip && <label className="form-label">{t('wallpaperUi.wallHeightMm')}<input className="form-input" value={wall.height_left} onChange={(event) => updateWallDimension(index, 'height', event.target.value)} /></label>}</div>}{wall.skip ? issues[index].errors.map((message) => <p key={message} role="alert" className="synthetic" style={{ color: '#c0392b', marginTop: '12px' }}>{message}</p>) : <><fieldset style={{ marginTop: '16px' }}><legend className="form-label">{t('wallpaperUi.wallShape')}</legend><div className="grid gap-3 md:grid-cols-2">{wallShapes.map(([profile, labelKey]) => <label key={profile} className="flex items-center gap-3" style={{ padding: '10px', border: `1px solid ${(wall.profile || 'rectangle') === profile ? 'var(--accent)' : 'var(--rule-hair)'}`, cursor: 'pointer' }}><input type="radio" name={`wall-shape-${index}`} checked={(wall.profile || 'rectangle') === profile} onChange={() => setWalls(walls.map((current, currentIndex) => { if (currentIndex !== index) return current; const left = numeric(current.height_left); const flat = left === numeric(current.height_right); return withDerivedMiddle({ ...current, profile, ...(profile === 'sloped' ? { ...(flat ? { height_right: String(Math.max(left - 600, 300)) } : {}), lower_left: current.lower_left ?? '0', lower_right: current.lower_right ?? '0' } : {}) }); }))} /><ShapeIcon profile={profile} /><span>{t(labelKey)}</span></label>)}</div></fieldset>{wall.profile === 'sloped' && <div style={{ marginTop: '16px' }}><p className="synthetic">{t('wallpaperUi.slopedHelp')}</p><WallOutlineEditor wall={wall} onChange={(update) => setWalls(walls.map((current, currentIndex) => currentIndex === index ? withDerivedMiddle({ ...current, ...update }) : current))} /></div>}<div style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--rule-hair)' }}><div className="section-rule"><h3 className="section-title">{t('wallpaperUi.openingsTitle')}</h3></div><p className="synthetic" style={{ margin: '0 0 14px' }}>{t('wallpaperUi.everyPosition', { origin: wall.profile === 'sloped' ? t('wallpaperUi.originLocalLower') : t('wallpaperUi.originBottomLeft') })}</p>{(wall.cutouts || []).map((cutout, cutoutIndex) => <div key={cutoutIndex} style={{ marginTop: '16px' }}>
  <div className="grid grid-cols-1 items-end gap-x-4 gap-y-4 md:grid-cols-[minmax(130px,1fr)_minmax(155px,1.35fr)_minmax(155px,1.35fr)_repeat(2,minmax(96px,.8fr))_auto]">
    <label className="form-label">{t('wallpaperUi.type')}
      <select className="form-select" value={cutout.kind} onChange={(event) => updateCutout(index, cutoutIndex, 'kind', event.target.value)}>
        {Object.entries(KIND_KEYS).map(([kind, kindKey]) => <option key={kind} value={kind}>{t(kindKey)}</option>)}
      </select>
    </label>
    <label className="form-label">{t('wallpaperUi.fromLeftEdge')}<input className="form-input" value={cutout.x} onChange={(event) => updateCutout(index, cutoutIndex, 'x', event.target.value)} /></label>
    <label className="form-label">{wall.profile === 'sloped' ? t('wallpaperUi.fromLowerEdge') : t('wallpaperUi.fromFloor')}<input className="form-input" value={cutout.y} onChange={(event) => updateCutout(index, cutoutIndex, 'y', event.target.value)} /></label>
    <label className="form-label">{t('wallpaperUi.widthMm')}<input className="form-input" value={cutout.width} onChange={(event) => updateCutout(index, cutoutIndex, 'width', event.target.value)} /></label>
    <label className="form-label">{t('wallpaperUi.heightMm')}<input className="form-input" value={cutout.height} onChange={(event) => updateCutout(index, cutoutIndex, 'height', event.target.value)} /></label>
    <button type="button" className="btn" onClick={() => removeCutout(index, cutoutIndex)}>{t('common.remove')}</button>
  </div>
  {cutout.kind === 'custom' && <label className="form-label" style={{ display: 'block', marginTop: '12px', maxWidth: '360px' }}>{t('wallpaperUi.customName')}<input className="form-input" value={cutout.label || ''} onChange={(event) => updateCutout(index, cutoutIndex, 'label', event.target.value)} /></label>}
{issues[index].cutouts[cutoutIndex] && <p role="alert" className="synthetic" style={{ color: '#c0392b', marginTop: '8px' }}>{issues[index].cutouts[cutoutIndex]}</p>}</div>)}</div>{issues[index].errors.map((message) => <p key={message} role="alert" className="synthetic" style={{ color: '#c0392b', marginTop: '12px' }}>{message}</p>)}{issues[index].warnings.map((message) => <p key={message} className="synthetic" style={{ marginTop: '12px' }}>{message}</p>)}<button type="button" className="btn" style={{ marginTop: '16px' }} onClick={() => updateWall(index, 'cutouts', [...(wall.cutouts || []), { kind: 'door', x: '500', y: '0', width: '900', height: '2100', tuck_edges: [] }])}>{t('wallpaperUi.addOpening')}</button></>}</section>)}{walls.length >= 3 && <label className="form-label" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '26px' }}><input type="checkbox" checked={closed} disabled={!closed && corners.some((corner) => corner.kind === 'none')} onChange={(event) => toggleClosed(event.target.checked)} />{t('wallpaperUi.closedRoomToggle')}</label>}{corners.length > 0 && <section aria-label={t('wallpaperUi.cornersTitle')} style={{ marginTop: '26px', paddingTop: '22px', borderTop: '1px solid var(--rule-hair)' }}><div className="section-rule"><h2 className="section-title">{t('wallpaperUi.cornersTitle')}</h2></div><label className="form-label" style={{ display: 'block', maxWidth: '260px', margin: '12px 0' }}>{t('wallpaperUi.cornerOverlapMm')}<input className="form-input" inputMode="numeric" value={cornerOverlap} onChange={(event) => { setCornerOverlap(event.target.value); setError(''); }} aria-invalid={!!overlapMessage} /></label>{overlapMessage ? <p role="alert" className="synthetic" style={{ color: '#c0392b' }}>{overlapMessage}</p> : <p className="synthetic">{t('wallpaperUi.cornerOverlapHelp')}</p>}<p className="synthetic">{`${t('wallpaperUi.chooseCornerTreatment')} ${pendingCorners ? t('wallpaperUi.cornersPending', { count: pendingCorners }) : t('wallpaperUi.allCornersConfirmed')}`}</p>{corners.map((corner, index) => <fieldset key={index} style={{ marginTop: '18px', padding: '16px', border: '1px solid var(--rule-hair)' }}><legend className="form-label">{walls[index].name} → {walls[(index + 1) % walls.length].name}</legend><div className="grid gap-4 md:grid-cols-2"><label className="form-label">{t('wallpaperUi.cornerType')}<select className="form-select" value={corner.kind} onChange={(event) => updateCorner(index, { kind: event.target.value, confirmed_continuation: defaultContinuation(event.target.value) })}><option value="inside">{t('wallpaperUi.cornerInside')}</option><option value="outside">{t('wallpaperUi.cornerOutside')}</option>{!closed && <option value="none">{t('wallpaperUi.noCornerOption')}</option>}</select></label>{corner.kind !== 'none' && (walls[index].skip || walls[(index + 1) % walls.length].skip) && <p className="synthetic">{t('wallpaperUi.noPaperAtCorner')}</p>}{corner.kind !== 'none' && !walls[index].skip && !walls[(index + 1) % walls.length].skip && <label className="form-label">{t('wallpaperUi.hangingDecision')}<select className="form-select" value={corner.confirmed_continuation} onChange={(event) => updateCorner(index, { confirmed_continuation: event.target.value })}>{!corner.confirmed_continuation && <option value="">{t('wallpaperUi.confirmDecision')}</option>}{corner.kind === 'inside' && <option value="overlap">{t('wallpaperUi.optOverlap', { mm: cornerOverlap || 0 })}</option>}<option value="start_new">{corner.kind === 'inside' ? t('wallpaperUi.optStartNewInside') : t('wallpaperUi.optStartNewOutside')}</option><option value="continue">{corner.kind === 'inside' ? t('wallpaperUi.optContinueInside') : t('wallpaperUi.optWrapOutside')}</option></select></label>}</div><p className="synthetic" style={{ marginTop: '12px' }}>{corner.kind === 'none' ? t('wallpaperUi.explainNone') : corner.kind === 'outside' ? t('wallpaperUi.explainOutside') : corner.confirmed_continuation === 'overlap' ? t('wallpaperUi.explainOverlap', { mm: cornerOverlap || 0 }) : corner.confirmed_continuation === 'continue' ? t('wallpaperUi.explainContinue') : t('wallpaperUi.explainButt')}</p></fieldset>)}</section>}<div className="step-foot"><button className="btn" onClick={addWall}>{t('wallpaperUi.addWall')}</button><button className="btn-order step-foot-act" onClick={makePlan} disabled={pendingCorners > 0 || hasBlockingIssues} aria-describedby={pendingCorners ? 'corner-plan-status' : undefined}>{`${t('wallpaperUi.createPlan')} →`}</button></div>{pendingCorners > 0 && <p id="corner-plan-status" className="synthetic" style={{ marginTop: '12px', textAlign: 'right' }}>{t('wallpaperUi.confirmEveryCorner')}</p>}{hasBlockingIssues && <p className="synthetic" style={{ marginTop: '12px', textAlign: 'right' }}>{t('wallpaperUi.fixMeasurements')}</p>}</div><aside aria-label={t('wallpaperUi.roomPreview')} style={{ position: 'sticky', top: '16px', alignSelf: 'start' }}><RoomOverview walls={walls} corners={corners} closed={closed} activeWallIndex={activeWall} showStart /></aside></div></section>}
    {step === 2 && plan && <section className="step-view"><div className="step-head"><div><h1 className="step-h1">{t('wallpaperUi.planTitle')}</h1><p className="step-lede">{plan.closure && !plan.closure.valid ? t('wallpaperUi.ledeInvalid') : hasSlopedWall ? t('wallpaperUi.ledeSloped') : hasConnectedCorner ? t('wallpaperUi.ledeConnected') : t('wallpaperUi.ledeBuy', { rolls: plan.rolls_to_buy })}</p></div><button className="btn" onClick={() => setStep(1)}>{t('wallpaperUi.editMeasurements')}</button></div><div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_250px]"><div>{plan.closure && !plan.closure.valid && <p role="alert" style={{ padding: '12px 16px', border: '1px solid #c0392b', color: '#c0392b', marginBottom: '20px' }}>{plan.closure.message}</p>}{plan.corner_quality?.smallest != null && <section aria-label={t('wallpaperUi.cornerPiecesAria')} data-testid="corner-quality" style={{ marginBottom: '20px' }}><p className="synthetic">{t('wallpaperUi.smallestCorner')} <b>{Math.round(plan.corner_quality.smallest)} mm</b> {t('wallpaperUi.smallestCornerMin', { min: plan.corner_quality.minimum })}{plan.corner_quality.short_corners.length === 0 ? ` ${t('wallpaperUi.allCornersAbove')}` : ''}</p>{plan.corner_quality.short_corners.length > 0 && <ul role="alert" style={{ color: '#c0392b', paddingLeft: '20px' }}>{plan.corner_quality.short_corners.map((corner) => <li key={`${corner.strip}-${corner.from_wall}-${corner.to_wall}`}>{t('wallpaperUi.shortCorner', { strip: corner.strip, mm: Math.round(corner.width), from: corner.from_wall, to: corner.to_wall, action: corner.action })}</li>)}</ul>}</section>}{walls.length > 1 && <RoomOverview walls={walls} corners={plan.corners || payload.room.corners} plan={plan} closed={!!plan.closure} />}<p className="synthetic" style={{ marginBottom: '20px' }}>{t('wallpaperUi.stripKey')}</p>{walls.map((wall, index) => { const wallStrips = plan.strips.filter((strip) => isOnWall(strip, index)); const wallPieces = plan.pieces.filter((piece) => isOnWall(piece, index)); return <Fragment key={index}><section style={{ marginBottom: '32px' }}><div className="section-rule"><h2 className="section-title">{wall.name}</h2><span className="synthetic">{wall.skip ? t('wallpaperUi.noWallpaper') : t('wallpaperUi.stripsPieces', { strips: wallStrips.length, pieces: wallPieces.length })}</span></div>{wall.skip ? <p className="synthetic" data-testid="no-wallpaper-wall" style={{ padding: '14px 16px', border: '1px dashed var(--ink-3)', background: 'var(--ground-2)' }}>{t('wallpaperUi.noWallpaperWall', { width: wall.width_top })}</p> : <><WallElevation wall={wall} wallIndex={index} plan={plan} wallNames={walls.map((item) => item.name)} /><dl className="grid gap-3 md:grid-cols-3"><div><dt className="form-label">{wall.detailedMeasurements ? t('wallpaperUi.widthsDetailed') : t('wallpaperUi.measuredWidth')}</dt><dd>{wall.detailedMeasurements ? `${wall.width_top} / ${wall.width_middle} / ${wall.width_bottom} mm` : `${wall.width_top} mm`}</dd></div><div><dt className="form-label">{wall.detailedMeasurements ? t('wallpaperUi.heightsDetailed') : t('wallpaperUi.heights')}</dt><dd>{wall.detailedMeasurements ? `${wall.height_left} / ${wall.height_middle} / ${wall.height_right} mm` : `${wall.height_left} / ${wall.height_right} mm`}</dd></div><div><dt className="form-label">{t('workflow.openings')}</dt><dd>{(wall.cutouts || []).length || t('wallpaperUi.none')}</dd></div></dl></>}</section>{index < walls.length - 1 && <CornerConnection from={wall.name} to={walls[index + 1].name} corner={plan.corners?.[index] || payload.room.corners[index]} link={plan.strips.find((strip) => { const all = segmentsOf(strip); return all.some((segment, position) => segment.wall_index === index && all[position + 1]?.wall_index === index + 1); })?.number} overlap={plan.strips.find((strip) => strip.return_wall_index === index + 1 && strip.segments?.[strip.segments.length - 1]?.wall_index === index)?.return_overlap} />}</Fragment>; })}{[...new Set(plan.warnings)].map((warning) => <p className="synthetic" key={warning}>{warning}</p>)}</div><section aria-label={t('wallpaperUi.materialSummary')}><div className="section-rule"><h2 className="section-title">{t('wallpaperUi.materialSummary')}</h2></div><p><b>{t(hasSlopedWall || hasConnectedCorner ? 'wallpaperUi.rollsDraft' : 'wallpaperUi.rollsToBuy', { rolls: plan.rolls_to_buy })}</b></p><p className="synthetic" data-testid="spare-rolls">{t('wallpaperUi.rollsNeeded', { rolls: plan.rolls_needed })} {plan.rolls_to_buy > plan.rolls_needed ? t('wallpaperUi.rollsSpare', { spare: plan.rolls_to_buy - plan.rolls_needed, margin: text(spareMargin) }) : t('wallpaperUi.noSpareMargin')}</p>{rollPrice != null && <p data-testid="estimated-cost">{t('wallpaperUi.estimatedCost')} <b>{formatMoney(plan.rolls_to_buy * rollPrice)}</b><span className="synthetic" style={{ display: 'block' }}>{t('wallpaperUi.costBreakdown', { rolls: plan.rolls_to_buy, price: formatMoney(rollPrice), vat: pricing.pricesIncludeVat ? t('ui.includingVat') : t('ui.excludingVat'), rate: pricing.vatRate })}</span></p>}{plan.material && <><p className="synthetic">{t('wallpaperUi.wasteSummary', { percent: Math.round(((plan.waste.pattern + plan.waste.offcut) / plan.material.bought_length) * 100) })}</p><dl className="cat-table">{[[t('wallpaperUi.wastePattern'), plan.waste.pattern, t('wallpaperUi.wastePatternHelp')], [t('wallpaperUi.wasteEnds'), plan.waste.offcut, t('wallpaperUi.wasteEndsHelp')], [t('wallpaperUi.wasteAllowance'), plan.waste.allowance, t('wallpaperUi.wasteAllowanceHelp')]].map(([name, value, help]) => <div className="flex justify-between border-b border-[var(--rule-hair)] py-2" key={name} title={help}><dt>{name}</dt><dd>{Math.round(value)} mm · {Math.round((value / plan.material.bought_length) * 100)}%</dd></div>)}</dl><p className="synthetic" data-testid="offcut-reuse" style={{ marginTop: '12px' }}>{leftoverSentence(plan.material, t)}</p>{rollFitHint(plan.material.fit, numeric(wallpaper.roll_length), patterned ? numeric(wallpaper.repeat) : 0, t) && <p className="synthetic" data-testid="roll-fit-hint">{rollFitHint(plan.material.fit, numeric(wallpaper.roll_length), patterned ? numeric(wallpaper.repeat) : 0, t)}</p>}{plan.waste.trim > 0 && <p className="synthetic" data-testid="opening-trim">{t('wallpaperUi.openingTrim', { mm: Math.round(plan.waste.trim) })}</p>}</>}{plan.start_candidates?.length > 1 && <div data-testid="start-options" style={{ marginTop: '20px' }}><h3 className="section-title">{t('wallpaperUi.whereToStart')}</h3><p className="synthetic">{t('wallpaperUi.startTried', { widths: plan.start_candidates.length })}</p><dl className="cat-table">{plan.start_candidates.slice(0, 5).map((candidate, position) => <div className="flex items-center justify-between gap-2 border-b border-[var(--rule-hair)] py-2" key={candidate.first_strip_widths.join('-')}><dt>{t('wallpaperUi.firstStripWidth', { mm: Math.round(candidate.first_strip_widths[0]) })}<span className="synthetic" style={{ display: 'block' }}>{t('wallpaperUi.startDetail', { rolls: candidate.rolls_needed, mm: Math.round(candidate.narrowest_strip) })}{candidate.feasible ? '' : ` · ${t('wallpaperUi.needsAttention')}`}</span></dt><dd>{position === 0 ? <b>{t('wallpaperUi.chosen')}</b> : <button type="button" className="btn" onClick={() => chooseStart(candidate)}>{t('wallpaperUi.use')}</button>}</dd></div>)}</dl></div>}</section></div><div className="step-foot"><button className="btn" onClick={() => setStep(1)}>{t('wallpaperUi.backToMeasurements')}</button><button className="btn-order step-foot-act" onClick={() => setStep(3)} disabled={planInvalid}>{`${t('wallpaperUi.prepareCutSheets')} →`}</button></div>{planInvalid && <p className="synthetic" style={{ marginTop: '12px', textAlign: 'right' }}>{t('wallpaperUi.correctRoomMeasurements')}</p>}</section>}
    {step === 3 && plan && <section className="step-view is-form">
      <div className="step-head">
        <div><h1 className="step-h1">{t('wallpaperUi.cutTitle')}</h1><p className="step-lede">{t('wallpaperUi.cutLede')}</p></div>
        <button className="btn" onClick={() => window.print()}>{t('auditUi.printOne')}</button>
      </div>
      <div className="flex gap-2" style={{ marginBottom: '18px', flexWrap: 'wrap' }}>{walls.map((wall, index) => <button className={`btn ${cutWallIndex === index ? 'is-active' : ''}`} key={wall.name} onClick={() => setCutWallIndex(index)}>{wall.name}</button>)}</div>
      <section style={{ marginBottom: '24px' }}>
        <div className="section-rule"><h2 className="section-title">{walls[cutWallIndex].name}</h2><span className="synthetic">{t('wallpaperUi.originBottomLeftLabel')}</span></div>
        <div className="wallpaper-measured-sheet"><WallElevation wall={walls[cutWallIndex]} wallIndex={cutWallIndex} plan={plan} wallNames={walls.map((item) => item.name)} /></div>
      </section>
      {(() => { const selectedPiece = plan.pieces.find((piece) => piece.id === selectedPieceId && isOnWall(piece, cutWallIndex)) || plan.pieces.find((piece) => isOnWall(piece, cutWallIndex)); const selectedStrip = selectedPiece && plan.strips.find((strip) => strip.number === selectedPiece.strip_number); return selectedPiece && selectedStrip && <section className="wallpaper-piece-sheet" style={{ marginBottom: '24px' }}><div className="section-rule"><h2 className="section-title">{t('wallpaperUi.selectedPiece')}</h2><span className="synthetic">{t('wallpaperUi.selectedPieceHint')}</span></div><PieceDiagram piece={selectedPiece} strip={selectedStrip} repeat={numeric(wallpaper.repeat)} /></section>; })()}
      {plan.rolls.filter((roll) => roll.cuts.some((cut) => isOnWall(plan.pieces.find((piece) => piece.id === cut.piece_id) || {}, cutWallIndex))).map((roll) => <section key={roll.number} style={{ marginTop: '24px' }}>
        <div className="section-rule"><h2 className="section-title">{t('wallpaperUi.rollTitle', { number: roll.number })}</h2></div>
        <RollDiagram roll={roll} rollLength={numeric(wallpaper.roll_length)} pieces={plan.pieces} wallIndex={cutWallIndex} />
        <div className="cat-table">{roll.cuts.filter((cut) => isOnWall(plan.pieces.find((piece) => piece.id === cut.piece_id) || {}, cutWallIndex)).map((cut) => {
          const piece = plan.pieces.find((current) => current.id === cut.piece_id);
          const strip = plan.strips.find((current) => current.number === piece.strip_number);
          return <CutInstruction key={cut.piece_id} cut={cut} piece={piece} strip={strip} wallIndex={cutWallIndex} wallNames={walls.map((item) => item.name)} progress={progress.cut} toggle={toggle} selected={selectedPieceId === piece.id} onSelect={setSelectedPieceId} />;
        })}</div>
      </section>)}
      <div className="step-foot"><button className="btn-order step-foot-act" onClick={() => setStep(4)}>{`${t('workflow.savePlan')} →`}</button></div>
    </section>}
    {step === 4 && plan && (saved ? <section className="step-view"><div className="step-head"><div><h1 className="step-h1">{t('workflow.planSaved')}</h1><p className="step-lede">{t('wallpaperUi.savedLede')}</p></div></div><div style={{ marginTop: '24px', padding: '20px', border: '1px solid var(--rule-hair)', background: 'var(--ground-2)' }}><b>{`✓ ${t('workflow.savedAs', { name: projectName })}`}</b><p className="synthetic" style={{ margin: '8px 0 0' }}>{projectGroupId ? t('wallpaperUi.filedUnder', { name: projectGroups.find((group) => String(group.id) === String(projectGroupId))?.name || t('wallpaperUi.selectedProject') }) : `${t('ui.notInProject')}.`}</p></div><div className="step-foot"><button className="btn" onClick={() => setStep(2)}>{`← ${t('workflow.backToPlan')}`}</button><button className="btn-order step-foot-act" onClick={() => window.location.assign('/dashboard')}>{t('wallpaperUi.openDashboard')}</button></div></section> : <section className="step-view is-form"><div className="step-head"><div><h1 className="step-h1">{t('workflow.saveThisPlan')}</h1><p className="step-lede">{t('wallpaperUi.saveLede')}</p>{rollPrice != null && <p className="synthetic" data-testid="save-estimated-cost">{t('wallpaperUi.saveEstimatedCost', { cost: formatMoney(plan.rolls_to_buy * rollPrice), rolls: plan.rolls_to_buy, price: formatMoney(rollPrice) })}</p>}</div></div><label className="form-label">{t('projectUi.projectName')}<input className="form-input" value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label><label className="form-label" style={{ marginTop: '18px' }}>{t('ui.projectOptional')}<select className="form-select" value={projectGroupId} onChange={(event) => setProjectGroupId(event.target.value)}><option value="">{t('ui.notInProject')}</option>{projectGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><div className="step-foot"><button className="btn" onClick={() => setStep(2)}>{`← ${t('workflow.backToPlan')}`}</button><button className="btn-order step-foot-act" onClick={save}>{t('workflow.savePlan')}</button></div></section>)}
  </CatalogPage>;
};

export default WallpaperOptimizer;
