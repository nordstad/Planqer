import { useMemo, useState } from 'react';
import CatalogPage from './CatalogPage';
import PlanSteps from './PlanSteps';
import { createWallpaperPlan, saveWallpaper, saveWallpaperProject, updateWallpaperProject } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

const numeric = (value) => Number(value) || 0;

const initialWall = {
  name: 'Wall 1', width_top: '2400', width_middle: '2400', width_bottom: '2400',
  height_left: '2400', height_middle: '2400', height_right: '2400', confirmed: true,
};

const WallElevation = ({ wall, plan }) => {
  const width = numeric(wall.width_top);
  const height = Math.max(numeric(wall.height_left), numeric(wall.height_right));
  const strips = plan?.strips || [];
  return <svg viewBox="0 0 720 360" className="wallpaper-wall-drawing" role="img" aria-label={`${wall.name} elevation`}>
    <rect x="60" y="30" width="600" height="270" fill="var(--ground-2)" stroke="var(--ink)" strokeWidth="2" />
    {strips.map((strip) => <line key={strip.number} x1={60 + (strip.x_end / width) * 600} x2={60 + (strip.x_end / width) * 600} y1="30" y2="300" stroke="var(--accent)" strokeDasharray="5 4" />)}
    {wall.cutouts?.map((cutout, index) => <rect key={index} x={60 + (numeric(cutout.x) / width) * 600} y={300 - ((numeric(cutout.y) + numeric(cutout.height)) / height) * 270} width={(numeric(cutout.width) / width) * 600} height={(numeric(cutout.height) / height) * 270} fill="var(--card)" stroke="var(--ink)" />)}
    <text x="60" y="330" className="wallpaper-svg-small">{width} mm · origin bottom-left</text>
  </svg>;
};

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
  const [progress, setProgress] = useState({ cut: [], hung: [] });
  const updateWall = (index, field, value) => setWalls(walls.map((wall, i) => i === index ? { ...wall, [field]: value } : wall));
  const addWall = () => setWalls([...walls, { ...initialWall, name: `Wall ${walls.length + 1}` }]);
  const payload = useMemo(() => ({
    wallpaper: { ...wallpaper, roll_width: numeric(wallpaper.roll_width), roll_length: numeric(wallpaper.roll_length), repeat: patterned ? numeric(wallpaper.repeat) : 0, match: patterned ? wallpaper.match : null, price_per_roll: wallpaper.price_per_roll === '' ? null : numeric(wallpaper.price_per_roll) },
    room: { walls: walls.map(({ cutouts = [], ...wall }) => ({ ...wall, ...Object.fromEntries(Object.entries(wall).map(([key, value]) => [key, key.startsWith('width_') || key.startsWith('height_') ? numeric(value) : value])), cutouts: cutouts.map((cutout) => ({ ...cutout, x: numeric(cutout.x), y: numeric(cutout.y), width: numeric(cutout.width), height: numeric(cutout.height) })) })), corners: walls.slice(1).map(() => ({ kind: 'inside', confirmed_continuation: 'start_new' })) },
  }), [wallpaper, walls, patterned]);
  const makePlan = async () => {
    try { setError(''); const result = await createWallpaperPlan(payload); setPlan(result); setStep(2); } catch (err) { setError(err.message); }
  };
  const save = async () => {
    try {
      const body = { name: projectName, wallpaper_data: payload.wallpaper, room_data: payload.room, options_data: {}, plan_result: plan, ordered_rolls: plan.rolls_to_buy, progress_data: progress };
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
    {step === 1 && <section className="step-view is-form"><div className="step-head"><div><h1 className="step-h1">Measure the room</h1><p className="step-lede">Add walls clockwise. Measure every opening from the bottom-left corner.</p></div></div>{walls.map((wall, index) => <section key={index} style={{ marginTop: index ? '26px' : 0, paddingTop: index ? '22px' : 0, borderTop: index ? '1px solid var(--rule-hair)' : undefined }}><div className="section-rule"><h2 className="section-title">{wall.name}</h2></div><div className="grid gap-x-8 gap-y-5 md:grid-cols-2">{['width_top', 'width_middle', 'width_bottom', 'height_left', 'height_middle', 'height_right'].map((field) => <label className="form-label" key={field}>{field.replace('_', ' ')} (mm)<input className="form-input" value={wall[field]} onChange={(event) => updateWall(index, field, event.target.value)} /></label>)}</div><button type="button" className="btn" style={{ marginTop: '16px' }} onClick={() => updateWall(index, 'cutouts', [...(wall.cutouts || []), { kind: 'heat_pump', x: '0', y: '0', width: '500', height: '300', tuck_edges: ['top', 'bottom'] }])}>Add fixed obstacle</button></section>)}<div className="step-foot"><button className="btn" onClick={addWall}>Add wall</button><button className="btn-order step-foot-act" onClick={makePlan}>Create plan →</button></div></section>}
    {step === 2 && plan && <section className="step-view"><div className="step-head"><div><h1 className="step-h1">Your wallpaper plan</h1><p className="step-lede">Buy {plan.rolls_to_buy} rolls. {plan.rolls_needed} are needed before the safety margin; the area estimate is {plan.area_estimate_rolls} rolls.</p></div></div><div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_250px]"><div><WallElevation wall={walls[0]} plan={plan} />{plan.warnings.map((warning) => <p className="synthetic" key={warning}>{warning}</p>)}</div><section><div className="section-rule"><h2 className="section-title">Material summary</h2></div><dl className="cat-table">{Object.entries(plan.waste).map(([name, value]) => <div className="flex justify-between border-b border-[var(--rule-hair)] py-2" key={name}><dt>{name}</dt><dd>{Math.round(value)} mm</dd></div>)}</dl></section></div><div className="step-foot"><button className="btn-order step-foot-act" onClick={() => setStep(3)}>Prepare cut sheets →</button></div></section>}
    {step === 3 && plan && <section className="step-view is-form"><div className="step-head"><div><h1 className="step-h1">Cut in roll order</h1><p className="step-lede">Visually align the motif to the prior strip before every patterned cut.</p></div><button className="btn" onClick={() => window.print()}>Print</button></div>{plan.rolls.map((roll) => <section key={roll.number} style={{ marginTop: '24px' }}><div className="section-rule"><h2 className="section-title">Roll {roll.number}</h2></div><div className="cat-table">{roll.cuts.map((cut) => <button key={cut.piece_id} className="flex w-full items-start gap-3 border-b border-[var(--rule-hair)] py-3 text-left" onClick={() => toggle('cut', cut.piece_id)}><span>{progress.cut.includes(cut.piece_id) ? '✓' : '○'}</span><span><b>{cut.piece_id} · {Math.round(cut.end - cut.start)} mm</b><small className="block synthetic">phase {Math.round(cut.phase)} mm · alignment gap {Math.round(cut.alignment_gap)} mm</small></span></button>)}</div></section>)}<div className="step-foot"><button className="btn-order step-foot-act" onClick={() => setStep(4)}>Save plan →</button></div></section>}
    {step === 4 && plan && <section className="step-view is-form"><div className="step-head"><div><h1 className="step-h1">Save this plan</h1><p className="step-lede">Keep the room measurements, roll count and cut order together.</p></div></div><label className="form-label">Project name<input className="form-input" value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label><div className="step-foot"><button className="btn-order step-foot-act" onClick={save}>{saved ? 'Update saved plan' : 'Save plan'}</button></div></section>}
  </CatalogPage>;
};

export default WallpaperOptimizer;
