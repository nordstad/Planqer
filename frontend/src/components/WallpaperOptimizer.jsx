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
  return <CatalogPage><main className="wallpaper-preview shell-page">
    <div className="wallpaper-preview-topline"><span>WALLPAPER PLANNER</span><span>All measurements in mm</span></div>
    <header className="wallpaper-preview-header"><div><p className="eyebrow">Planqer / wallpaper</p><h1>Plan the paper<br /><em>before</em> the paste.</h1></div><p>Buy enough, preserve the pattern, and take clear cuts to the table.</p></header>
    <PlanSteps steps={steps} current={step} onSelect={setStep} />
    {error && <p className="form-error" role="alert">{error}</p>}
    {step === 0 && <section className="wallpaper-preview-form"><div><p className="eyebrow">01 / wallpaper</p><h2>The roll sets the rhythm.</h2></div><div className="wallpaper-field-grid"><label>Name<input value={wallpaper.name} onChange={(event) => setWallpaper({ ...wallpaper, name: event.target.value })} /></label><label>Manufacturer<input value={wallpaper.manufacturer} onChange={(event) => setWallpaper({ ...wallpaper, manufacturer: event.target.value })} /></label><label>Roll width<input value={wallpaper.roll_width} onChange={(event) => setWallpaper({ ...wallpaper, roll_width: event.target.value })} /><small>mm</small></label><label>Roll length<input value={wallpaper.roll_length} onChange={(event) => setWallpaper({ ...wallpaper, roll_length: event.target.value })} /><small>mm</small></label></div><button type="button" className={`wallpaper-pattern-toggle ${patterned ? 'is-active' : ''}`} onClick={() => setPatterned(!patterned)}><i>{patterned ? '✓' : ''}</i>This wallpaper has a repeating pattern</button>{patterned && <div className="wallpaper-pattern-options"><label>Repeat<input value={wallpaper.repeat} onChange={(event) => setWallpaper({ ...wallpaper, repeat: event.target.value })} /><small>mm</small></label><div><span>Match</span><div className="wallpaper-match">{['straight', 'half_drop'].map((match) => <button key={match} className={wallpaper.match === match ? 'is-active' : ''} onClick={() => setWallpaper({ ...wallpaper, match })}>{match === 'straight' ? 'Straight' : 'Half-drop'}</button>)}</div></div></div>}<button className="wallpaper-continue" onClick={() => setStep(1)}>Measure the room <span>→</span></button></section>}
    {step === 1 && <section className="wallpaper-room"><div className="wallpaper-room-form"><p className="eyebrow">02 / room</p><h2>Walls, clockwise.</h2>{walls.map((wall, index) => <div className="wallpaper-specimen" key={index}><div><b>{wall.name}</b><div className="wallpaper-field-grid">{['width_top', 'width_middle', 'width_bottom', 'height_left', 'height_middle', 'height_right'].map((field) => <label key={field}>{field.replace('_', ' ')}<input value={wall[field]} onChange={(event) => updateWall(index, field, event.target.value)} /><small>mm</small></label>)}</div><button type="button" className="wallpaper-pattern-toggle" onClick={() => updateWall(index, 'cutouts', [...(wall.cutouts || []), { kind: 'heat_pump', x: '0', y: '0', width: '500', height: '300', tuck_edges: ['top', 'bottom'] }])}>Add fixed obstacle</button></div></div>)}<button className="wallpaper-print" onClick={addWall}>Add wall</button><button className="wallpaper-continue" onClick={makePlan}>Create plan <span>→</span></button></div><aside className="wallpaper-measure-note"><b>Measure from the bottom-left.</b><ol><li>Take top, middle and bottom widths.</li><li>Measure both heights.</li><li>Record every opening’s left and bottom edge.</li></ol></aside></section>}
    {step === 2 && plan && <section><div className="wallpaper-plan-head"><div><p className="eyebrow">03 / plan</p><h2>Buy {plan.rolls_to_buy} rolls.</h2><p className="step-lede">{plan.rolls_needed} needed before the safety margin; area estimate {plan.area_estimate_rolls} rolls.</p></div></div><div className="wallpaper-plan-layout"><div><WallElevation wall={walls[0]} plan={plan} /><div className="wallpaper-wall-key">{plan.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div></div><aside className="wallpaper-buy-card"><span className="wallpaper-buy-kicker">MATERIAL</span><strong>{plan.rolls_to_buy}</strong><b>rolls to buy</b><dl>{Object.entries(plan.waste).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{Math.round(value)} mm</dd></div>)}</dl></aside></div><button className="wallpaper-continue" onClick={() => setStep(3)}>Prepare cut sheets <span>→</span></button></section>}
    {step === 3 && plan && <section className="wallpaper-cut"><div className="wallpaper-cut-head"><div><p className="eyebrow">04 / cut</p><h2>Cut in roll order.</h2><p className="step-lede">Visually align the motif to the prior strip before every patterned cut.</p></div><button className="wallpaper-print" onClick={() => window.print()}>Print</button></div>{plan.rolls.map((roll) => <div key={roll.number}><h3>Roll {roll.number}</h3><div className="wallpaper-piece-list">{roll.cuts.map((cut) => <button key={cut.piece_id} className={`wallpaper-piece ${progress.cut.includes(cut.piece_id) ? 'is-done' : ''}`} onClick={() => toggle('cut', cut.piece_id)}><span>{progress.cut.includes(cut.piece_id) ? '✓' : cut.piece_id}</span><b>{cut.piece_id} · {Math.round(cut.end - cut.start)} mm</b><small>phase {Math.round(cut.phase)} mm · alignment gap {Math.round(cut.alignment_gap)} mm</small></button>)}</div></div>)}<button className="wallpaper-continue" onClick={() => setStep(4)}>Save plan <span>→</span></button></section>}
    {step === 4 && plan && <section className="wallpaper-save"><p className="eyebrow">05 / save</p><h2>Keep the cut order.</h2><label>Project name<input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label><button className="wallpaper-continue" onClick={save}>{saved ? 'Update saved plan' : 'Save plan'} <span>→</span></button></section>}
  </main></CatalogPage>;
};

export default WallpaperOptimizer;
