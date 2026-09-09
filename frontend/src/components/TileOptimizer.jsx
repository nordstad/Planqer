/*
  Tile / board / panel layout, in the same three steps as the other two
  optimizers — say what you're covering, read the candidates, keep one — so
  a third page doesn't teach a third habit.

  Where this page genuinely differs: the plan step doesn't auto-pick one
  answer. Safety (no ugly sliver at an edge), tile count, and left/right +
  top/bottom symmetry can conflict, so the solver returns several
  Pareto-ranked candidates and the person doing the cutting picks the
  tradeoff that fits the job — see .plans/tile-layout.md Decision #3.
*/

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  optimizeTileLayout, getProjectGroups, createProjectGroup,
  saveTileProject, getUserTileProjects,
} from '../utils/api';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../contexts/AuthContext';
import CatalogPage from './CatalogPage';
import Disclosure from './Disclosure';
import ProjectPicker from './ProjectPicker';
import Loader from './Loader';
import PlanSteps from './PlanSteps';
import CutoutRow from './CutoutRow';
import TileLayoutCandidateCard from './TileLayoutCandidateCard';
import TileResultDisplay from './TileResultDisplay';
import { ArrowLeft, ArrowRight, Plus, Tick } from './icons';
import { smallestCutMm } from '../utils/tileCutList';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

const STEP_SURFACE = 0;
const STEP_LAYOUT = 1;
const STEP_KEEP = 2;

const numberError = (value, { min, max, label, allowZero = false }) => {
  const n = parseFloat(value);
  if (value === '' || isNaN(n)) return `${label} must be a number`;
  if (allowZero ? n < min : n <= min) return `${label} must be greater than ${min}`;
  if (n > max) return `${label} cannot exceed ${max}`;
  return '';
};

const validateCutouts = (cutouts, surfaceWidth, surfaceHeight) => cutouts.map((cutout) => {
  const errors = {};
  const x = parseFloat(cutout.x);
  const y = parseFloat(cutout.y);
  const width = parseFloat(cutout.width);
  const height = parseFloat(cutout.height);
  const sw = parseFloat(surfaceWidth);
  const sh = parseFloat(surfaceHeight);

  if (cutout.x === '' || isNaN(x) || x < 0) errors.x = 'x must be 0 or more';
  if (cutout.y === '' || isNaN(y) || y < 0) errors.y = 'y must be 0 or more';
  if (!cutout.width || isNaN(width) || width <= 0) errors.width = 'Width must be a positive number';
  if (!cutout.height || isNaN(height) || height <= 0) errors.height = 'Height must be a positive number';

  if (!errors.x && !errors.width && !isNaN(sw) && x + width > sw) errors.width = 'Runs past the right edge of the surface';
  if (!errors.y && !errors.height && !isNaN(sh) && y + height > sh) errors.height = 'Runs past the top edge of the surface';

  return Object.keys(errors).length > 0 ? errors : null;
});

const TileOptimizer = () => {
  const { user } = useAuth();
  const [step, setStep] = useState(STEP_SURFACE);

  const [surfaceWidth, setSurfaceWidth] = useState('2400');
  const [surfaceHeight, setSurfaceHeight] = useState('1200');
  const [cutouts, setCutouts] = useState([]);

  const [tileWidth, setTileWidth] = useState('300');
  const [tileHeight, setTileHeight] = useState('600');
  const [allowRotation, setAllowRotation] = useState(false);

  const [jointWidth, setJointWidth] = useState('3');
  const [perimeterGap, setPerimeterGap] = useState('0');

  const [bondPattern, setBondPattern] = useState('running');
  const [offsetFraction, setOffsetFraction] = useState('0.5');

  const [minEdgeCut, setMinEdgeCut] = useState('');
  const [wastePercent, setWastePercent] = useState('10');
  const [candidateCount, setCandidateCount] = useState('5');
  const [reuseOffcuts, setReuseOffcuts] = useState(true);
  const [guardOpen, setGuardOpen] = useState(false);

  const [result, setResult] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [inputErrors, setInputErrors] = useState({
    cutouts: [], surfaceWidth: '', surfaceHeight: '', tileWidth: '', tileHeight: '',
    jointWidth: '', perimeterGap: '', minEdgeCut: '', wastePercent: '', candidateCount: '',
  });
  const [surfaceAttempted, setSurfaceAttempted] = useState(false);

  /* the save step */
  const [projectGroups, setProjectGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);

  /* loading one back */
  const [userProjects, setUserProjects] = useState([]);
  const [loadModalOpen, setLoadModalOpen] = useState(false);

  const debounced = {
    surfaceWidth: useDebounce(surfaceWidth, 300),
    surfaceHeight: useDebounce(surfaceHeight, 300),
    cutouts: useDebounce(cutouts, 300),
    tileWidth: useDebounce(tileWidth, 300),
    tileHeight: useDebounce(tileHeight, 300),
    jointWidth: useDebounce(jointWidth, 300),
    perimeterGap: useDebounce(perimeterGap, 300),
    minEdgeCut: useDebounce(minEdgeCut, 300),
    wastePercent: useDebounce(wastePercent, 300),
    candidateCount: useDebounce(candidateCount, 300),
  };

  useEffect(() => {
    setInputErrors({
      cutouts: validateCutouts(debounced.cutouts, debounced.surfaceWidth, debounced.surfaceHeight),
      surfaceWidth: numberError(debounced.surfaceWidth, { min: 100, max: 20000, label: 'Surface width' }),
      surfaceHeight: numberError(debounced.surfaceHeight, { min: 100, max: 20000, label: 'Surface height' }),
      tileWidth: numberError(debounced.tileWidth, { min: 10, max: 3000, label: 'Tile width' }),
      tileHeight: numberError(debounced.tileHeight, { min: 10, max: 3000, label: 'Tile height' }),
      jointWidth: numberError(debounced.jointWidth, { min: 0, max: 50, label: 'Joint width', allowZero: true }),
      perimeterGap: numberError(debounced.perimeterGap, { min: 0, max: 200, label: 'Perimeter gap', allowZero: true }),
      minEdgeCut: debounced.minEdgeCut === ''
        ? ''
        : numberError(debounced.minEdgeCut, { min: 0, max: 3000, label: 'Sliver threshold', allowZero: true }),
      wastePercent: numberError(debounced.wastePercent, { min: 0, max: 100, label: 'Breakage allowance', allowZero: true }),
      candidateCount: (() => {
        const n = parseInt(debounced.candidateCount, 10);
        if (!debounced.candidateCount || isNaN(n) || n < 1) return 'Must show at least 1 candidate';
        if (n > 20) return 'Cannot show more than 20 candidates';
        return '';
      })(),
    });
  }, [
    debounced.cutouts, debounced.surfaceWidth, debounced.surfaceHeight, debounced.tileWidth, debounced.tileHeight,
    debounced.jointWidth, debounced.perimeterGap, debounced.minEdgeCut, debounced.wastePercent, debounced.candidateCount,
  ]);

  useEffect(() => {
    if (user) {
      getProjectGroups().then(setProjectGroups).catch(() => {});
      getUserTileProjects().then(setUserProjects).catch(() => {});
    }
  }, [user]);

  /* ── a layout belongs to its inputs ────────────────────────────────────── */
  const retireLayout = () => {
    setResult(null);
    setSelectedIndex(0);
    setApiError('');
    setSaved(null);
  };

  const setField = (setter) => (value) => { retireLayout(); setter(value); };

  const handleCutoutChange = (index, field, value) => {
    retireLayout();
    setCutouts(cutouts.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const addCutout = () => {
    retireLayout();
    setCutouts([...cutouts, { x: '', y: '', width: '', height: '', label: '' }]);
  };

  const removeCutout = (index) => {
    retireLayout();
    setCutouts(cutouts.filter((_, i) => i !== index));
  };

  const loadProject = (project) => {
    retireLayout();
    setSurfaceWidth(project.surface_data.width.toString());
    setSurfaceHeight(project.surface_data.height.toString());
    setCutouts((project.surface_data.cutouts || []).map((c) => ({
      x: c.x.toString(), y: c.y.toString(), width: c.width.toString(), height: c.height.toString(),
      label: c.label || '',
    })));
    setTileWidth(project.tile_data.width.toString());
    setTileHeight(project.tile_data.height.toString());
    setAllowRotation(!!project.tile_data.allow_rotation);
    setJointWidth((project.bond_data.joint_width ?? 3).toString());
    setPerimeterGap((project.bond_data.perimeter_gap ?? 0).toString());
    setBondPattern(project.bond_data.pattern || 'stack');
    setOffsetFraction((project.bond_data.offset_fraction ?? 0.5).toString());
    const options = project.options_data || {};
    setMinEdgeCut(options.min_edge_cut === null || options.min_edge_cut === undefined ? '' : options.min_edge_cut.toString());
    setWastePercent((options.waste_percent ?? 10).toString());
    setCandidateCount((options.candidate_count ?? 5).toString());
    setReuseOffcuts(options.reuse_offcuts !== false);
    setSelectedGroupId(project.project_group_id || '');
    setProjectName(project.name);
    setLoadModalOpen(false);
    setStep(STEP_SURFACE);
  };

  /* ── derived facts ─────────────────────────────────────────────────────── */
  const hasErrors = inputErrors.cutouts.some(Boolean)
    || !!inputErrors.surfaceWidth || !!inputErrors.surfaceHeight
    || !!inputErrors.tileWidth || !!inputErrors.tileHeight
    || !!inputErrors.jointWidth || !!inputErrors.perimeterGap
    || !!inputErrors.minEdgeCut || !!inputErrors.wastePercent || !!inputErrors.candidateCount;

  const bondSummary = bondPattern === 'running'
    ? `running ${Math.round(parseFloat(offsetFraction) * 100)}%`
    : {
        stack: 'stack', herringbone: 'herringbone', diagonal: 'diagonal',
        diagonal_herringbone: 'diagonal herringbone',
        double_herringbone: 'double herringbone',
        diagonal_double_herringbone: 'diagonal double herringbone',
      }[bondPattern] || 'stack';

  const surfaceSummary = `${mm(parseFloat(surfaceWidth))} × ${mm(parseFloat(surfaceHeight))} mm`
    + ` · ${mm(parseFloat(tileWidth))} × ${mm(parseFloat(tileHeight))} tile`
    + ` · ${mm(parseFloat(jointWidth))} mm joint`
    + ` · ${bondSummary}`;

  const selected = result ? result.candidates[selectedIndex] : null;

  /* ── running a layout ──────────────────────────────────────────────────── */
  const handleLayoutSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    setSurfaceAttempted(true);
    if (hasErrors) return;

    setLoading(true);
    setResult(null);
    setSaved(null);
    try {
      const response = await optimizeTileLayout({
        surfaceWidth, surfaceHeight, cutouts,
        tile: { width: tileWidth, height: tileHeight, allowRotation },
        joint: { jointWidth, perimeterGap },
        bond: { pattern: bondPattern, offsetFraction },
        minEdgeCut, reuseOffcuts, wastePercent, candidateCount,
        projectName,
      });
      setResult(response);
      setSelectedIndex(response.recommended_index);
      setStep(STEP_LAYOUT);
    } catch (error) {
      setApiError(error.message || 'Unknown error');
    }
    setLoading(false);
  };

  /* ── keeping a layout ──────────────────────────────────────────────────── */
  const nameError = saveAttempted && !projectName.trim()
    ? 'Give the layout a name so you can find it again — “Kitchen splashback” beats “Untitled”'
    : '';

  const createGroup = async (name) => {
    try {
      const group = await createProjectGroup(name);
      setProjectGroups(prev => [group, ...prev]);
      setSelectedGroupId(group.id);
      setApiError('');
      return true;
    } catch (err) {
      setApiError('Could not create that project: ' + err.message);
      return false;
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveAttempted(true);
    setApiError('');
    if (!projectName.trim()) return;

    setSaving(true);
    try {
      const project = await saveTileProject({
        name: projectName.trim(),
        projectGroupId: selectedGroupId,
        surfaceWidth, surfaceHeight, cutouts,
        tile: { width: tileWidth, height: tileHeight, allowRotation },
        joint: { jointWidth, perimeterGap },
        bond: { pattern: bondPattern, offsetFraction },
        minEdgeCut, reuseOffcuts, wastePercent, candidateCount,
        candidate: selected,
      });
      setSaved(project);
      setUserProjects(prev => [project, ...prev]);
    } catch (error) {
      setApiError(error.message || 'Could not save this layout');
    }
    setSaving(false);
  };

  const savedGroupName = saved
    ? projectGroups.find(g => g.id === saved.project_group_id)?.name
    : null;

  /* ── the rail ──────────────────────────────────────────────────────────── */
  const steps = [
    {
      label: 'Surface',
      reachable: true,
      summary: hasErrors ? 'Some fields need fixing' : surfaceSummary,
    },
    {
      label: 'Layout',
      reachable: !!result,
      summary: result
        ? `${selected.tiles_to_purchase_with_waste} tiles · smallest cut ${
            smallestCutMm(selected) === null ? 'none' : `${mm(smallestCutMm(selected))} mm`
          } · ${selected.reused_offcut_count} offcuts reused`
        : '',
      locked: 'Solves from your surface',
    },
    {
      label: 'Keep',
      reachable: !!result,
      summary: saved ? `Saved as ${saved.name}` : 'Name it and keep it',
      locked: 'Waits for a layout',
    },
  ];

  return (
    <CatalogPage>
      <PlanSteps steps={steps} current={step} onSelect={setStep} />

      {apiError && (
        <div className="alert-danger" style={{ marginBottom: '20px' }} role="alert" data-testid="api-error">
          {apiError}
        </div>
      )}

      {/* ── 01 · what you're covering ─────────────────────────────────────── */}
      {step === STEP_SURFACE && (
        <form className="step-view is-form" onSubmit={handleLayoutSubmit}>
          <div className="step-head">
            <div>
              <h1 className="step-h1">The surface you're tiling</h1>
              <p className="step-lede">
                Its size, any openings in it, and the tile you're laying. Planqer
                works out where to start the grid so cuts against the far edge
                aren't ugly slivers.
              </p>
            </div>
            <button type="button" className="btn" onClick={() => setLoadModalOpen(true)}>
              Load a saved plan
            </button>
          </div>

          <section>
            <div className="section-rule">
              <h2 className="section-title">Surface</h2>
              <span className="folio">The wall, floor, or roof you're covering</span>
            </div>
            <table className="cat-table" style={{ marginTop: '14px' }}>
              <tbody>
                <tr>
                  <td style={{ textAlign: 'left' }}>Width</td>
                  <td>
                    <input
                      type="number" step="0.1" min="100"
                      value={surfaceWidth}
                      onChange={(e) => setField(setSurfaceWidth)(e.target.value)}
                      className={`cell-input ${inputErrors.surfaceWidth ? 'is-error' : ''}`}
                      required
                      aria-label="Surface width in millimetres"
                    />
                  </td>
                  <td style={{ width: '40px', color: 'var(--ink-3)' }}>mm</td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'left' }}>Height</td>
                  <td>
                    <input
                      type="number" step="0.1" min="100"
                      value={surfaceHeight}
                      onChange={(e) => setField(setSurfaceHeight)(e.target.value)}
                      className={`cell-input ${inputErrors.surfaceHeight ? 'is-error' : ''}`}
                      required
                      aria-label="Surface height in millimetres"
                    />
                  </td>
                  <td style={{ color: 'var(--ink-3)' }}>mm</td>
                </tr>
              </tbody>
            </table>
            <p className={inputErrors.surfaceWidth || inputErrors.surfaceHeight ? 'text-danger text-[12.5px] font-semibold' : 'synthetic'} style={{ marginTop: '10px' }}>
              {inputErrors.surfaceWidth || inputErrors.surfaceHeight || 'Measure the actual wall or floor — the grid start depends on it.'}
            </p>
          </section>

          <section style={{ marginTop: '30px', paddingTop: '22px', borderTop: '1px solid var(--rule-hair)' }}>
            <div className="section-rule">
              <h2 className="section-title">Openings</h2>
              <span className="folio">Windows, doors, sockets, an extractor hood</span>
            </div>
            {cutouts.length > 0 && (
              <table className="cat-table" style={{ marginTop: '14px' }}>
                <thead>
                  <tr><th>Item</th><th>Position mm</th><th>Size mm</th><th>Label</th><th aria-label="Remove" /></tr>
                </thead>
                <tbody>
                  {cutouts.map((cutout, index) => (
                    <CutoutRow
                      key={index}
                      cutout={cutout}
                      index={index}
                      handleCutoutChange={handleCutoutChange}
                      removeCutout={removeCutout}
                      error={inputErrors.cutouts[index]}
                      attempted={surfaceAttempted}
                    />
                  ))}
                </tbody>
              </table>
            )}
            <button type="button" className="btn" style={{ marginTop: '12px' }} onClick={addCutout}>
              <Plus /> Add opening
            </button>
            {cutouts.length === 0 && (
              <p className="synthetic" style={{ marginTop: '10px' }}>No openings — a plain rectangle.</p>
            )}
          </section>

          <section style={{ marginTop: '30px', paddingTop: '22px', borderTop: '1px solid var(--rule-hair)' }}>
            <div className="section-rule">
              <h2 className="section-title">Tile</h2>
              <span className="folio">What a yard actually sells changes between jobs</span>
            </div>
            <table className="cat-table" style={{ marginTop: '14px' }}>
              <tbody>
                <tr>
                  <td style={{ textAlign: 'left' }}>Width</td>
                  <td>
                    <input
                      type="number" step="0.1" min="10"
                      value={tileWidth}
                      onChange={(e) => setField(setTileWidth)(e.target.value)}
                      className={`cell-input ${inputErrors.tileWidth ? 'is-error' : ''}`}
                      required
                      aria-label="Tile width in millimetres"
                    />
                  </td>
                  <td style={{ width: '40px', color: 'var(--ink-3)' }}>mm</td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'left' }}>Height</td>
                  <td>
                    <input
                      type="number" step="0.1" min="10"
                      value={tileHeight}
                      onChange={(e) => setField(setTileHeight)(e.target.value)}
                      className={`cell-input ${inputErrors.tileHeight ? 'is-error' : ''}`}
                      required
                      aria-label="Tile height in millimetres"
                    />
                  </td>
                  <td style={{ color: 'var(--ink-3)' }}>mm</td>
                </tr>
              </tbody>
            </table>
            <p className={inputErrors.tileWidth || inputErrors.tileHeight ? 'text-danger text-[12.5px] font-semibold' : 'synthetic'} style={{ marginTop: '10px' }}>
              {inputErrors.tileWidth || inputErrors.tileHeight || '10–3000 mm on each side.'}
            </p>
            <label className="flex items-start gap-3" style={{ marginTop: '14px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allowRotation}
                onChange={(e) => setField(setAllowRotation)(e.target.checked)}
                style={{ marginTop: '3px' }}
              />
              <span>
                <b style={{ fontSize: '13.5px' }}>Allow the whole layout to run turned 90°</b>
                <span className="block synthetic">
                  Tries the pattern both ways and keeps whichever fits better. Off
                  when the tile has a grain or a directional face.
                </span>
              </span>
            </label>
          </section>

          <section style={{ marginTop: '30px', paddingTop: '22px', borderTop: '1px solid var(--rule-hair)' }}>
            <div className="section-rule">
              <h2 className="section-title">Joint &amp; bond</h2>
              <span className="folio">The grout gap, and how each row shifts from the last</span>
            </div>
            <div className="flex items-end gap-4" style={{ marginTop: '14px', flexWrap: 'wrap' }}>
              <div style={{ flex: 'none' }}>
                <label className="form-label" htmlFor="tile-joint">Joint</label>
                <div className="flex items-center gap-2">
                  <input
                    id="tile-joint" type="number" step="0.1" min="0"
                    value={jointWidth}
                    onChange={(e) => setField(setJointWidth)(e.target.value)}
                    className={`form-input ${inputErrors.jointWidth ? 'form-input-error' : ''}`}
                    style={{ width: '78px' }}
                    required
                  />
                  <span style={{ fontSize: '13.5px', color: 'var(--ink-3)', fontWeight: 600 }}>mm</span>
                </div>
              </div>
              <div style={{ flex: 'none' }}>
                <label className="form-label" htmlFor="tile-perimeter">Perimeter gap</label>
                <div className="flex items-center gap-2">
                  <input
                    id="tile-perimeter" type="number" step="0.1" min="0"
                    value={perimeterGap}
                    onChange={(e) => setField(setPerimeterGap)(e.target.value)}
                    className={`form-input ${inputErrors.perimeterGap ? 'form-input-error' : ''}`}
                    style={{ width: '78px' }}
                    required
                  />
                  <span style={{ fontSize: '13.5px', color: 'var(--ink-3)', fontWeight: 600 }}>mm</span>
                </div>
              </div>
              <div style={{ flex: 'none' }}>
                <label className="form-label" htmlFor="tile-bond">Bond</label>
                <select
                  id="tile-bond"
                  value={bondPattern}
                  onChange={(e) => setField(setBondPattern)(e.target.value)}
                  className="form-select"
                  style={{ width: '160px' }}
                >
                  <option value="stack">Stack — straight grid</option>
                  <option value="running">Running — brick offset</option>
                  <option value="herringbone">Herringbone — 90° weave</option>
                  <option value="diagonal">Diagonal — set on point</option>
                  <option value="diagonal_herringbone">Diagonal herringbone — 45° weave</option>
                  <option value="double_herringbone">Double herringbone — paired planks</option>
                  <option value="diagonal_double_herringbone">Diagonal double herringbone</option>
                </select>
              </div>
              {bondPattern === 'running' && (
                <div style={{ flex: 'none' }}>
                  <label className="form-label" htmlFor="tile-offset">Row offset</label>
                  <div className="flex items-center gap-2">
                    <input
                      id="tile-offset" type="number" step="1" min="1" max="99"
                      value={Math.round(parseFloat(offsetFraction) * 100) || ''}
                      onChange={(e) => setField(setOffsetFraction)((parseFloat(e.target.value) / 100).toString())}
                      className="form-input"
                      style={{ width: '78px' }}
                    />
                    <span style={{ fontSize: '13.5px', color: 'var(--ink-3)', fontWeight: 600 }}>% of tile width</span>
                  </div>
                </div>
              )}
            </div>
            <p className={inputErrors.jointWidth || inputErrors.perimeterGap ? 'text-danger text-[12.5px] font-semibold' : 'synthetic'} style={{ marginTop: '10px' }}>
              {inputErrors.jointWidth || inputErrors.perimeterGap
                || {
                  herringbone: 'Every tile alternates 90° from its neighbors — works with any tile size, no offset to set.',
                  diagonal: 'Every tile is rotated 45° ("set on point") — works with any tile size, no offset to set.',
                  diagonal_herringbone: 'The herringbone weave above, rotated 45° as a whole — works with any tile size, no offset to set.',
                  double_herringbone: 'Each arm of the weave is a pair of planks side by side — works with any tile size, no offset to set.',
                  diagonal_double_herringbone: 'The paired-plank weave above, rotated 45° as a whole — works with any tile size, no offset to set.',
                }[bondPattern]
                || '50% is a standard brick bond; 33% is a third bond. The perimeter gap is expansion room against the wall, not grout.'}
            </p>
          </section>


          <div style={{ marginTop: '26px' }}>
            <Disclosure
              title="Sliver guard &amp; breakage"
              hint={`Sliver guard ${minEdgeCut ? mm(parseFloat(minEdgeCut)) + ' mm' : 'off'} · ${wastePercent}% breakage · ${candidateCount} candidates`}
              open={guardOpen}
              onToggle={() => setGuardOpen(v => !v)}
            >
              <label className="form-label" htmlFor="tile-min-edge">Sliver threshold</label>
              <div className="flex items-center gap-2">
                <input
                  id="tile-min-edge" type="number" step="1" min="0"
                  placeholder="Off"
                  value={minEdgeCut}
                  onChange={(e) => setField(setMinEdgeCut)(e.target.value)}
                  className={`form-input ${inputErrors.minEdgeCut ? 'form-input-error' : ''}`}
                  style={{ width: '110px' }}
                />
                <span style={{ fontSize: '13.5px', color: 'var(--ink-3)', fontWeight: 600 }}>mm — a cut piece narrower than this is flagged</span>
              </div>
              <p className="synthetic" style={{ marginTop: '10px' }}>
                A common rule of thumb is a third of the tile's own width.
              </p>

              <label className="form-label" style={{ marginTop: '18px' }} htmlFor="tile-waste">Breakage allowance</label>
              <div className="flex items-center gap-2">
                <input
                  id="tile-waste" type="number" step="1" min="0" max="100"
                  value={wastePercent}
                  onChange={(e) => setField(setWastePercent)(e.target.value)}
                  className={`form-input ${inputErrors.wastePercent ? 'form-input-error' : ''}`}
                  style={{ width: '110px' }}
                />
                <span style={{ fontSize: '13.5px', color: 'var(--ink-3)', fontWeight: 600 }}>% extra tiles bought, for breakage and mistakes</span>
              </div>

              <label className="form-label" style={{ marginTop: '18px' }} htmlFor="tile-candidates">Candidates to show</label>
              <div className="flex items-center gap-2">
                <input
                  id="tile-candidates" type="number" step="1" min="1" max="20"
                  value={candidateCount}
                  onChange={(e) => setField(setCandidateCount)(e.target.value)}
                  className={`form-input ${inputErrors.candidateCount ? 'form-input-error' : ''}`}
                  style={{ width: '110px' }}
                />
              </div>

              <label className="flex items-start gap-3" style={{ marginTop: '18px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={reuseOffcuts}
                  onChange={(e) => setField(setReuseOffcuts)(e.target.checked)}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  <b style={{ fontSize: '13.5px' }}>Reuse offcuts</b>
                  <span className="block synthetic">
                    A leftover piece cut from one tile can sometimes fill another
                    cut position, buying fewer whole tiles.
                  </span>
                </span>
              </label>
              {(inputErrors.minEdgeCut || inputErrors.wastePercent || inputErrors.candidateCount) && (
                <p className="text-danger text-[12.5px] font-semibold" style={{ marginTop: '10px' }}>
                  {inputErrors.minEdgeCut || inputErrors.wastePercent || inputErrors.candidateCount}
                </p>
              )}
            </Disclosure>
          </div>

          <div className="step-foot">
            <p className="synthetic step-foot-note">
              {hasErrors ? 'Fix the fields above and the layout can run' : surfaceSummary}
            </p>
            <div className="step-foot-act">
              <button type="submit" className="btn-order" disabled={loading || hasErrors}>
                {loading ? <><Loader /> Solving</> : <>Solve the layout <ArrowRight size={15} /></>}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── 02 · the layout ───────────────────────────────────────────────── */}
      {step === STEP_LAYOUT && result && (
        <div className="step-view">
          <div className="step-head" style={{ marginBottom: '20px' }}>
            <div>
              <h1 className="step-h1">Pick a layout</h1>
              <p className="step-lede">
                Ranked candidates, not one auto-picked answer — safety at the
                edge, tile count, and symmetry can pull against each other, so
                pick the tradeoff that fits this job.
              </p>
            </div>
          </div>

          <div className="tile-candidates">
            {result.candidates.map((candidate, index) => (
              <TileLayoutCandidateCard
                key={index}
                candidate={candidate}
                selected={index === selectedIndex}
                onSelect={() => setSelectedIndex(index)}
              />
            ))}
          </div>

          <div className="plan-answer" style={{ marginTop: '26px' }}>
            <div className="plan-answer-fig">
              <b>{selected.tiles_to_purchase_with_waste}</b>
              <span className="answer-kicker">tiles to buy</span>
            </div>
            <dl className="plan-facts">
              <div className="plan-fact">
                <dt>Full tiles</dt><dd>{selected.full_tile_count}</dd>
              </div>
              <div className="plan-fact">
                <dt>Cut tiles</dt><dd>{selected.cut_tile_count}</dd>
              </div>
              <div className="plan-fact">
                <dt>Used</dt><dd>{(selected.efficiency * 100).toFixed(1)}%</dd>
              </div>
            </dl>
          </div>

          <TileResultDisplay candidate={selected} projectName={projectName} />

          <div className="step-foot">
            <button type="button" className="btn" onClick={() => setStep(STEP_SURFACE)}>
              <ArrowLeft /> Change the surface
            </button>
            <div className="step-foot-act">
              <button type="button" className="btn-order" onClick={() => setStep(STEP_KEEP)}>
                Name it <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 03 · keep it ──────────────────────────────────────────────────── */}
      {step === STEP_KEEP && result && (
        <form className="step-view is-form" onSubmit={handleSave}>
          <div className="step-head" style={{ marginBottom: '22px' }}>
            <div>
              <h1 className="step-h1">{saved ? 'Layout saved' : 'Save this layout'}</h1>
              <p className="step-lede">
                {saved
                  ? 'Kept on this instance under your account, so it follows you to any browser without leaving the machine.'
                  : 'Name it, choose where it belongs, and it stays on this instance under your account — ready to open again from any browser.'}
              </p>
            </div>
          </div>

          {saved ? (
            <div className="saved-mark">
              <Tick size={16} />
              <div>
                <b>Saved as {saved.name}</b>
                <p>
                  {savedGroupName
                    ? <>Filed under {savedGroupName}. Open it any time from <Link to="/dashboard">your dashboard</Link>.</>
                    : <>Not in a project. Open it any time from <Link to="/dashboard">your dashboard</Link>.</>}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '24px' }}>
                <ProjectPicker
                  groups={projectGroups}
                  value={selectedGroupId}
                  onChange={setSelectedGroupId}
                  onCreate={createGroup}
                />
              </div>

              <div>
                <label className="form-label" htmlFor="tile-plan-name">Plan name</label>
                <input
                  id="tile-plan-name"
                  type="text"
                  className={`form-input ${nameError ? 'form-input-error' : ''}`}
                  placeholder="Kitchen splashback"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  aria-invalid={!!nameError}
                  aria-describedby="tile-plan-name-hint"
                />
                <p
                  id="tile-plan-name-hint"
                  className={nameError ? 'text-danger text-[12.5px] font-semibold' : 'synthetic'}
                  style={{ marginTop: '7px' }}
                  role={nameError ? 'alert' : undefined}
                >
                  {nameError || 'The name goes on the saved diagram, so label it the way you would label the job'}
                </p>
              </div>
            </>
          )}

          <div className="step-foot">
            <button type="button" className="btn" onClick={() => setStep(STEP_LAYOUT)}>
              <ArrowLeft /> Back to the layout
            </button>
            {saved ? (
              <div className="step-foot-act">
                <Link to="/dashboard" className="btn-order">
                  Open your dashboard <ArrowRight size={15} />
                </Link>
              </div>
            ) : (
              <div className="step-foot-act">
                <button type="submit" className="btn-order" disabled={saving}>
                  {saving ? <><Loader /> Saving</> : 'Save layout'}
                </button>
              </div>
            )}
          </div>
        </form>
      )}

      {/* ── load a saved plan ─────────────────────────────────────────────── */}
      {loadModalOpen && (
        <div className="cat-overlay" role="dialog" aria-modal="true" aria-label="Load a saved plan">
          <div className="cat-sheet">
            <div className="masthead" style={{ marginTop: 0 }}>
              <span className="masthead-brand" style={{ fontSize: '13px' }}>YOUR SAVED PLANS</span>
              <span className="masthead-section" />
              <button type="button" className="masthead-flash" onClick={() => setLoadModalOpen(false)}>
                Close
              </button>
            </div>
            <div style={{ padding: '14px 16px 18px' }}>
              {userProjects.length === 0 ? (
                <p style={{ color: 'var(--ink-3)', fontSize: '13px' }}>
                  Nothing saved yet. Solve a layout, name it, and it lands here.
                </p>
              ) : (
                <table className="cat-table">
                  <thead><tr><th>Name</th><th>Surface</th><th aria-label="Actions" /></tr></thead>
                  <tbody>
                    {userProjects.map(project => (
                      <tr key={project.id}>
                        <td style={{ textAlign: 'left', color: 'var(--ink)', fontSize: '13px' }}>{project.name}</td>
                        <td>{mm(project.surface_data.width)} × {mm(project.surface_data.height)} mm</td>
                        <td style={{ width: '90px' }}>
                          <button className="btn" style={{ padding: '5px 10px', minHeight: 0 }} onClick={() => loadProject(project)}>
                            Load
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="synthetic" style={{ marginTop: '12px' }}>
                To rename or delete a saved plan, use <Link to="/dashboard">your dashboard</Link>.
              </p>
            </div>
          </div>
        </div>
      )}
    </CatalogPage>
  );
};

export default TileOptimizer;
