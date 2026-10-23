import { useEffect, useMemo, useState } from 'react';
import CatalogPage from './CatalogPage';
import PlanSteps from './PlanSteps';
import { createWallpaperPlan, getProjectGroups, saveWallpaper, saveWallpaperProject, updateWallpaperProject } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const numeric = (value) => Number(value) || 0;

const initialWall = {
  name: 'Wall 1', width_top: '2400', width_middle: '2400', width_bottom: '2400',
  height_left: '2400', height_middle: '2400', height_right: '2400', confirmed: true,
};

const WallElevation = ({ wall, wallIndex, plan }) => {
  const width = numeric(wall.width_top);
  const height = Math.max(numeric(wall.height_left), numeric(wall.height_right));
  const strips = (plan?.strips || []).filter((strip) => strip.wall_index === wallIndex);
  return <svg viewBox="0 0 720 360" className="wallpaper-wall-drawing" role="img" aria-label={`${wall.name} elevation`}>
    <rect x="60" y="30" width="600" height="270" fill="var(--ground-2)" stroke="var(--ink)" strokeWidth="2" />
    {strips.map((strip) => <line key={strip.number} x1={60 + (strip.x_end / width) * 600} x2={60 + (strip.x_end / width) * 600} y1="30" y2="300" stroke="var(--accent)" strokeDasharray="5 4" />)}
    {wall.cutouts?.map((cutout, index) => <rect key={index} x={60 + (numeric(cutout.x) / width) * 600} y={300 - ((numeric(cutout.y) + numeric(cutout.height)) / height) * 270} width={(numeric(cutout.width) / width) * 600} height={(numeric(cutout.height) / height) * 270} fill="var(--card)" stroke="var(--ink)" />)}
    <text x="60" y="330" className="wallpaper-svg-small">{width} mm · origin bottom-left</text>
  </svg>;
};

const RollDiagram = ({ roll, rollLength, pieces, wallIndex }) => <svg viewBox="0 0 720 130" style={{ width: '100%', maxWidth: '720px', margin: '12px 0' }} role="img" aria-label={`Roll ${roll.number} cutting sequence`}>
  <rect x="35" y="36" width="650" height="54" fill="var(--ground-2)" stroke="var(--ink)" />
  {roll.cuts.filter((cut) => pieces.find((piece) => piece.id === cut.piece_id)?.wall_index === wallIndex).map((cut) => { const gapStart = 35 + ((cut.start - cut.alignment_gap) / rollLength) * 650; const x = 35 + (cut.start / rollLength) * 650; const width = ((cut.end - cut.start) / rollLength) * 650; return <g key={cut.piece_id}>{cut.alignment_gap > 0 && <rect x={gapStart} y="36" width={(cut.alignment_gap / rollLength) * 650} height="54" fill="var(--accent-bg)" stroke="var(--accent)" strokeDasharray="3 2" />}<rect x={x} y="36" width={width} height="54" fill="var(--card)" stroke="var(--ink)" /><text x={x + width / 2} y="68" textAnchor="middle" className="wallpaper-svg-small">{cut.piece_id}</text></g>; })}
  <text x="35" y="116" className="wallpaper-svg-small">Orange sections are pattern-alignment gaps: keep them as an offcut only when the phase is useful.</text>
</svg>;

const WallpaperOptimizer = () => {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [wallpaper, setWallpaper] = useState({ name: '', manufacturer: '', roll_width: '530', roll_length: '10050', repeat: '0', match: 'straight', price_per_roll: '' });
  const [walls, setWalls] = useState([initialWall]);
  const [patterned, setPatterned] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('Wallpaper project');
  const [saved, setSaved] = useState(null);
  const [projectGroups, setProjectGroups] = useState([]);
  const [projectGroupId, setProjectGroupId] = useState('');
  const [progress, setProgress] = useState({ cut: [], hung: [] });
  const [cutWallIndex, setCutWallIndex] = useState(0);
  useEffect(() => { if (user) getProjectGroups().then(setProjectGroups).catch(() => {}); }, [user]);
  const updateWall = (index, field, value) => setWalls(walls.map((wall, i) => i === index ? { ...wall, [field]: value } : wall));
  const updateWallDimension = (index, dimension, value) => setWalls(walls.map((wall, current) => {
    if (current !== index) return wall;
    const fields = dimension === 'width'
      ? ['width_top', 'width_middle', 'width_bottom']
      : ['height_left', 'height_middle', 'height_right'];
    return { ...wall, ...Object.fromEntries(fields.map((field) => [field, value])) };
  }));
  const updateCutout = (wallIndex, cutoutIndex, field, value) => setWalls(walls.map((wall, index) => index !== wallIndex ? wall : { ...wall, cutouts: wall.cutouts.map((cutout, current) => current === cutoutIndex ? { ...cutout, [field]: value } : cutout) }));
  const removeCutout = (wallIndex, cutoutIndex) => setWalls(walls.map((wall, index) => index !== wallIndex ? wall : { ...wall, cutouts: wall.cutouts.filter((_, current) => current !== cutoutIndex) }));
  const addWall = () => setWalls([...walls, { ...initialWall, name: `Wall ${walls.length + 1}` }]);
  const payload = useMemo(() => ({
    wallpaper: { ...wallpaper, roll_width: numeric(wallpaper.roll_width), roll_length: numeric(wallpaper.roll_length), repeat: patterned ? numeric(wallpaper.repeat) : 0, match: patterned ? wallpaper.match : null, price_per_roll: wallpaper.price_per_roll === '' ? null : numeric(wallpaper.price_per_roll) },
    room: { walls: walls.map(({ cutouts = [], ...wall }) => ({ ...wall, ...Object.fromEntries(Object.entries(wall).map(([key, value]) => [key, key.startsWith('width_') || key.startsWith('height_') ? numeric(value) : value])), cutouts: cutouts.map((cutout) => ({ ...cutout, x: numeric(cutout.x), y: numeric(cutout.y), width: numeric(cutout.width), height: numeric(cutout.height) })) })), corners: walls.slice(1).map(() => ({ kind: 'inside', confirmed_continuation: 'start_new' })) },
  }), [wallpaper, walls, patterned]);
  const makePlan = async () => {
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
  const toggle = (kind, id) => setProgress((current) => ({ ...current, [kind]: current[kind].includes(id) ? current[kind].filter((item) => item !== id) : [...current[kind], id] }));
  return <CatalogPage>
    <PlanSteps steps={steps} current={step} onSelect={setStep} />
    {error && <div className="alert-danger" role="alert">{error}</div>}
    {step === 0 && <section className="step-view is-form"><div className="step-head"><div><h1 className="step-h1">Wallpaper details</h1><p className="step-lede">Enter the roll dimensions first. Add repeat matching only when the pattern needs it.</p></div></div><div className="grid gap-x-8 gap-y-5 md:grid-cols-2"><label className="form-label">Name<input className="form-input" value={wallpaper.name} onChange={(event) => setWallpaper({ ...wallpaper, name: event.target.value })} /></label><label className="form-label">Manufacturer<input className="form-input" value={wallpaper.manufacturer} onChange={(event) => setWallpaper({ ...wallpaper, manufacturer: event.target.value })} /></label><label className="form-label">Roll width (mm)<input className="form-input" value={wallpaper.roll_width} onChange={(event) => setWallpaper({ ...wallpaper, roll_width: event.target.value })} /></label><label className="form-label">Roll length (mm)<input className="form-input" value={wallpaper.roll_length} onChange={(event) => setWallpaper({ ...wallpaper, roll_length: event.target.value })} /></label></div><div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--rule-hair)' }}><label className="flex items-center gap-2" style={{ fontSize: '13px', fontWeight: 600 }}><input type="checkbox" checked={patterned} onChange={() => setPatterned(!patterned)} /> This wallpaper has a repeating pattern</label>{patterned && <div className="grid gap-x-8 gap-y-5 md:grid-cols-2" style={{ marginTop: '18px' }}><label className="form-label">Repeat (mm)<input className="form-input" value={wallpaper.repeat} onChange={(event) => setWallpaper({ ...wallpaper, repeat: event.target.value })} /></label><label className="form-label">Match<select className="form-select" value={wallpaper.match} onChange={(event) => setWallpaper({ ...wallpaper, match: event.target.value })}><option value="straight">Straight match</option><option value="half_drop">Half-drop</option></select></label></div>}</div><div className="step-foot"><button className="btn-order step-foot-act" onClick={() => setStep(1)}>Measure the room →</button></div></section>}
    {step === 1 && <section className="step-view is-form"><div className="step-head"><div><h1 className="step-h1">Measure the room</h1><p className="step-lede">Add walls clockwise. Measure every opening from the bottom-left corner.</p></div></div>{walls.map((wall, index) => <section key={index} style={{ marginTop: index ? '26px' : 0, paddingTop: index ? '22px' : 0, borderTop: index ? '1px solid var(--rule-hair)' : undefined }}><div className="section-rule"><label className="form-label" style={{ flex: 1 }}>Wall name<input className="form-input" value={wall.name} onChange={(event) => updateWall(index, 'name', event.target.value)} /></label></div><div className="grid gap-x-8 gap-y-5 md:grid-cols-2"><label className="form-label">Wall width (mm)<input className="form-input" value={wall.width_top} onChange={(event) => updateWallDimension(index, 'width', event.target.value)} /></label><label className="form-label">Wall height (mm)<input className="form-input" value={wall.height_left} onChange={(event) => updateWallDimension(index, 'height', event.target.value)} /></label></div><label className="flex items-center gap-2" style={{ marginTop: '16px', fontSize: '13px', fontWeight: 600 }}><input type="checkbox" checked={Boolean(wall.detailedMeasurements)} onChange={(event) => updateWall(index, 'detailedMeasurements', event.target.checked)} /> This wall is uneven or sloped</label>{wall.detailedMeasurements && <div className="grid gap-x-8 gap-y-5 md:grid-cols-2" style={{ marginTop: '16px' }}>{['width_top', 'width_middle', 'width_bottom', 'height_left', 'height_middle', 'height_right'].map((field) => <label className="form-label" key={field}>{field.replace('_', ' ')} (mm)<input className="form-input" value={wall[field]} onChange={(event) => updateWall(index, field, event.target.value)} /></label>)}</div>}<div style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid var(--rule-hair)' }}><div className="section-rule"><h3 className="section-title">Openings and fixed obstacles</h3></div><p className="synthetic" style={{ margin: '0 0 14px' }}>Every position is measured from this wall’s bottom-left corner. Doors and windows are listed first because they are most common.</p>{(wall.cutouts || []).map((cutout, cutoutIndex) => <div key={cutoutIndex} style={{ marginTop: '16px' }}>
  <div className="grid grid-cols-1 items-end gap-x-4 gap-y-4 md:grid-cols-[minmax(130px,1fr)_minmax(155px,1.35fr)_minmax(155px,1.35fr)_repeat(2,minmax(96px,.8fr))_auto]">
    <label className="form-label">Type
      <select className="form-select" value={cutout.kind} onChange={(event) => updateCutout(index, cutoutIndex, 'kind', event.target.value)}>
        <option value="door">Door</option><option value="window">Window</option><option value="opening">Opening</option><option value="heat_pump">Heat pump</option><option value="radiator">Radiator</option><option value="outlet">Outlet</option><option value="switch">Switch</option><option value="pipe">Pipe</option><option value="custom">Custom</option>
      </select>
    </label>
    <label className="form-label">From left edge (mm)<input className="form-input" value={cutout.x} onChange={(event) => updateCutout(index, cutoutIndex, 'x', event.target.value)} /></label>
    <label className="form-label">From floor (mm)<input className="form-input" value={cutout.y} onChange={(event) => updateCutout(index, cutoutIndex, 'y', event.target.value)} /></label>
    <label className="form-label">Width (mm)<input className="form-input" value={cutout.width} onChange={(event) => updateCutout(index, cutoutIndex, 'width', event.target.value)} /></label>
    <label className="form-label">Height (mm)<input className="form-input" value={cutout.height} onChange={(event) => updateCutout(index, cutoutIndex, 'height', event.target.value)} /></label>
    <button type="button" className="btn" onClick={() => removeCutout(index, cutoutIndex)}>Remove</button>
  </div>
  {cutout.kind === 'custom' && <label className="form-label" style={{ display: 'block', marginTop: '12px', maxWidth: '360px' }}>Custom name<input className="form-input" value={cutout.label || ''} onChange={(event) => updateCutout(index, cutoutIndex, 'label', event.target.value)} /></label>}
</div>)}</div><button type="button" className="btn" style={{ marginTop: '16px' }} onClick={() => updateWall(index, 'cutouts', [...(wall.cutouts || []), { kind: 'door', x: '500', y: '0', width: '900', height: '2100', tuck_edges: [] }])}>Add opening or obstacle</button></section>)}{error && <div className="alert-danger" role="alert" style={{ marginTop: '20px' }}>{error}</div>}<div className="step-foot"><button className="btn" onClick={addWall}>Add wall</button><button className="btn-order step-foot-act" onClick={makePlan}>Create plan →</button></div></section>}
    {step === 2 && plan && <section className="step-view"><div className="step-head"><div><h1 className="step-h1">Your wallpaper plan</h1><p className="step-lede">Buy {plan.rolls_to_buy} rolls. Review every wall below before cutting or ordering.</p></div><button className="btn" onClick={() => setStep(1)}>Edit measurements</button></div><div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_250px]"><div>{walls.map((wall, index) => { const wallStrips = plan.strips.filter((strip) => strip.wall_index === index); const wallPieces = plan.pieces.filter((piece) => piece.wall_index === index); return <section key={index} style={{ marginBottom: '32px' }}><div className="section-rule"><h2 className="section-title">{wall.name}</h2><span className="synthetic">{wallStrips.length} strips · {wallPieces.length} cut pieces</span></div><WallElevation wall={wall} wallIndex={index} plan={plan} /><dl className="grid gap-3 md:grid-cols-3"><div><dt className="form-label">Measured width</dt><dd>{wall.width_top} mm</dd></div><div><dt className="form-label">Heights</dt><dd>{wall.height_left} / {wall.height_right} mm</dd></div><div><dt className="form-label">Openings</dt><dd>{(wall.cutouts || []).length || 'None'}</dd></div></dl></section>; })}{[...new Set(plan.warnings)].map((warning) => <p className="synthetic" key={warning}>{warning}</p>)}</div><section><div className="section-rule"><h2 className="section-title">Material summary</h2></div><p><b>{plan.rolls_to_buy} rolls to buy</b></p><p className="synthetic">Linear material loss: pattern is alignment skipped from a roll; allowance is the deliberate top/bottom trim; trim is removed around openings; offcut is unused roll end.</p><dl className="cat-table">{Object.entries(plan.waste).map(([name, value]) => <div className="flex justify-between border-b border-[var(--rule-hair)] py-2" key={name}><dt>{name}</dt><dd>{Math.round(value)} mm</dd></div>)}</dl></section></div><div className="step-foot"><button className="btn" onClick={() => setStep(1)}>Back to measurements</button><button className="btn-order step-foot-act" onClick={() => setStep(3)}>Prepare cut sheets →</button></div></section>}
    {step === 3 && plan && <section className="step-view is-form"><div className="step-head"><div><h1 className="step-h1">Cut in roll order</h1><p className="step-lede">Visually align the motif to the prior strip before every patterned cut.</p></div><button className="btn" onClick={() => window.print()}>Print</button></div><div className="flex gap-2" style={{ marginBottom: '18px', flexWrap: 'wrap' }}>{walls.map((wall, index) => <button className={`btn ${cutWallIndex === index ? 'is-active' : ''}`} key={wall.name} onClick={() => setCutWallIndex(index)}>{wall.name}</button>)}</div>{plan.rolls.map((roll) => <section key={roll.number} style={{ marginTop: '24px' }}><div className="section-rule"><h2 className="section-title">Roll {roll.number}</h2></div><RollDiagram roll={roll} rollLength={numeric(wallpaper.roll_length)} pieces={plan.pieces} wallIndex={cutWallIndex} /><div className="cat-table">{roll.cuts.filter((cut) => plan.pieces.find((piece) => piece.id === cut.piece_id)?.wall_index === cutWallIndex).map((cut) => <button key={cut.piece_id} className="flex w-full items-start gap-3 border-b border-[var(--rule-hair)] py-3 text-left" onClick={() => toggle('cut', cut.piece_id)}><span>{progress.cut.includes(cut.piece_id) ? '✓' : '○'}</span><span><b>{cut.piece_id} · {Math.round(cut.end - cut.start)} mm</b><small className="block synthetic">phase {Math.round(cut.phase)} mm · alignment gap {Math.round(cut.alignment_gap)} mm</small></span></button>)}</div></section>)}<div className="step-foot"><button className="btn-order step-foot-act" onClick={() => setStep(4)}>Save plan →</button></div></section>}
    {step === 4 && plan && <section className="step-view is-form"><div className="step-head"><div><h1 className="step-h1">Save this plan</h1><p className="step-lede">Keep the room measurements, roll count and cut order together.</p></div></div><label className="form-label">Project name<input className="form-input" value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label><label className="form-label" style={{ marginTop: '18px' }}>Project — optional<select className="form-select" value={projectGroupId} onChange={(event) => setProjectGroupId(event.target.value)}><option value="">Not in a project</option>{projectGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><div className="step-foot"><button className="btn-order step-foot-act" onClick={save}>{saved ? 'Update saved plan' : 'Save plan'}</button></div></section>}
  </CatalogPage>;
};

export default WallpaperOptimizer;
