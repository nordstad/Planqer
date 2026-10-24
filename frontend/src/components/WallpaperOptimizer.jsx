import { Fragment, useEffect, useMemo, useState } from 'react';
import CatalogPage from './CatalogPage';
import PlanSteps from './PlanSteps';
import WallOutlineEditor from './WallOutlineEditor';
import { createWallpaperPlan, getProjectGroups, saveWallpaper, saveWallpaperProject, updateWallpaperProject } from '../utils/api';
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

const initialWall = {
  name: 'Wall 1', profile: 'rectangle', width_top: '2400', width_middle: '2400', width_bottom: '2400',
  height_left: '2400', height_middle: '2400', height_right: '2400', confirmed: true,
};

const SHAPE_PATHS = {
  rectangle: '2,3 26,3 26,19 2,19',
  sloped: '2,3 26,11 26,19 2,19',
};
const ShapeIcon = ({ profile }) => <svg width="34" height="24" viewBox="0 0 28 22" aria-hidden="true"><polygon points={SHAPE_PATHS[profile]} fill="var(--ground-2)" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" /></svg>;

const wallShapes = [['rectangle', 'Rectangle'], ['sloped', 'Sloped']];

// The middle height is not asked for on sloped walls; keep it consistent with the measured edges.
const withDerivedMiddle = (wall) => {
  const left = numeric(wall.height_left);
  const right = numeric(wall.height_right);
  if (wall.profile === 'sloped') return { ...wall, height_middle: String(Math.max(left, right)) };
  return wall;
};

const initialCorner = () => ({
  kind: 'inside',
  confirmed_continuation: '',
});

// A strip that wraps a corner keeps one colour on every wall it touches.
const LINK_COLOURS = ['#1f7a8c', '#7b4ea3', '#3b8a4b', '#2f5fb3', '#b0457a'];
const linkColour = (stripNumber) => LINK_COLOURS[stripNumber % LINK_COLOURS.length];

const CornerConnection = ({ from, to, corner, link }) => {
  if (!corner) return null;
  const wraps = corner.confirmed_continuation === 'continue';
  const cornerName = corner.kind === 'outside' ? 'Outside corner' : 'Inside corner';
  const action = wraps
    ? `Final strip wraps onto ${to}`
    : `Start a fresh strip on ${to}`;
  return <div aria-label={`${from} to ${to}: ${cornerName}. ${action}.`} style={{ display: 'flex', alignItems: 'stretch', gap: '12px', margin: '4px 0 28px', padding: '0 0 0 18px' }}>
    <div aria-hidden="true" style={{ width: link ? '5px' : '2px', minHeight: '46px', background: link ? linkColour(link) : 'var(--accent)' }} />
    <div style={{ padding: '5px 0' }}>
      <b style={{ display: 'block', fontSize: '13px' }}>{from} → {to}</b>
      <span className="synthetic">{cornerName} · {action}{link ? <b style={{ color: linkColour(link) }}> · strip S{link} is one piece across this corner</b> : null}</span>
    </div>
  </div>;
};

const WallElevation = ({ wall, wallIndex, plan, wallNames }) => {
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
  const scaleX = (value) => 60 + (value / width) * 600;
  const scaleY = (value) => 290 - (value / height) * 240;
  const outlinePath = isSloped
    ? `M ${scaleX(0)} ${scaleY(lowerLeft)} L ${scaleX(widthTop)} ${scaleY(lowerRight)} L ${scaleX(widthTop)} ${scaleY(heightRight)} L ${scaleX(0)} ${scaleY(heightLeft)} Z`
    : `M ${scaleX(0)} ${scaleY(0)} L ${scaleX(widthBottom)} ${scaleY(0)} L ${scaleX(widthMiddle)} ${scaleY(heightMiddle / 2)} L ${scaleX(widthTop)} ${scaleY(heightRight)} L ${scaleX(0)} ${scaleY(heightLeft)} Z`;
  const clipId = `wall-outline-${wallIndex}`;
  return <svg viewBox="0 0 720 390" className="wallpaper-wall-drawing" role="img" aria-label={`${wall.name} elevation`}>
    <defs><marker id={`wall-arrow-${wallIndex}`} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M6 0L0 3L6 6" fill="none" stroke="var(--ink-3)" /></marker><clipPath id={clipId}><path d={outlinePath} /></clipPath></defs>
    <path d={outlinePath} fill="var(--ground-2)" stroke="var(--ink)" strokeWidth="2" />
    {segments.map((segment) => {
      const { link } = segment;
      const left = scaleX(segment.x_start);
      const right = scaleX(segment.x_end);
      const label = right - left < 60 ? `S${segment.number}` : `S${segment.number} · ${Math.round(segment.x_end - segment.x_start)} mm`;
      return <g key={`${segment.number}-${segment.x_start}`}>
        {link && <rect x={left} y="0" width={right - left} height="390" fill={link.colour} opacity="0.18" clipPath={`url(#${clipId})`} />}
        <line x1={right} x2={right} y1="50" y2="290" stroke={link ? link.colour : 'var(--accent)'} strokeWidth={link ? 2 : 1} strokeDasharray="5 4" clipPath={`url(#${clipId})`} />
        {link?.after && <g><line x1={right} x2={right} y1="0" y2="390" stroke={link.colour} strokeWidth="6" clipPath={`url(#${clipId})`} /><text x={right} y="36" textAnchor="end" className="wallpaper-svg-small" style={{ fill: link.colour, fontWeight: 700 }}>S{segment.number} continues on {link.after} →</text></g>}
        {link?.before && <g><line x1={left} x2={left} y1="0" y2="390" stroke={link.colour} strokeWidth="6" clipPath={`url(#${clipId})`} /><text x={left} y="36" textAnchor="start" className="wallpaper-svg-small" style={{ fill: link.colour, fontWeight: 700 }}>← S{segment.number} from {link.before}</text></g>}
        <text x={(left + right) / 2} y="349" textAnchor="middle" className="wallpaper-svg-strip" style={link ? { fill: link.colour, fontWeight: 700 } : undefined}>{label}</text>
      </g>;
    })}
    {wall.cutouts?.map((cutout, index) => {
      const x = scaleX(numeric(cutout.x));
      const lowerAtCutout = isSloped ? lowerLeft + (lowerRight - lowerLeft) * numeric(cutout.x) / width : 0;
      const y = scaleY(lowerAtCutout + numeric(cutout.y) + numeric(cutout.height));
      const cutoutWidth = (numeric(cutout.width) / width) * 600;
      const cutoutHeight = (numeric(cutout.height) / height) * 240;
      const label = cutout.label || cutout.kind.replace('_', ' ');
      return <g key={index}><rect x={x} y={y} width={cutoutWidth} height={cutoutHeight} fill="var(--card)" stroke="var(--ink)" /><text x={x + cutoutWidth / 2} y={y + cutoutHeight / 2 - 10} textAnchor="middle" className="wallpaper-svg-small">{label}</text><text x={x + cutoutWidth / 2} y={y + cutoutHeight / 2 + 5} textAnchor="middle" className="wallpaper-svg-small">{numeric(cutout.width)} × {numeric(cutout.height)} mm</text><text x={x + cutoutWidth / 2} y={y + cutoutHeight / 2 + 20} textAnchor="middle" className="wallpaper-svg-small">left {numeric(cutout.x)} · {isSloped ? 'lower edge' : 'floor'} {numeric(cutout.y)}</text></g>;
    })}
    <line x1="60" y1="316" x2={scaleX(widthBottom)} y2="316" stroke="var(--ink-3)" markerStart={`url(#wall-arrow-${wallIndex})`} markerEnd={`url(#wall-arrow-${wallIndex})`} /><text x={(60 + scaleX(widthBottom)) / 2} y="311" textAnchor="middle" className="wallpaper-svg-small">{isDetailed ? `width near floor ${Math.round(widthBottom)} mm` : `wall width ${Math.round(width)} mm`}</text>
    <line x1="35" y1={scaleY(0)} x2="35" y2={scaleY(heightLeft)} stroke="var(--ink-3)" markerStart={`url(#wall-arrow-${wallIndex})`} markerEnd={`url(#wall-arrow-${wallIndex})`} /><text x="25" y={(scaleY(0) + scaleY(heightLeft)) / 2} textAnchor="middle" transform={`rotate(-90 25 ${(scaleY(0) + scaleY(heightLeft)) / 2})`} className="wallpaper-svg-small">{isDetailed ? `height at left ${Math.round(heightLeft)} mm` : `wall height ${Math.round(height)} mm`}</text>
    <text x="60" y="375" className="wallpaper-svg-small">All opening positions are measured from this wall’s {isSloped ? 'local lower edge' : 'bottom-left corner'}.</text>
  </svg>;
};

const RollDiagram = ({ roll, rollLength, pieces, wallIndex }) => <svg viewBox="0 0 720 130" style={{ width: '100%', maxWidth: '720px', margin: '12px 0' }} role="img" aria-label={`Roll ${roll.number} cutting sequence`}>
  <rect x="35" y="36" width="650" height="54" fill="var(--ground-2)" stroke="var(--ink)" />
  {roll.cuts.filter((cut) => isOnWall(pieces.find((piece) => piece.id === cut.piece_id) || {}, wallIndex)).map((cut) => { const gapStart = 35 + ((cut.start - cut.alignment_gap) / rollLength) * 650; const x = 35 + (cut.start / rollLength) * 650; const width = ((cut.end - cut.start) / rollLength) * 650; return <g key={cut.piece_id}>{cut.alignment_gap > 0 && <rect x={gapStart} y="36" width={(cut.alignment_gap / rollLength) * 650} height="54" fill="var(--accent-bg)" stroke="var(--accent)" strokeDasharray="3 2" />}<rect x={x} y="36" width={width} height="54" fill="var(--card)" stroke="var(--ink)" /><text x={x + width / 2} y="68" textAnchor="middle" className="wallpaper-svg-small">{cut.piece_id}</text></g>; })}
  <text x="35" y="116" className="wallpaper-svg-small">Orange sections are pattern-alignment gaps: keep them as an offcut only when the phase is useful.</text>
</svg>;

const pieceFaces = (piece, strip) => {
  let offset = 0;
  const segments = piece.segments?.length ? piece.segments : [legacyFace(piece, strip)];
  return segments.map((segment) => {
    const face = { ...segment, offset, notches: segment.notches || [] };
    offset += segment.x_end - segment.x_start;
    return face;
  });
};

const CutInstruction = ({ cut, piece, strip, wallIndex, progress, toggle, selected, onSelect }) => {
  const faces = pieceFaces(piece, strip).filter((face) => face.wall_index === wallIndex);
  const notches = faces.flatMap((face) => face.notches.map((notch) => ({ ...notch, left: notch.x_start - face.x_start + face.offset })));
  return <div className="flex items-start gap-3 border-b border-[var(--rule-hair)] py-4"><button type="button" className="flex min-w-0 flex-1 items-start gap-3 text-left" onClick={() => onSelect(piece.id)} aria-pressed={selected}>
    <span>{selected ? '●' : '○'}</span><span>
      <b>{cut.piece_id} · cut {Math.round(piece.length)} mm</b>
      <small className="block synthetic">Wall strip {piece.strip_number} · hang from {Math.round(piece.y_start)} to {Math.round(piece.y_end)} mm above the floor</small>
      <small className="block synthetic">Roll position {Math.round(cut.start)}–{Math.round(cut.end)} mm · phase {Math.round(cut.phase)} mm{cut.alignment_gap > 0 ? ` · leave ${Math.round(cut.alignment_gap)} mm for pattern alignment before this cut` : ''}</small>
      {notches.map((notch, index) => <small className="block synthetic" key={index}><b>{notch.mode === 'mark' ? 'Mark' : 'Cut'} opening:</b> {Math.round(notch.left)}–{Math.round(notch.left + notch.x_end - notch.x_start)} mm from this strip’s left edge; {Math.round(notch.y_start - piece.y_start)}–{Math.round(notch.y_end - piece.y_start)} mm from this piece’s lower edge.</small>)}
    </span></button><button type="button" className="btn" onClick={() => toggle('cut', cut.piece_id)}>{progress.includes(cut.piece_id) ? 'Cut' : 'Mark cut'}</button></div>;
};

const PieceDiagram = ({ piece, strip, repeat }) => {
  const faces = pieceFaces(piece, strip);
  const width = strip.width || strip.x_end - strip.x_start;
  const scale = Math.min(230 / width, 280 / piece.length);
  const paperWidth = width * scale;
  const paperHeight = piece.length * scale;
  const left = 270 - paperWidth / 2;
  const top = 55;
  return <svg viewBox="0 0 540 405" className="wallpaper-wall-drawing" role="img" aria-label={`${piece.id} cut diagram`}>
    <rect x="0" y="0" width="540" height="405" fill="var(--card)" />
    <text x="28" y="34" className="wallpaper-svg-label">{piece.id} · strip {piece.strip_number}</text><text x="478" y="34" textAnchor="end" className="wallpaper-svg-accent">UP ↑</text>
    <rect x={left} y={top} width={paperWidth} height={paperHeight} fill="var(--ground-2)" stroke="var(--ink)" strokeWidth="2" />
    {faces.slice(1).map((face) => <line key={`fold-${face.offset}`} x1={left + face.offset * scale} x2={left + face.offset * scale} y1={top} y2={top + paperHeight} stroke="var(--ink-3)" strokeDasharray="2 3" />)}
    {faces.flatMap((face) => face.notches.map((notch) => ({ ...notch, left: notch.x_start - face.x_start + face.offset }))).map((notch, index) => { const x = left + notch.left * scale; const notchWidth = (notch.x_end - notch.x_start) * scale; const notchHeight = (notch.y_end - notch.y_start) * scale; const y = top + paperHeight - (notch.y_end - piece.y_start) * scale; return <g key={index}><rect x={x} y={y} width={notchWidth} height={notchHeight} fill="var(--card)" stroke="var(--accent)" strokeWidth="2" strokeDasharray={notch.mode === 'mark' ? '5 4' : undefined} /><text x={x + notchWidth / 2} y={y + notchHeight / 2} textAnchor="middle" className="wallpaper-svg-small">{notch.mode === 'mark' ? 'MARK ON WALL' : 'TABLE CUT'}</text><text x={x + notchWidth / 2} y={y + notchHeight / 2 + 13} textAnchor="middle" className="wallpaper-svg-small">{Math.round(notch.x_end - notch.x_start)} × {Math.round(notch.y_end - notch.y_start)} mm</text></g>; })}
    <line x1={left - 24} y1={top} x2={left - 24} y2={top + paperHeight} stroke="var(--ink-3)" /><text x={left - 32} y={top + paperHeight / 2} textAnchor="middle" transform={`rotate(-90 ${left - 32} ${top + paperHeight / 2})`} className="wallpaper-svg-small">precut {Math.round(piece.length)} mm</text>
    <line x1={left} y1={top + paperHeight + 16} x2={left + paperWidth} y2={top + paperHeight + 16} stroke="var(--ink-3)" /><line x1={left} y1={top + paperHeight + 11} x2={left} y2={top + paperHeight + 21} stroke="var(--ink-3)" /><line x1={left + paperWidth} y1={top + paperHeight + 11} x2={left + paperWidth} y2={top + paperHeight + 21} stroke="var(--ink-3)" /><text x={left + paperWidth / 2} y={top + paperHeight + 32} textAnchor="middle" className="wallpaper-svg-small">finished width {Math.round(width)} mm</text>
    <text x="28" y="374" className="wallpaper-svg-small">Phase {Math.round(piece.phase)} mm{repeat ? ` · repeat ${Math.round(repeat)} mm` : ''}</text><text x="28" y="397" className="wallpaper-svg-small">Solid outline: safe table cut. Dashed outline: mark and trim in place.</text>
  </svg>;
};

const WallpaperOptimizer = () => {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [wallpaper, setWallpaper] = useState({ name: '', manufacturer: '', roll_width: '530', roll_length: '10050', repeat: '0', match: 'straight', price_per_roll: '' });
  const [walls, setWalls] = useState([initialWall]);
  const [corners, setCorners] = useState([]);
  const [patterned, setPatterned] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('Wallpaper project');
  const [saved, setSaved] = useState(null);
  const [projectGroups, setProjectGroups] = useState([]);
  const [projectGroupId, setProjectGroupId] = useState('');
  const [progress, setProgress] = useState({ cut: [], hung: [] });
  const [cutWallIndex, setCutWallIndex] = useState(0);
  const [selectedPieceId, setSelectedPieceId] = useState(null);
  useEffect(() => { if (user) getProjectGroups().then(setProjectGroups).catch(() => {}); }, [user]);
  const updateWall = (index, field, value) => setWalls(walls.map((wall, i) => i === index ? withDerivedMiddle({ ...wall, [field]: value }) : wall));
  const updateWallDimension = (index, dimension, value) => setWalls(walls.map((wall, current) => {
    if (current !== index) return wall;
    const fields = dimension === 'width'
      ? ['width_top', 'width_middle', 'width_bottom']
      : ['height_left', 'height_middle', 'height_right'];
    return { ...wall, ...Object.fromEntries(fields.map((field) => [field, value])) };
  }));
  const updateCutout = (wallIndex, cutoutIndex, field, value) => setWalls(walls.map((wall, index) => index !== wallIndex ? wall : { ...wall, cutouts: wall.cutouts.map((cutout, current) => current === cutoutIndex ? { ...cutout, [field]: value } : cutout) }));
  const removeCutout = (wallIndex, cutoutIndex) => setWalls(walls.map((wall, index) => index !== wallIndex ? wall : { ...wall, cutouts: wall.cutouts.filter((_, current) => current !== cutoutIndex) }));
  const addWall = () => {
    setWalls([...walls, { ...initialWall, name: `Wall ${walls.length + 1}` }]);
    setCorners([...corners, initialCorner()]);
  };
  const removeWall = (wallIndex) => {
    if (walls.length === 1) return;
    setWalls(walls.filter((_, index) => index !== wallIndex));
    if (wallIndex === 0) {
      setCorners(corners.slice(1));
    } else if (wallIndex === walls.length - 1) {
      setCorners(corners.slice(0, -1));
    } else {
      setCorners([
        ...corners.slice(0, wallIndex - 1),
        initialCorner(),
        ...corners.slice(wallIndex + 1),
      ]);
    }
    setError('');
  };
  const updateCorner = (index, update) => {
    setCorners(corners.map((corner, current) => current === index ? { ...corner, ...update } : corner));
    setError('');
  };
  const payload = useMemo(() => ({
    wallpaper: { ...wallpaper, roll_width: numeric(wallpaper.roll_width), roll_length: numeric(wallpaper.roll_length), repeat: patterned ? numeric(wallpaper.repeat) : 0, match: patterned ? wallpaper.match : null, price_per_roll: wallpaper.price_per_roll === '' ? null : numeric(wallpaper.price_per_roll) },
    room: { walls: walls.map(({ cutouts = [], detailedMeasurements: _detailedMeasurements, lower_left: lowerLeft, lower_right: lowerRight, ...wall }) => ({ ...wall, ...(wall.profile === 'sloped' ? { lower_left: numeric(lowerLeft), lower_right: numeric(lowerRight) } : {}), ...Object.fromEntries(Object.entries(wall).map(([key, value]) => [key, key.startsWith('width_') || key.startsWith('height_') ? numeric(value) : value])), cutouts: cutouts.map((cutout) => ({ ...cutout, x: numeric(cutout.x), y: numeric(cutout.y), width: numeric(cutout.width), height: numeric(cutout.height) })) })), corners: corners.map((corner) => ({ ...corner, confirmed_continuation: corner.confirmed_continuation || null })) },
  }), [wallpaper, walls, corners, patterned]);
  const makePlan = async () => {
    const unconfirmedCorner = corners.find((corner) => !corner.confirmed_continuation);
    if (unconfirmedCorner) {
      setError('Confirm whether to continue or start afresh at every corner before creating a buying plan.');
      return;
    }
    const invalidWall = walls.find((wall) => {
      const width = Math.max(numeric(wall.width_top), numeric(wall.width_middle), numeric(wall.width_bottom));
      const height = Math.max(numeric(wall.height_left), numeric(wall.height_middle), numeric(wall.height_right));
      return (wall.cutouts || []).some((cutout) => numeric(cutout.x) < 0 || numeric(cutout.y) < 0 || numeric(cutout.width) <= 0 || numeric(cutout.height) <= 0 || numeric(cutout.x) + numeric(cutout.width) > width || numeric(cutout.y) + numeric(cutout.height) > height);
    });
    if (invalidWall) {
      setError(`Check the openings on ${invalidWall.name}: each must fit inside the measured wall.`);
      return;
    }
    try { setError(''); const result = await createWallpaperPlan(payload); setPlan(result); setStep(2); } catch (err) { setError(err.message); }
  };
  const continueToRoom = () => {
    if (!wallpaper.name.trim() || !wallpaper.manufacturer.trim()) {
      setError('Enter both the wallpaper name and manufacturer before measuring the room.');
      return;
    }
    setError('');
    setStep(1);
  };
  const save = async () => {
    try {
      const body = { name: projectName, project_group_id: projectGroupId || null, wallpaper_data: payload.wallpaper, room_data: payload.room, options_data: {}, plan_result: plan, ordered_rolls: plan.rolls_to_buy, progress_data: progress };
      const result = saved ? await updateWallpaperProject(saved.id, body) : await saveWallpaperProject(body);
      setSaved(result);
      if (user) await saveWallpaper({ name: wallpaper.name, data: payload.wallpaper });
    } catch (err) { setError(err.message); }
  };
  const steps = [
    { label: 'Wallpaper', summary: wallpaper.name || 'Choose wallpaper', locked: 'Choose wallpaper', reachable: true },
    { label: 'Room', summary: `${walls.length} measured wall${walls.length === 1 ? '' : 's'}`, locked: 'Measure the room', reachable: step >= 1 },
    { label: 'Plan', summary: plan ? `${plan.rolls_to_buy} rolls to buy` : 'Calculate material', locked: 'Create a plan', reachable: !!plan },
    { label: 'Cut', summary: plan ? `${plan.pieces.length} pieces` : 'Prepare cut sheets', locked: 'Choose a plan', reachable: !!plan },
    { label: 'Save', summary: saved ? 'Saved locally' : 'Keep this project', locked: 'Prepare cut sheets', reachable: !!plan },
  ];
  const hasConnectedCorner = corners.some((corner) => corner.confirmed_continuation === 'continue');
  const hasSlopedWall = walls.some((wall) => wall.profile === 'sloped');
  const pendingCorners = corners.filter((corner) => !corner.confirmed_continuation).length;
  const toggle = (kind, id) => setProgress((current) => ({ ...current, [kind]: current[kind].includes(id) ? current[kind].filter((item) => item !== id) : [...current[kind], id] }));
  return <CatalogPage>
    <style>{`@media (max-width: 767px) { .wallpaper-measured-sheet, .wallpaper-piece-sheet { box-sizing: border-box; max-width: 100%; overflow-x: auto; overscroll-behavior-inline: contain; } .wallpaper-measured-sheet { margin-inline: -16px; padding-inline: 16px; } .wallpaper-measured-sheet > svg { min-width: 620px; } .wallpaper-piece-sheet { min-width: 0; } .wallpaper-piece-sheet > svg { display: block; min-width: 500px; } } @media print { .plan-steps, nav, .step-head > button, .step-foot, .btn { display: none !important; } .step-view { max-width: none !important; } .wallpaper-wall-drawing { break-inside: avoid; page-break-inside: avoid; } }`}</style>
    <PlanSteps steps={steps} current={step} onSelect={setStep} />
    {error && <div className="alert-danger" role="alert">{error}</div>}
    {step === 0 && <section className="step-view is-form"><div className="step-head"><div><h1 className="step-h1">Wallpaper details</h1><p className="step-lede">Enter the roll dimensions first. Add repeat matching only when the pattern needs it.</p></div></div><div className="grid gap-x-8 gap-y-5 md:grid-cols-2"><label className="form-label">Name<input className="form-input" value={wallpaper.name} onChange={(event) => setWallpaper({ ...wallpaper, name: event.target.value })} /></label><label className="form-label">Manufacturer<input className="form-input" value={wallpaper.manufacturer} onChange={(event) => setWallpaper({ ...wallpaper, manufacturer: event.target.value })} /></label><label className="form-label">Roll width (mm)<input className="form-input" value={wallpaper.roll_width} onChange={(event) => setWallpaper({ ...wallpaper, roll_width: event.target.value })} /></label><label className="form-label">Roll length (mm)<input className="form-input" value={wallpaper.roll_length} onChange={(event) => setWallpaper({ ...wallpaper, roll_length: event.target.value })} /></label></div><div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--rule-hair)' }}><label className="flex items-center gap-2" style={{ fontSize: '13px', fontWeight: 600 }}><input type="checkbox" checked={patterned} onChange={() => setPatterned(!patterned)} /> This wallpaper has a repeating pattern</label>{patterned && <div className="grid gap-x-8 gap-y-5 md:grid-cols-2" style={{ marginTop: '18px' }}><label className="form-label">Repeat (mm)<input className="form-input" value={wallpaper.repeat} onChange={(event) => setWallpaper({ ...wallpaper, repeat: event.target.value })} /></label><label className="form-label">Match<select className="form-select" value={wallpaper.match} onChange={(event) => setWallpaper({ ...wallpaper, match: event.target.value })}><option value="straight">Straight match</option><option value="half_drop">Half-drop</option></select></label></div>}</div><div className="step-foot"><button className="btn-order step-foot-act" onClick={continueToRoom}>Measure the room →</button></div></section>}
    {step === 1 && <section className="step-view is-form"><div className="step-head"><div><h1 className="step-h1">Measure the room</h1><p className="step-lede">Add walls clockwise. Measure every opening from the bottom-left corner.</p></div></div>{walls.map((wall, index) => <section key={index} style={{ marginTop: index ? '26px' : 0, paddingTop: index ? '22px' : 0, borderTop: index ? '1px solid var(--rule-hair)' : undefined }}><div className="section-rule"><label className="form-label" style={{ flex: 1 }}>Wall name<input className="form-input" value={wall.name} onChange={(event) => updateWall(index, 'name', event.target.value)} /></label>{walls.length > 1 && <button type="button" className="btn" style={{ alignSelf: 'flex-end' }} onClick={() => removeWall(index)} aria-label={`Remove ${wall.name}`}>Remove wall</button>}</div>{wall.profile !== 'sloped' && <div className="grid gap-x-8 gap-y-5 md:grid-cols-2"><label className="form-label">Wall width (mm)<input className="form-input" value={wall.width_top} onChange={(event) => updateWallDimension(index, 'width', event.target.value)} /></label>{<label className="form-label">Wall height (mm)<input className="form-input" value={wall.height_left} onChange={(event) => updateWallDimension(index, 'height', event.target.value)} /></label>}</div>}<fieldset style={{ marginTop: '16px' }}><legend className="form-label">Wall shape</legend><div className="grid gap-3 md:grid-cols-2">{wallShapes.map(([profile, label]) => <label key={profile} className="flex items-center gap-3" style={{ padding: '10px', border: `1px solid ${(wall.profile || 'rectangle') === profile ? 'var(--accent)' : 'var(--rule-hair)'}`, cursor: 'pointer' }}><input type="radio" name={`wall-shape-${index}`} checked={(wall.profile || 'rectangle') === profile} onChange={() => setWalls(walls.map((current, currentIndex) => { if (currentIndex !== index) return current; const left = numeric(current.height_left); const flat = left === numeric(current.height_right); return withDerivedMiddle({ ...current, profile, ...(profile === 'sloped' ? { ...(flat ? { height_right: String(Math.max(left - 600, 300)) } : {}), lower_left: current.lower_left ?? '0', lower_right: current.lower_right ?? '0' } : {}) }); }))} /><ShapeIcon profile={profile} /><span>{label}</span></label>)}</div></fieldset>{wall.profile === 'sloped' && <div style={{ marginTop: '16px' }}><p className="synthetic">Type the height of each corner, measured up from the floor. Leave the lower corners at 0 for a flat floor; raise them if the bottom slopes too.</p><WallOutlineEditor wall={wall} onChange={(update) => setWalls(walls.map((current, currentIndex) => currentIndex === index ? withDerivedMiddle({ ...current, ...update }) : current))} /></div>}<div style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--rule-hair)' }}><div className="section-rule"><h3 className="section-title">Openings and fixed obstacles</h3></div><p className="synthetic" style={{ margin: '0 0 14px' }}>Every position is measured from this wall’s {wall.profile === 'sloped' ? 'local lower edge' : 'bottom-left corner'}. Doors and windows are listed first because they are most common.</p>{(wall.cutouts || []).map((cutout, cutoutIndex) => <div key={cutoutIndex} style={{ marginTop: '16px' }}>
  <div className="grid grid-cols-1 items-end gap-x-4 gap-y-4 md:grid-cols-[minmax(130px,1fr)_minmax(155px,1.35fr)_minmax(155px,1.35fr)_repeat(2,minmax(96px,.8fr))_auto]">
    <label className="form-label">Type
      <select className="form-select" value={cutout.kind} onChange={(event) => updateCutout(index, cutoutIndex, 'kind', event.target.value)}>
        <option value="door">Door</option><option value="window">Window</option><option value="opening">Opening</option><option value="heat_pump">Heat pump</option><option value="radiator">Radiator</option><option value="outlet">Outlet</option><option value="switch">Switch</option><option value="pipe">Pipe</option><option value="custom">Custom</option>
      </select>
    </label>
    <label className="form-label">From left edge (mm)<input className="form-input" value={cutout.x} onChange={(event) => updateCutout(index, cutoutIndex, 'x', event.target.value)} /></label>
    <label className="form-label">From {wall.profile === 'sloped' ? 'lower edge' : 'floor'} (mm)<input className="form-input" value={cutout.y} onChange={(event) => updateCutout(index, cutoutIndex, 'y', event.target.value)} /></label>
    <label className="form-label">Width (mm)<input className="form-input" value={cutout.width} onChange={(event) => updateCutout(index, cutoutIndex, 'width', event.target.value)} /></label>
    <label className="form-label">Height (mm)<input className="form-input" value={cutout.height} onChange={(event) => updateCutout(index, cutoutIndex, 'height', event.target.value)} /></label>
    <button type="button" className="btn" onClick={() => removeCutout(index, cutoutIndex)}>Remove</button>
  </div>
  {cutout.kind === 'custom' && <label className="form-label" style={{ display: 'block', marginTop: '12px', maxWidth: '360px' }}>Custom name<input className="form-input" value={cutout.label || ''} onChange={(event) => updateCutout(index, cutoutIndex, 'label', event.target.value)} /></label>}
</div>)}</div><button type="button" className="btn" style={{ marginTop: '16px' }} onClick={() => updateWall(index, 'cutouts', [...(wall.cutouts || []), { kind: 'door', x: '500', y: '0', width: '900', height: '2100', tuck_edges: [] }])}>Add opening or obstacle</button></section>)}{corners.length > 0 && <section aria-label="Corners" style={{ marginTop: '26px', paddingTop: '22px', borderTop: '1px solid var(--rule-hair)' }}><div className="section-rule"><h2 className="section-title">Corners</h2></div><p className="synthetic">Choose the physical corner treatment before calculating material. {pendingCorners ? `${pendingCorners} corner${pendingCorners === 1 ? '' : 's'} still needs a hanging decision.` : 'All corners are confirmed. You can create a draft plan.'}</p>{corners.map((corner, index) => <fieldset key={index} style={{ marginTop: '18px', padding: '16px', border: '1px solid var(--rule-hair)' }}><legend className="form-label">{walls[index].name} → {walls[index + 1].name}</legend><div className="grid gap-4 md:grid-cols-2"><label className="form-label">Corner type<select className="form-select" value={corner.kind} onChange={(event) => updateCorner(index, { kind: event.target.value, confirmed_continuation: '' })}><option value="inside">Inside corner</option><option value="outside">Outside corner</option></select></label><label className="form-label">Hanging decision<select className="form-select" value={corner.confirmed_continuation} onChange={(event) => updateCorner(index, { confirmed_continuation: event.target.value })}><option value="">Confirm a decision</option><option value="start_new">Start a new strip after this corner</option><option value="continue">{corner.kind === 'inside' ? 'Continue the final strip around the corner' : 'Wrap the final strip around the corner'}</option></select></label></div><p className="synthetic" style={{ marginTop: '12px' }}>{corner.kind === 'outside' ? 'Outside corners must wrap: a seam is never placed on the edge.' : corner.confirmed_continuation === 'continue' ? 'Whatever is left of the final strip carries on round the corner onto the next wall, so the pattern keeps flowing. If this corner is not plumb, choose to start a new strip instead.' : 'A new strip starts on the next wall.'}</p></fieldset>)}</section>}<div className="step-foot"><button className="btn" onClick={addWall}>Add wall</button><button className="btn-order step-foot-act" onClick={makePlan} disabled={pendingCorners > 0} aria-describedby={pendingCorners ? 'corner-plan-status' : undefined}>Create plan →</button></div>{pendingCorners > 0 && <p id="corner-plan-status" className="synthetic" style={{ marginTop: '12px', textAlign: 'right' }}>Confirm every corner to create the plan.</p>}</section>}
    {step === 2 && plan && <section className="step-view"><div className="step-head"><div><h1 className="step-h1">Your wallpaper plan</h1><p className="step-lede">{hasSlopedWall ? 'Sloped-wall draft: inspect the geometry, but do not order from this result yet.' : hasConnectedCorner ? 'Connected-corner draft: inspect the geometry, but do not order from this result yet.' : `Buy ${plan.rolls_to_buy} rolls. Review every wall below before cutting or ordering.`}</p></div><button className="btn" onClick={() => setStep(1)}>Edit measurements</button></div><div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_250px]"><div>{walls.map((wall, index) => { const wallStrips = plan.strips.filter((strip) => isOnWall(strip, index)); const wallPieces = plan.pieces.filter((piece) => isOnWall(piece, index)); return <Fragment key={index}><section style={{ marginBottom: '32px' }}><div className="section-rule"><h2 className="section-title">{wall.name}</h2><span className="synthetic">{wallStrips.length} strips · {wallPieces.length} cut pieces</span></div><WallElevation wall={wall} wallIndex={index} plan={plan} wallNames={walls.map((item) => item.name)} /><dl className="grid gap-3 md:grid-cols-3"><div><dt className="form-label">{wall.detailedMeasurements ? 'Widths: ceiling / middle / floor' : 'Measured width'}</dt><dd>{wall.detailedMeasurements ? `${wall.width_top} / ${wall.width_middle} / ${wall.width_bottom} mm` : `${wall.width_top} mm`}</dd></div><div><dt className="form-label">{wall.detailedMeasurements ? 'Heights: left / centre / right' : 'Heights'}</dt><dd>{wall.detailedMeasurements ? `${wall.height_left} / ${wall.height_middle} / ${wall.height_right} mm` : `${wall.height_left} / ${wall.height_right} mm`}</dd></div><div><dt className="form-label">Openings</dt><dd>{(wall.cutouts || []).length || 'None'}</dd></div></dl></section>{index < walls.length - 1 && <CornerConnection from={wall.name} to={walls[index + 1].name} corner={plan.corners?.[index] || payload.room.corners[index]} link={plan.strips.find((strip) => { const all = segmentsOf(strip); return all.some((segment, position) => segment.wall_index === index && all[position + 1]?.wall_index === index + 1); })?.number} />}</Fragment>; })}{[...new Set(plan.warnings)].map((warning) => <p className="synthetic" key={warning}>{warning}</p>)}</div><section><div className="section-rule"><h2 className="section-title">Material summary</h2></div><p><b>{hasSlopedWall || hasConnectedCorner ? `${plan.rolls_to_buy} rolls in this draft` : `${plan.rolls_to_buy} rolls to buy`}</b></p><p className="synthetic">Linear material loss: pattern is alignment skipped from a roll; allowance is the deliberate top/bottom trim; trim is removed around openings; offcut is unused roll end.</p><dl className="cat-table">{Object.entries(plan.waste).map(([name, value]) => <div className="flex justify-between border-b border-[var(--rule-hair)] py-2" key={name}><dt>{name}</dt><dd>{Math.round(value)} mm</dd></div>)}</dl></section></div><div className="step-foot"><button className="btn" onClick={() => setStep(1)}>Back to measurements</button><button className="btn-order step-foot-act" onClick={() => setStep(3)}>Prepare cut sheets →</button></div></section>}
    {step === 3 && plan && <section className="step-view is-form">
      <div className="step-head">
        <div><h1 className="step-h1">Cut one wall at a time</h1><p className="step-lede">Select a wall, cut its labelled pieces in roll order, then use the measurements below for each opening.</p></div>
        <button className="btn" onClick={() => window.print()}>Print</button>
      </div>
      <div className="flex gap-2" style={{ marginBottom: '18px', flexWrap: 'wrap' }}>{walls.map((wall, index) => <button className={`btn ${cutWallIndex === index ? 'is-active' : ''}`} key={wall.name} onClick={() => setCutWallIndex(index)}>{wall.name}</button>)}</div>
      <section style={{ marginBottom: '24px' }}>
        <div className="section-rule"><h2 className="section-title">{walls[cutWallIndex].name}</h2><span className="synthetic">Origin: bottom-left corner</span></div>
        <div className="wallpaper-measured-sheet"><WallElevation wall={walls[cutWallIndex]} wallIndex={cutWallIndex} plan={plan} /></div>
      </section>
      {(() => { const selectedPiece = plan.pieces.find((piece) => piece.id === selectedPieceId && isOnWall(piece, cutWallIndex)) || plan.pieces.find((piece) => isOnWall(piece, cutWallIndex)); const selectedStrip = selectedPiece && plan.strips.find((strip) => strip.number === selectedPiece.strip_number); return selectedPiece && selectedStrip && <section className="wallpaper-piece-sheet" style={{ marginBottom: '24px' }}><div className="section-rule"><h2 className="section-title">Selected piece</h2><span className="synthetic">Select another piece below to update this sheet</span></div><PieceDiagram piece={selectedPiece} strip={selectedStrip} repeat={numeric(wallpaper.repeat)} /></section>; })()}
      {plan.rolls.filter((roll) => roll.cuts.some((cut) => isOnWall(plan.pieces.find((piece) => piece.id === cut.piece_id) || {}, cutWallIndex))).map((roll) => <section key={roll.number} style={{ marginTop: '24px' }}>
        <div className="section-rule"><h2 className="section-title">Roll {roll.number}</h2></div>
        <RollDiagram roll={roll} rollLength={numeric(wallpaper.roll_length)} pieces={plan.pieces} wallIndex={cutWallIndex} />
        <div className="cat-table">{roll.cuts.filter((cut) => isOnWall(plan.pieces.find((piece) => piece.id === cut.piece_id) || {}, cutWallIndex)).map((cut) => {
          const piece = plan.pieces.find((current) => current.id === cut.piece_id);
          const strip = plan.strips.find((current) => current.number === piece.strip_number);
          return <CutInstruction key={cut.piece_id} cut={cut} piece={piece} strip={strip} wallIndex={cutWallIndex} progress={progress.cut} toggle={toggle} selected={selectedPieceId === piece.id} onSelect={setSelectedPieceId} />;
        })}</div>
      </section>)}
      <div className="step-foot"><button className="btn-order step-foot-act" onClick={() => setStep(4)}>Save plan →</button></div>
    </section>}
    {step === 4 && plan && (saved ? <section className="step-view"><div className="step-head"><div><h1 className="step-h1">Plan saved</h1><p className="step-lede">Saved on this instance under your account. Open it any time from your dashboard.</p></div></div><div style={{ marginTop: '24px', padding: '20px', border: '1px solid var(--rule-hair)', background: 'var(--ground-2)' }}><b>✓ Saved as {projectName}</b><p className="synthetic" style={{ margin: '8px 0 0' }}>{projectGroupId ? `Filed under ${projectGroups.find((group) => String(group.id) === String(projectGroupId))?.name || 'your selected project'}.` : 'Not in a project.'}</p></div><div className="step-foot"><button className="btn" onClick={() => setStep(2)}>← Back to the plan</button><button className="btn-order step-foot-act" onClick={() => window.location.assign('/dashboard')}>Open your dashboard →</button></div></section> : <section className="step-view is-form"><div className="step-head"><div><h1 className="step-h1">Save this plan</h1><p className="step-lede">Keep the room measurements, roll count and cut order together.</p></div></div><label className="form-label">Project name<input className="form-input" value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label><label className="form-label" style={{ marginTop: '18px' }}>Project — optional<select className="form-select" value={projectGroupId} onChange={(event) => setProjectGroupId(event.target.value)}><option value="">Not in a project</option>{projectGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><div className="step-foot"><button className="btn" onClick={() => setStep(2)}>← Back to the plan</button><button className="btn-order step-foot-act" onClick={save}>Save plan</button></div></section>)}
  </CatalogPage>;
};

export default WallpaperOptimizer;
