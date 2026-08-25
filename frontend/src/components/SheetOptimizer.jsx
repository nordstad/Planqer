/*
  Sheet cutting, in the same three steps as board cutting — say what you need,
  read the layout, keep it — so the two pages stay one product rather than two
  habits.

  Where they differ, they differ for a real reason: a sheet's own dimensions are
  never a safe default (1220 × 2440 and 1200 × 2500 give different plans), so
  they stay on the parts step in plain sight. Only the packing strategy, which
  auto-selects well, is folded away.
*/

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import { optimizeSheetCutting, saveSheetProject, getProjectGroups, createProjectGroup, getUserSheetProjects } from '../utils/api';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../contexts/AuthContext';
import Disclosure from './Disclosure';
import ProjectPicker from './ProjectPicker';
import Loader from './Loader';
import PlanSteps from './PlanSteps';
import SheetPartRow from './SheetPartRow';
import SheetResultDisplay from './SheetResultDisplay';
import { ArrowLeft, ArrowRight, Plus, Tick } from './icons';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

const STEP_PARTS = 0;
const STEP_PLAN = 1;
const STEP_SAVE = 2;

const validateSheetParts = (parts) => parts.map((part) => {
  const errors = {};
  const width = parseFloat(part.width);
  const height = parseFloat(part.height);
  const quantity = parseInt(part.quantity, 10);

  if (!part.width || isNaN(width) || width <= 0) errors.width = 'Width must be a positive number';
  else if (width > 5000) errors.width = 'Width cannot exceed 5000mm';

  if (!part.height || isNaN(height) || height <= 0) errors.height = 'Height must be a positive number';
  else if (height > 5000) errors.height = 'Height cannot exceed 5000mm';

  if (!part.quantity || isNaN(quantity) || quantity <= 0) errors.quantity = 'Quantity must be a positive number';
  else if (quantity > 1000) errors.quantity = 'Quantity cannot exceed 1000';

  return Object.keys(errors).length > 0 ? errors : null;
});

const SheetOptimizer = () => {
  const { user } = useAuth();
  const [step, setStep] = useState(STEP_PARTS);

  const [parts, setParts] = useState([
    { width: "800", height: "400", quantity: "2", name: "Shelf Back", id: "shelf_back" },
    { width: "300", height: "400", quantity: "4", name: "Shelf Side", id: "shelf_side" },
    { width: "780", height: "280", quantity: "2", name: "Shelf Bottom", id: "shelf_bottom" },
  ]);

  const [sheetWidth, setSheetWidth] = useState("1200");
  const [sheetHeight, setSheetHeight] = useState("2500");
  const [kerfWidth, setKerfWidth] = useState("3");
  const [materialType, setMaterialType] = useState("plywood");
  const [algorithm, setAlgorithm] = useState("");
  const [allowRotation, setAllowRotation] = useState(true);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [inputErrors, setInputErrors] = useState({ parts: [], sheetWidth: "", sheetHeight: "", kerfWidth: "" });

  const [strategyOpen, setStrategyOpen] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);

  /* the save step */
  const [projectGroups, setProjectGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [projectName, setProjectName] = useState("");
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);

  /* loading one back */
  const [userProjects, setUserProjects] = useState([]);
  const [loadModalOpen, setLoadModalOpen] = useState(false);

  const debouncedParts = useDebounce(parts, 300);
  const debouncedSheetWidth = useDebounce(sheetWidth, 300);
  const debouncedSheetHeight = useDebounce(sheetHeight, 300);
  const debouncedKerfWidth = useDebounce(kerfWidth, 300);

  useEffect(() => {
    const width = parseFloat(debouncedSheetWidth);
    const height = parseFloat(debouncedSheetHeight);
    const kerf = parseFloat(debouncedKerfWidth);

    setInputErrors({
      parts: validateSheetParts(debouncedParts),
      sheetWidth: !debouncedSheetWidth || isNaN(width) || width <= 0
        ? "Sheet width must be a positive number"
        : width > 10000 ? "Sheet width cannot exceed 10 000 mm" : "",
      sheetHeight: !debouncedSheetHeight || isNaN(height) || height <= 0
        ? "Sheet height must be a positive number"
        : height > 10000 ? "Sheet height cannot exceed 10 000 mm" : "",
      kerfWidth: !debouncedKerfWidth || isNaN(kerf) || kerf < 0
        ? "A kerf of zero would plan cuts that lose no material"
        : kerf > 50 ? "That kerf is wider than any saw blade — 2 to 4 mm is typical" : "",
    });
  }, [debouncedParts, debouncedSheetWidth, debouncedSheetHeight, debouncedKerfWidth]);

  // This page requires sign-in, so project groups and saved plans are always available
  useEffect(() => {
    if (user) {
      getProjectGroups().then(setProjectGroups).catch(() => {});
      getUserSheetProjects().then(setUserProjects).catch(() => {});
    }
  }, [user]);

  // Sheet parts handed over from an uploaded model land here as the starting parts
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('import') !== '3d') return;
    const importData = localStorage.getItem('planqer-3d-sheet-import');
    if (!importData) return;
    try {
      const data = JSON.parse(importData);
      if (data.parts && data.source === 'model-cutlist-sheet') {
        setParts(data.parts.map((part, index) => ({
          width: part.width.toString(),
          height: part.height.toString(),
          quantity: part.quantity.toString(),
          name: part.name || `Sheet_${index + 1}`,
          id: part.id || `sheet_${index + 1}`,
        })));
        setProjectName(data.projectName || '');
        localStorage.removeItem('planqer-3d-sheet-import');
        window.history.replaceState({}, document.title, '/sheet-cutting');
      }
    } catch (err) {
      console.error('Failed to import 3D sheet cutlist data:', err);
    }
  }, []);

  /* ── a layout belongs to its inputs ────────────────────────────────────── */
  const retireLayout = () => {
    setResult(null);
    setSaved(null);
    setApiError("");
  };

  const handlePartChange = (index, field, value) => {
    retireLayout();
    setParts(parts.map((p, i) => {
      if (i !== index) return p;
      const next = { ...p, [field]: value };
      // The id is what labels the part on the drawing, so it follows the name.
      if (field === 'name' && value) next.id = value.toLowerCase().replace(/[^a-z0-9]/g, '_');
      return next;
    }));
  };

  const addPart = () => {
    retireLayout();
    setParts([...parts, { width: "", height: "", quantity: "", name: "", id: `part_${parts.length + 1}` }]);
  };

  const removePart = (index) => {
    if (parts.length <= 1) return;
    retireLayout();
    setParts(parts.filter((_, i) => i !== index));
  };

  const setSheetField = (setter) => (value) => { retireLayout(); setter(value); };

  const loadProject = (project) => {
    retireLayout();
    setParts(project.parts_data.map((part, index) => ({
      width: part.width.toString(),
      height: part.height.toString(),
      quantity: part.quantity.toString(),
      name: part.name || `Sheet_${index + 1}`,
      id: part.name || `sheet_${index + 1}`,
    })));
    setSheetWidth(project.sheet_width.toString());
    setSheetHeight(project.sheet_height.toString());
    setKerfWidth(project.kerf_width.toString());
    setMaterialType(project.material_type || "plywood");
    setAlgorithm(project.algorithm || "");
    setAllowRotation(project.allow_rotation !== false);
    setSelectedGroupId(project.project_group_id || '');
    setProjectName(project.name);
    setLoadModalOpen(false);
    setStep(STEP_PARTS);
  };

  /* ── derived facts ─────────────────────────────────────────────────────── */
  const partCount = parts.reduce((n, p) => n + (parseInt(p.quantity, 10) || 0), 0);
  const hasErrors = inputErrors.parts.some(Boolean)
    || !!inputErrors.sheetWidth || !!inputErrors.sheetHeight || !!inputErrors.kerfWidth;
  const sheetError = inputErrors.sheetWidth || inputErrors.sheetHeight;

  /* ── running a layout ──────────────────────────────────────────────────── */
  const handleLayoutSubmit = async (e) => {
    e.preventDefault();
    setApiError("");
    if (hasErrors) return;

    setLoading(true);
    setResult(null);
    setSaved(null);
    try {
      const response = await optimizeSheetCutting(
        parts, sheetWidth, sheetHeight, kerfWidth, materialType, algorithm || undefined, allowRotation
      );
      setResult(response);
      setStep(STEP_PLAN);
    } catch (error) {
      setApiError(error.message || 'Unknown error');
    }
    setLoading(false);
  };

  /* ── keeping a layout ──────────────────────────────────────────────────── */
  const nameError = saveAttempted && !projectName.trim()
    ? 'Give the plan a name so you can find it again — “Shelf panels” beats “Untitled”'
    : '';

  // Returns whether it worked, so the picker knows whether to close its field.
  const createGroup = async (name) => {
    try {
      const group = await createProjectGroup(name);
      setProjectGroups(prev => [group, ...prev]);
      setSelectedGroupId(group.id);
      setApiError("");
      return true;
    } catch (err) {
      setApiError('Could not create that project: ' + err.message);
      return false;
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveAttempted(true);
    setApiError("");
    if (!projectName.trim()) return;

    setSaving(true);
    try {
      const project = await saveSheetProject({
        name: projectName.trim(),
        projectGroupId: selectedGroupId,
        parts,
        sheetWidth,
        sheetHeight,
        kerfWidth,
        materialType,
        algorithm,
        allowRotation,
        result,
      });
      setSaved(project);
      setUserProjects(prev => [project, ...prev]);
    } catch (error) {
      setApiError(error.message || 'Could not save this plan');
    }
    setSaving(false);
  };

  const savedGroupName = saved
    ? projectGroups.find(g => g.id === saved.project_group_id)?.name
    : null;

  /* ── the rail ──────────────────────────────────────────────────────────── */
  const steps = [
    {
      label: 'Parts',
      reachable: true,
      summary: hasErrors
        ? 'Some lines need fixing'
        : `${partCount} parts · ${mm(parseFloat(sheetWidth))} × ${mm(parseFloat(sheetHeight))} mm sheet`,
    },
    {
      label: 'The layout',
      reachable: !!result,
      summary: result
        ? `${result.total_sheets} ${result.total_sheets === 1 ? 'sheet' : 'sheets'} · ${result.overall_efficiency.toFixed(1)}% used`
        : '',
      locked: 'Packs from your parts',
    },
    {
      label: 'Save',
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

      {/* ── 01 · what needs cutting ───────────────────────────────────────── */}
      {step === STEP_PARTS && (
        <form className="step-view is-form" onSubmit={handleLayoutSubmit}>
          <div className="step-head">
            <div>
              <h1 className="step-h1">Parts to cut</h1>
              <p className="step-lede">
                Every rectangle you need out of sheet stock. Planqer packs them onto
                as few sheets as it can and shows where each one sits.
              </p>
            </div>
            <button type="button" className="btn" onClick={() => setLoadModalOpen(true)}>
              Load a saved plan
            </button>
          </div>

          <table className="cat-table">
            <thead>
              <tr><th>Item</th><th>Size mm</th><th>Qty</th><th>Name</th><th aria-label="Remove" /></tr>
            </thead>
            <tbody>
              {parts.map((part, index) => (
                <SheetPartRow
                  key={index}
                  part={part}
                  index={index}
                  handlePartChange={handlePartChange}
                  removePart={removePart}
                  error={inputErrors.parts[index]}
                  canRemove={parts.length > 1}
                />
              ))}
              <tr className="is-sum">
                <td>Σ</td><td /><td>{partCount}</td><td /><td />
              </tr>
            </tbody>
          </table>
          <button type="button" className="btn" style={{ marginTop: '12px' }} onClick={addPart}>
            <Plus /> Add part
          </button>

          {/* Kerf gets the same standalone bordered field as the board page,
              rather than a borderless row inside the sheet table — the same
              input on two sibling pages should not look like two controls. */}
          <div
            className="flex items-end gap-4"
            style={{ marginTop: '26px', paddingTop: '22px', borderTop: '1px solid var(--rule-hair)', flexWrap: 'wrap' }}
          >
            <div style={{ flex: 'none' }}>
              <label className="form-label" htmlFor="sheet-kerf">Saw blade</label>
              <div className="flex items-center gap-2">
                <input
                  id="sheet-kerf"
                  type="number"
                  step="0.1"
                  min="0"
                  value={kerfWidth}
                  onChange={(e) => setSheetField(setKerfWidth)(e.target.value)}
                  className={`form-input ${inputErrors.kerfWidth ? 'form-input-error' : ''}`}
                  style={{ width: '78px' }}
                  required
                  placeholder="3"
                  aria-describedby="sheet-kerf-hint"
                />
                <span style={{ fontSize: '13.5px', color: 'var(--ink-3)', fontWeight: 600 }}>mm</span>
              </div>
            </div>
            <p
              id="sheet-kerf-hint"
              className={inputErrors.kerfWidth ? 'text-danger text-[12.5px] font-semibold' : 'synthetic'}
              style={{ flex: '1 1 220px', margin: 0, paddingBottom: '11px' }}
            >
              {inputErrors.kerfWidth || 'Every cut turns this much material into dust — the plan accounts for it'}
            </p>
          </div>

          <section style={{ marginTop: '30px', paddingTop: '22px', borderTop: '1px solid var(--rule-hair)' }}>
            <div className="section-rule">
              <h2 className="section-title">The sheet you're cutting from</h2>
              <span className="folio">What you're cutting out of, not what you need</span>
            </div>
            <table className="cat-table">
              <tbody>
                <tr>
                  <td style={{ textAlign: 'left' }}>Width</td>
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      min="10"
                      value={sheetWidth}
                      onChange={(e) => setSheetField(setSheetWidth)(e.target.value)}
                      className={`cell-input ${inputErrors.sheetWidth ? 'is-error' : ''}`}
                      required
                      aria-label="Sheet width in millimetres"
                    />
                  </td>
                  <td style={{ width: '40px', color: 'var(--ink-3)' }}>mm</td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'left' }}>Height</td>
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      min="10"
                      value={sheetHeight}
                      onChange={(e) => setSheetField(setSheetHeight)(e.target.value)}
                      className={`cell-input ${inputErrors.sheetHeight ? 'is-error' : ''}`}
                      required
                      aria-label="Sheet height in millimetres"
                    />
                  </td>
                  <td style={{ color: 'var(--ink-3)' }}>mm</td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'left' }}>Material</td>
                  {/* Kept in the value column rather than spanning into the unit
                      column, so the control lines up with the numbers above it */}
                  <td>
                    <select
                      value={materialType}
                      onChange={(e) => setSheetField(setMaterialType)(e.target.value)}
                      className="form-select"
                      aria-label="Material type"
                    >
                      <option value="plywood">Plywood</option>
                      <option value="mdf">MDF</option>
                      <option value="metal">Metal sheet</option>
                      <option value="acrylic">Acrylic</option>
                      <option value="cardboard">Cardboard</option>
                      <option value="other">Other</option>
                    </select>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
            {/* Kerf reports next to its own field now, so this line carries only
                the sheet's own errors. */}
            <p
              className={sheetError ? 'text-danger text-[12.5px] font-semibold' : 'synthetic'}
              style={{ marginTop: '10px' }}
            >
              {sheetError
                || 'Check these against the sheet before you plan. Standard plywood is 1220 × 2440 mm or 1200 × 2500 mm — measure yours, the packing depends on it.'}
            </p>
          </section>

          <div style={{ marginTop: '26px' }}>
            <Disclosure
              title="Packing strategy"
              hint={`${algorithm ? algorithm.replace(/_/g, ' ') : 'Auto-selected'} · 90° rotation ${allowRotation ? 'allowed' : 'off'}`}
              open={strategyOpen}
              onToggle={() => setStrategyOpen(v => !v)}
            >
              <label className="form-label" htmlFor="sheet-algorithm">Algorithm</label>
              <select
                id="sheet-algorithm"
                value={algorithm}
                onChange={(e) => setSheetField(setAlgorithm)(e.target.value)}
                className="form-select"
              >
                <option value="">Auto-select — picks one from your parts</option>
                <option value="bottom_left_fill">Bottom-left fill — fastest</option>
                <option value="best_fit_2d">Best fit — balanced</option>
                <option value="genetic_2d">Genetic — slowest, usually tightest</option>
                <option value="guillotine_cut">Guillotine — only full-width cuts, for a panel saw</option>
              </select>
              <label className="flex items-start gap-3" style={{ marginTop: '14px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={allowRotation}
                  onChange={(e) => setSheetField(setAllowRotation)(e.target.checked)}
                  style={{ marginTop: '3px' }}
                />
                <span>
                  <b style={{ fontSize: '13.5px' }}>Allow 90° rotation</b>
                  <span className="block synthetic">
                    Turns parts to fit tighter. Switch it off when the grain or the
                    face pattern has to run one way.
                  </span>
                </span>
              </label>
            </Disclosure>

            <Disclosure
              title="What this page returns, and its limits"
              hint="Sheets, a layout per sheet, which parts turned, and the waste"
              open={limitsOpen}
              onToggle={() => setLimitsOpen(v => !v)}
            >
              <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                <table className="cat-table is-reference">
                  <tbody>
                    <tr><td>Sheets</td><td>The fewest sheets that carry every part</td></tr>
                    <tr><td>Layout</td><td>Where each part sits on every sheet</td></tr>
                    <tr><td>Rotation</td><td>Which parts turned 90° to fit, if allowed</td></tr>
                    <tr><td>Waste</td><td>What is left once parts and blade have taken theirs</td></tr>
                  </tbody>
                </table>
                <table className="cat-table is-reference">
                  <tbody>
                    <tr><td>Part width or height</td><td>5 000 mm maximum</td></tr>
                    <tr><td>Sheet width or height</td><td>10 000 mm maximum</td></tr>
                    <tr><td>Quantity per part</td><td>1 000 maximum</td></tr>
                    <tr><td>Kerf</td><td>0–50 mm; 2–4 typical</td></tr>
                  </tbody>
                </table>
              </div>
            </Disclosure>
          </div>

          <div className="step-foot">
            <p className="synthetic step-foot-note">
              {hasErrors
                ? 'Fix the struck lines above and the layout can run'
                : `${partCount} parts onto ${mm(parseFloat(sheetWidth))} × ${mm(parseFloat(sheetHeight))} mm stock`}
            </p>
            <div className="step-foot-act">
              <button type="submit" className="btn-order" disabled={loading || hasErrors}>
                {loading ? <><Loader /> Packing</> : <>Pack the sheets <ArrowRight size={15} /></>}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── 02 · the layout ───────────────────────────────────────────────── */}
      {step === STEP_PLAN && result && (
        <div className="step-view">
          <div className="step-head" style={{ marginBottom: '20px' }}>
            <div>
              <h1 className="step-h1">Your sheet layout</h1>
              <p className="step-lede">
                Every sheet drawn to its real proportions, with each part placed
                where it should be cut.
              </p>
            </div>
          </div>

          <div className="plan-answer">
            <div className="plan-answer-fig">
              <b>{result.total_sheets}</b>
              <span className="answer-kicker">
                {result.total_sheets === 1 ? 'sheet' : 'sheets'} for all {partCount} parts
              </span>
            </div>
            <dl className="plan-facts">
              <div className="plan-fact">
                <dt>Material used</dt><dd>{result.overall_efficiency.toFixed(1)} %</dd>
              </div>
              <div className="plan-fact">
                <dt>Waste</dt>
                <dd>
                  {result.total_waste_area >= 1000000
                    ? `${(result.total_waste_area / 1000000).toFixed(2)} m²`
                    : `${mm(result.total_waste_area)} mm²`}
                </dd>
              </div>
              <div className="plan-fact">
                <dt>Strategy</dt><dd>{result.algorithm_used.replace(/_/g, ' ')}</dd>
              </div>
            </dl>
          </div>

          <SheetResultDisplay result={result} projectName={projectName} />

          <div className="step-foot">
            <button type="button" className="btn" onClick={() => setStep(STEP_PARTS)}>
              <ArrowLeft /> Change the parts
            </button>
            <div className="step-foot-act">
              <button type="button" className="btn-order" onClick={() => setStep(STEP_SAVE)}>
                {saved ? 'Back to the save' : 'Name and save'} <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 03 · keep it ──────────────────────────────────────────────────── */}
      {step === STEP_SAVE && result && (
        <form className="step-view is-form" onSubmit={handleSave}>
          <div className="step-head" style={{ marginBottom: '22px' }}>
            <div>
              <h1 className="step-h1">{saved ? 'Plan saved' : 'Save this plan'}</h1>
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
                <label className="form-label" htmlFor="plan-name">Plan name</label>
                <input
                  id="plan-name"
                  type="text"
                  className={`form-input ${nameError ? 'form-input-error' : ''}`}
                  placeholder="Shelf panels"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  aria-invalid={!!nameError}
                  aria-describedby="plan-name-hint"
                />
                <p
                  id="plan-name-hint"
                  className={nameError ? 'text-danger text-[12.5px] font-semibold' : 'synthetic'}
                  style={{ marginTop: '7px' }}
                  role={nameError ? 'alert' : undefined}
                >
                  {nameError || 'The name goes on the saved diagram, so label it the way you would label the offcut pile'}
                </p>
              </div>
            </>
          )}

          <div className="step-foot">
            <button type="button" className="btn" onClick={() => setStep(STEP_PLAN)}>
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
                  {saving ? <><Loader /> Saving</> : 'Save plan'}
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
                  Nothing saved yet. Pack a layout, name it, and it lands here.
                </p>
              ) : (
                <table className="cat-table">
                  <thead><tr><th>Name</th><th>Parts</th><th aria-label="Actions" /></tr></thead>
                  <tbody>
                    {userProjects.map(project => (
                      <tr key={project.id}>
                        <td style={{ textAlign: 'left', color: 'var(--ink)', fontSize: '13px' }}>{project.name}</td>
                        <td>{project.parts_data.reduce((sum, p) => sum + (p.quantity || 0), 0)}</td>
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

export default SheetOptimizer;
