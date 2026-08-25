/*
  Board cutting, as three steps rather than one spread.

  The old page put required parts, stock lengths, cost analysis, the answer and
  the diagram side by side and let the user work out the order. The work is
  actually a sequence — say what you need, read the plan, keep it — so the page
  is a sequence, and only the step in hand is drawn. Everything most people never
  touch (prices, the working limits) is folded away behind one line that says
  what is inside. Stock lengths are NOT among them: what a yard actually sells
  changes between jobs and has to be checked, so they stay in plain sight —
  matching the sheet page, where the sheet's own dimensions are visible for the
  same reason.

  A plan belongs to the inputs that produced it, so editing any of them retires
  the plan rather than leaving a diagram on screen that no longer matches. And
  running a plan no longer saves one: the save is step three, where the user has
  named it and chosen its project.
*/

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { optimizeCutting, saveProject, getProjectGroups, createProjectGroup, getUserProjects, getUserSettings } from '../utils/api';
import { validateBoards, validateParts } from '../utils/validators';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../contexts/AuthContext';
import BoardLengthRow from './BoardLengthRow';
import CatalogPage from './CatalogPage';
import CostAnalysisPanel from './CostAnalysisPanel';
import Disclosure from './Disclosure';
import ProjectPicker from './ProjectPicker';
import Loader from './Loader';
import PlanSteps from './PlanSteps';
import { ArrowLeft, ArrowRight, Plus, Tick } from './icons';
import PartInputRow from './PartInputRow';
import ResultDisplay from './ResultDisplay';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

const STEP_PARTS = 0;
const STEP_PLAN = 1;
const STEP_SAVE = 2;

const DEFAULT_CURRENCY = 'SEK';

const CuttingOptimizer = () => {
  const { user } = useAuth();
  const [step, setStep] = useState(STEP_PARTS);

  const [parts, setParts] = useState([
    { length: "80", quantity: "10" },
    { length: "150", quantity: "10" },
    { length: "1550", quantity: "8" },
    { length: "2000", quantity: "2" },
  ]);
  const [boards, setBoards] = useState(["2500", "3600", "4200", "5100"]);
  const [sawKerf, setSawKerf] = useState("3"); // millimetres, whole numbers
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [inputErrors, setInputErrors] = useState({ parts: [], boards: [], sawKerf: "" });

  const [limitsOpen, setLimitsOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);

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

  /* prices: an input, so applying them re-runs the plan */
  const [pricesApplied, setPricesApplied] = useState(false);
  // The priced figures the plan had before the run in hand, so the cost panel can
  // say what the new prices moved instead of silently swapping the numbers.
  const [pricedBefore, setPricedBefore] = useState(null);
  // Which prices produced the plan on screen. Edited past them and the breakdown
  // belongs to a set of prices that is no longer in the fields.
  const [appliedPriceKey, setAppliedPriceKey] = useState(null);
  const [boardCosts, setBoardCosts] = useState({});
  const [samePriceForAll, setSamePriceForAll] = useState(false);
  const [uniformPrice, setUniformPrice] = useState("");
  const [optimizeFor, setOptimizeFor] = useState("waste");
  // Which price fields to flag red: only once the user has touched them, or
  // tried to price a plan — flagging every field the instant the panel opens
  // reads as the page scolding the user for its own toggle.
  const [costTouched, setCostTouched] = useState({});
  const [costSubmitAttempted, setCostSubmitAttempted] = useState(false);

  const debouncedParts = useDebounce(parts, 300);
  const debouncedBoards = useDebounce(boards, 300);
  const debouncedSawKerf = useDebounce(sawKerf, 300);

  useEffect(() => {
    const kerfValue = parseFloat(debouncedSawKerf);
    setInputErrors({
      parts: validateParts(debouncedParts),
      boards: validateBoards(debouncedBoards),
      sawKerf: !debouncedSawKerf || kerfValue <= 0
        ? "A kerf of zero would plan cuts that lose no material"
        : kerfValue > 20
          ? "That kerf is wider than any saw blade — 2 to 4 mm is typical"
          : "",
    });
  }, [debouncedParts, debouncedBoards, debouncedSawKerf]);

  // This page requires sign-in, so project groups and saved plans are always available.
  // Loaded defaults are also applied once so the user settings act as the real starting state.
  useEffect(() => {
    if (!user) return;

    getUserSettings().then((settings) => {
      if (Array.isArray(settings?.default_board_lengths) && settings.default_board_lengths.length > 0) {
        setBoards(settings.default_board_lengths.map(String));
      }
      if (Number.isFinite(settings?.default_saw_blade_width) && settings.default_saw_blade_width > 0) {
        setSawKerf(String(settings.default_saw_blade_width));
      }
      if (settings?.default_currency) {
        setCurrency(settings.default_currency);
      } else {
        setCurrency(DEFAULT_CURRENCY);
      }
    }).catch(() => {
      setCurrency(DEFAULT_CURRENCY);
    });

    getProjectGroups().then(setProjectGroups).catch(() => {});
    getUserProjects().then(setUserProjects).catch(() => {});
  }, [user]);

  // A cutlist handed over from an uploaded model lands here as the starting parts
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('import') !== '3d') return;
    const importData = localStorage.getItem('planqer-3d-import');
    if (!importData) return;
    try {
      const data = JSON.parse(importData);
      if (data.parts && data.source === 'model-cutlist') {
        setParts(Object.entries(data.parts).map(([length, quantity]) => ({
          length,
          quantity: quantity.toString(),
        })));
        setProjectName(data.projectName || '');
        localStorage.removeItem('planqer-3d-import');
        window.history.replaceState({}, document.title, '/cutting');
      }
    } catch (err) {
      console.error('Failed to import 3D cutlist data:', err);
    }
  }, []);

  /* ── a plan belongs to its inputs ──────────────────────────────────────
     Anything that changes what gets cut retires the plan and the save that
     went with it, so the diagram on the plan step is never a plan for
     different parts. Prices are excluded: they have their own apply button. */
  const retirePlan = () => {
    setResult(null);
    setSaved(null);
    setApiError("");
    setPricedBefore(null);
    setAppliedPriceKey(null);
  };

  const handlePartChange = (index, field, value) => {
    retirePlan();
    setParts(parts.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const handleBoardChange = (index, value) => {
    retirePlan();
    setBoards(boards.map((b, i) => (i === index ? value : b)));
  };

  const handleKerfChange = (value) => {
    retirePlan();
    setSawKerf(value.replace(/\D/g, '').slice(0, 2));
  };

  // Pasting multiple lines (e.g. from a spreadsheet) expands into one row per
  // line instead of dumping raw text into a single length field. A one-line
  // paste falls through to the input's own default behaviour.
  const handlePartsPaste = (index, e) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\n')) return;
    e.preventDefault();
    const rows = text.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const [length, quantity] = line.split(/[,\t]|\s+/).filter(Boolean);
      return { length: length || '', quantity: quantity || '1' };
    });
    if (!rows.length) return;
    retirePlan();
    const newParts = [...parts];
    newParts.splice(index, 1, ...rows);
    setParts(newParts);
  };

  const handleBoardsPaste = (index, e) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\n')) return;
    e.preventDefault();
    const rows = text.split('\n').map(line => line.trim()).filter(Boolean)
      .map(line => line.split(/[,\t]|\s+/)[0]);
    if (!rows.length) return;
    retirePlan();
    const newBoards = [...boards];
    newBoards.splice(index, 1, ...rows);
    setBoards(newBoards);
  };

  const addPart = () => { retirePlan(); setParts([...parts, { length: "", quantity: "" }]); };
  const removePart = (index) => {
    if (parts.length <= 1) return;
    retirePlan();
    setParts(parts.filter((_, i) => i !== index));
  };
  const addBoard = () => { retirePlan(); setBoards([...boards, ""]); };
  const removeBoard = (index) => {
    if (boards.length <= 1) return;
    retirePlan();
    setBoards(boards.filter((_, i) => i !== index));
  };

  const loadProject = (project) => {
    retirePlan();
    setParts(Object.entries(project.parts_data).map(([length, quantity]) => ({
      length,
      quantity: quantity.toString(),
    })));
    setBoards(project.board_lengths.map(String));
    setSawKerf(project.saw_blade_width.toString());
    setSelectedGroupId(project.project_group_id || '');
    setProjectName(project.name);

    // A plan's prices come back with it — a supplier's quote belongs to the job,
    // not to the app, so a loaded plan is ready to re-run at the prices it was
    // costed at rather than asking for every figure again.
    const priced = project.board_costs;
    setBoardCosts(priced?.board_costs || {});
    setSamePriceForAll(!!priced?.same_price_for_all);
    setUniformPrice(priced?.uniform_price != null ? String(priced.uniform_price) : '');
    setOptimizeFor(priced?.optimize_for || 'waste');
    setPricesApplied(!!priced);
    setCostOpen(!!priced);
    setCostTouched({});
    setCostSubmitAttempted(false);

    setLoadModalOpen(false);
    setStep(STEP_PARTS);
  };

  /* ── derived facts ─────────────────────────────────────────────────────── */
  const partCount = parts.reduce((n, p) => n + (parseInt(p.quantity, 10) || 0), 0);
  const demand = parts.reduce(
    (sum, p) => sum + (parseFloat(p.length) || 0) * (parseFloat(p.quantity) || 0), 0);
  const hasErrors = inputErrors.parts.some(Boolean) || inputErrors.boards.some(Boolean) || !!inputErrors.sawKerf;
  const validBoards = boards.filter(b => b && !isNaN(parseFloat(b)));

  /* Only the solver's own figures go in the answer. Deriving a second yield here
     once put 98.9% beside the diagram's 91.7% — the same quantity, two numbers,
     on one page. Anything the response does not state is omitted. */
  const plan = (() => {
    if (!result) return null;
    const used = result.board_lengths_used;
    const byType = used
      ? used.reduce((acc, len) => ({ ...acc, [len]: (acc[len] || 0) + 1 }), {})
      : result.cost_analysis?.boards_needed_by_type
        ?? { [result.optimal_board_length]: result.cut_list.length };
    const bought = result.material_bought
      ?? (used ? used.reduce((a, l) => a + l, 0) : null);
    return {
      boardsUsed: result.cut_list.length,
      bought,
      offcut: Number.isFinite(result.total_waste) ? result.total_waste : null,
      kerfLoss: Number.isFinite(result.kerf_loss) ? result.kerf_loss : null,
      efficiency: result.cost_analysis?.material_efficiency
        ?? (bought ? +((demand / bought) * 100).toFixed(1) : null),
      byType,
    };
  })();

  const appliedCost = result?.cost_analysis && plan ? {
    currency: result.cost_analysis.currency,
    totalCost: result.cost_analysis.total_cost,
    wasteCost: result.cost_analysis.waste_cost,
    costPerUseful: result.cost_analysis.cost_per_useful_material,
    materialEfficiency: result.cost_analysis.material_efficiency,
    costPerBoardType: result.cost_analysis.cost_per_board_type,
    byType: plan.byType,
  } : null;

  /* Exactly what gets sent as prices, so "changed" means the payload changed and
     not merely that a control was touched and put back. */
  const priceKey = () => JSON.stringify([
    optimizeFor,
    ...Object.keys(boardCosts)
      .sort((a, b) => a - b)
      .map(key => `${key}:${boardCosts[key]?.price_per_meter ?? 0}`),
  ]);
  const pricesDirty = !!appliedCost && appliedPriceKey !== null && appliedPriceKey !== priceKey();

  /* ── running a plan ────────────────────────────────────────────────────── */
  const missingPrices = () => {
    if (samePriceForAll) return !uniformPrice || parseFloat(uniformPrice) <= 0;
    return validBoards.some(board => {
      const costData = boardCosts[parseFloat(board)];
      return !costData || !costData.price_per_meter || costData.price_per_meter <= 0;
    });
  };

  const runPlan = async (withPrices) => {
    setApiError("");
    if (hasErrors) return;

    if (withPrices && missingPrices()) {
      setCostSubmitAttempted(true);
      setApiError(samePriceForAll
        ? "Enter a price per metre before pricing the plan"
        : "Every stock length needs a price before pricing the plan");
      return;
    }

    /* The plan stays on screen while the new one computes. Clearing it here
       unmounted the whole plan step mid-request — including the button that
       started it — which collapsed the page, dropped the scroll position to the
       top, and made a finished re-price look like nothing had happened. Any
       input that would invalidate the plan already retires it explicitly. */
    setLoading(true);
    setSaved(null);
    // Captured before the await so the comparison is against the plan the user
    // was actually looking at when they pressed the button.
    const before = withPrices && appliedCost ? {
      totalCost: appliedCost.totalCost,
      boardsUsed: plan.boardsUsed,
      offcut: plan.offcut,
    } : null;
    const key = priceKey();
    try {
      const costData = withPrices
        ? { enabled: true, currency, boardCosts, optimizeFor }
        : null;
      const response = await optimizeCutting(parts, boards, sawKerf, costData);
      setResult(response);
      setPricesApplied(withPrices);
      setPricedBefore(before);
      setAppliedPriceKey(withPrices ? key : null);
      setStep(STEP_PLAN);
    } catch (error) {
      setApiError(error.message || 'Unknown error');
    }
    setLoading(false);
  };

  const handlePlanSubmit = (e) => {
    e.preventDefault();
    runPlan(pricesApplied);
  };

  const handleApplyPrices = () => runPlan(true);

  /* ── keeping a plan ────────────────────────────────────────────────────── */
  const nameError = saveAttempted && !projectName.trim()
    ? 'Give the plan a name so you can find it again — “Chair rails” beats “Untitled”'
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
      const project = await saveProject({
        name: projectName.trim(),
        projectGroupId: selectedGroupId,
        parts,
        boards,
        sawKerf,
        // Only recorded when the plan on screen was actually costed — otherwise
        // half-typed prices would be saved as if they had produced this plan.
        boardCosts: pricesApplied ? {
          same_price_for_all: samePriceForAll,
          uniform_price: samePriceForAll ? parseFloat(uniformPrice) || null : null,
          optimize_for: optimizeFor,
          board_costs: boardCosts,
        } : null,
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
        : `${partCount} parts · ${mm(demand)} mm · ${sawKerf || 0} mm kerf`,
    },
    {
      label: 'The plan',
      reachable: !!plan,
      summary: plan ? `${plan.boardsUsed} boards · ${mm(plan.offcut)} mm offcut` : '',
      locked: 'Runs from your parts',
    },
    {
      label: 'Save',
      reachable: !!plan,
      summary: saved ? `Saved as ${saved.name}` : 'Name it and keep it',
      locked: 'Waits for a plan',
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
        <form className="step-view is-form" onSubmit={handlePlanSubmit}>
          <div className="step-head">
            <div>
              <h1 className="step-h1">Required parts</h1>
              <p className="step-lede">
                Every length you need, and how many of each. Planqer works out how
                much stock to buy and where each cut goes.
              </p>
            </div>
            <button type="button" className="btn" onClick={() => setLoadModalOpen(true)}>
              Load a saved plan
            </button>
          </div>

          <table className="cat-table">
            <thead>
              <tr><th>Item</th><th>Length mm</th><th>Qty</th><th>Total</th><th aria-label="Remove" /></tr>
            </thead>
            <tbody>
              {parts.map((part, index) => (
                <PartInputRow
                  key={index}
                  part={part}
                  index={index}
                  handlePartChange={handlePartChange}
                  handlePartsPaste={handlePartsPaste}
                  removePart={removePart}
                  error={inputErrors.parts[index]}
                  canRemove={parts.length > 1}
                />
              ))}
              <tr className="is-sum">
                <td>Σ</td><td /><td>{partCount}</td><td>{mm(demand)}</td><td />
              </tr>
            </tbody>
          </table>
          <button type="button" className="btn" style={{ marginTop: '12px' }} onClick={addPart}>
            <Plus /> Add part
          </button>
          <p className="synthetic" style={{ marginTop: '10px' }}>
            Paste several lines at once — one length and quantity per line
          </p>

          <div
            className="flex items-end gap-4"
            style={{ marginTop: '26px', paddingTop: '22px', borderTop: '1px solid var(--rule-hair)', flexWrap: 'wrap' }}
          >
            <div style={{ flex: 'none' }}>
              <label className="form-label" htmlFor="saw-kerf">Saw blade</label>
              <div className="flex items-center gap-2">
                <input
                  id="saw-kerf"
                  type="number"
                  step="1"
                  min="1"
                  max="20"
                  value={sawKerf}
                  onChange={(e) => handleKerfChange(e.target.value)}
                  className={`form-input kerf-input ${inputErrors.sawKerf ? 'form-input-error' : ''}`}
                  style={{ width: '78px' }}
                  required
                  placeholder="3"
                  aria-describedby="saw-kerf-hint"
                />
                <span style={{ fontSize: '13.5px', color: 'var(--ink-3)', fontWeight: 600 }}>mm</span>
              </div>
            </div>
            <p
              id="saw-kerf-hint"
              className={inputErrors.sawKerf ? 'text-danger text-[12.5px] font-semibold' : 'synthetic'}
              style={{ flex: '1 1 220px', margin: 0, paddingBottom: '11px' }}
            >
              {inputErrors.sawKerf || 'Every cut turns this much material into dust — the plan accounts for it'}
            </p>
          </div>

          {/* Stock stays in plain sight. It was folded away on the first pass on
              the theory that most people never touch it, which is wrong: what a
              yard actually stocks changes between jobs, and a plan against the
              wrong lengths is wrong at the till. Mirrors the sheet page, where
              the sheet's own dimensions are visible for the same reason. */}
          <section style={{ marginTop: '30px', paddingTop: '22px', borderTop: '1px solid var(--rule-hair)' }}>
            <div className="section-rule">
              <h2 className="section-title">Stock available</h2>
              <span className="folio">What your supplier sells, not what you need</span>
            </div>
            <table className="cat-table">
              <thead>
                <tr><th>Stock</th><th>Length mm</th><th>Metres</th><th aria-label="Remove" /></tr>
              </thead>
              <tbody>
                {boards.map((board, index) => (
                  <BoardLengthRow
                    key={index}
                    board={board}
                    index={index}
                    handleBoardChange={handleBoardChange}
                    handleBoardsPaste={handleBoardsPaste}
                    removeBoard={removeBoard}
                    error={inputErrors.boards[index]}
                    canRemove={boards.length > 1}
                    inPlan={null}
                  />
                ))}
                <tr className="is-sum">
                  <td>Offered</td>
                  <td>{validBoards.length} {validBoards.length === 1 ? 'length' : 'lengths'}</td>
                  <td>—</td>
                  <td />
                </tr>
              </tbody>
            </table>
            <button type="button" className="btn" style={{ marginTop: '12px' }} onClick={addBoard}>
              <Plus /> Add stock length
            </button>
            <p className="synthetic" style={{ marginTop: '10px' }}>
              Check these against the yard before you plan. These lengths — and any
              prices you set for them — are saved with the plan, so a job at a
              different supplier keeps its own.
            </p>
          </section>

          <div style={{ marginTop: '26px' }}>
            <Disclosure
              title="What this page returns, and its limits"
              hint="Boards, an order list, a cut order, and the offcut"
              open={limitsOpen}
              onToggle={() => setLimitsOpen(v => !v)}
            >
              <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                <table className="cat-table is-reference">
                  <tbody>
                    <tr><td>Boards</td><td>The fewest stock lengths that carry every part</td></tr>
                    <tr><td>Order list</td><td>What to buy, by stock length</td></tr>
                    <tr><td>Cut order</td><td>Each board's cuts, in sequence</td></tr>
                    <tr><td>Offcut</td><td>What is left once parts and blade have taken theirs</td></tr>
                  </tbody>
                </table>
                <table className="cat-table is-reference">
                  <tbody>
                    <tr><td>Part and stock length</td><td>6 000 mm maximum</td></tr>
                    <tr><td>Parts per plan</td><td>1 000 maximum</td></tr>
                    <tr><td>Kerf</td><td>Whole millimetres; 2–4 typical</td></tr>
                    <tr><td>Units</td><td>Millimetres only</td></tr>
                  </tbody>
                </table>
              </div>
            </Disclosure>
          </div>

          <div className="step-foot">
            <p className="synthetic step-foot-note">
              {hasErrors
                ? 'Fix the struck lines above and the plan can run'
                : `${partCount} parts against ${validBoards.length} stock ${validBoards.length === 1 ? 'length' : 'lengths'}`}
            </p>
            <div className="step-foot-act">
              <button type="submit" className="btn-order" disabled={loading || hasErrors}>
                {loading ? <><Loader /> Planning</> : <>Plan the cuts <ArrowRight size={15} /></>}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── 02 · the plan ─────────────────────────────────────────────────── */}
      {step === STEP_PLAN && plan && (
        <div className="step-view">
          <div className="step-head" style={{ marginBottom: '20px' }}>
            <div>
              <h1 className="step-h1">Your cutting plan</h1>
              <p className="step-lede">
                Every board drawn at the same scale, with its cuts in the order you
                make them.
              </p>
            </div>
          </div>

          {/* The plan stays on screen while a re-price computes, so it has to stop
              asserting itself: these are last run's figures until the new ones
              land. Dimmed rather than removed — the whole point of re-pricing is
              comparing against what is here now. */}
          <div
            aria-busy={loading}
            style={{ opacity: loading ? 0.45 : 1, transition: 'opacity .15s linear' }}
          >
            <div className="plan-answer">
              <div className="plan-answer-fig">
                <b>{plan.boardsUsed}</b>
                <span className="answer-kicker">
                  {plan.boardsUsed === 1 ? 'board' : 'boards'} for all {partCount} parts
                </span>
              </div>
              <dl className="plan-facts">
                {plan.bought !== null && (
                  <div className="plan-fact"><dt>Material bought</dt><dd>{mm(plan.bought)} mm</dd></div>
                )}
                {plan.offcut !== null && (
                  <div className="plan-fact"><dt>Offcut</dt><dd>{mm(plan.offcut)} mm</dd></div>
                )}
                {plan.kerfLoss !== null && (
                  <div className="plan-fact"><dt>Blade takes</dt><dd>{mm(plan.kerfLoss)} mm</dd></div>
                )}
                {plan.efficiency !== null && (
                  <div className="plan-fact"><dt>Efficiency</dt><dd>{plan.efficiency} %</dd></div>
                )}
                {appliedCost && (
                  <div className="plan-fact">
                    <dt>Cost</dt>
                    <dd>{Number(appliedCost.totalCost).toFixed(2)} {appliedCost.currency}</dd>
                  </div>
                )}
              </dl>
            </div>

            <ResultDisplay result={result} projectName={projectName} />
          </div>

          <div style={{ marginTop: '34px' }}>
            <Disclosure
              title="Cost analysis"
              hint={pricesDirty
                ? 'Prices changed — this plan is still costed at the old ones'
                : appliedCost
                  ? `Priced · ${Number(appliedCost.totalCost).toFixed(2)} ${appliedCost.currency} for the whole plan`
                  : 'Price your stock to see what this plan costs'}
              open={costOpen}
              onToggle={() => setCostOpen(v => !v)}
            >
              <CostAnalysisPanel
                currency={currency}
                validBoards={validBoards}
                boardCosts={boardCosts}
                setBoardCosts={setBoardCosts}
                samePriceForAll={samePriceForAll}
                setSamePriceForAll={setSamePriceForAll}
                uniformPrice={uniformPrice}
                setUniformPrice={setUniformPrice}
                optimizeFor={optimizeFor}
                setOptimizeFor={setOptimizeFor}
                costTouched={costTouched}
                setCostTouched={setCostTouched}
                costSubmitAttempted={costSubmitAttempted}
                onApply={handleApplyPrices}
                applying={loading}
                appliedCost={appliedCost}
                pricesDirty={pricesDirty}
                previous={pricedBefore}
                boardsUsed={plan.boardsUsed}
                offcut={plan.offcut}
              />
            </Disclosure>
          </div>

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
      {step === STEP_SAVE && plan && (
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
                  placeholder="Chair rails"
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
              <ArrowLeft /> Back to the plan
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
                  Nothing saved yet. Run a plan, name it, and it lands here.
                </p>
              ) : (
                <table className="cat-table">
                  <thead><tr><th>Name</th><th>Parts</th><th aria-label="Actions" /></tr></thead>
                  <tbody>
                    {(() => {
                      const projectRow = (project) => (
                        <tr key={project.id}>
                          <td style={{ textAlign: 'left', color: 'var(--ink)', fontSize: '13px' }}>{project.name}</td>
                          <td>{Object.values(project.parts_data).reduce((sum, qty) => sum + qty, 0)}</td>
                          <td style={{ width: '90px' }}>
                            <button className="btn" style={{ padding: '5px 10px', minHeight: 0 }} onClick={() => loadProject(project)}>
                              Load
                            </button>
                          </td>
                        </tr>
                      );

                      // Grouped only when the account actually has projects;
                      // otherwise this stays the flat list it always was.
                      if (projectGroups.length === 0) return userProjects.map(projectRow);

                      const byGroup = new Map();
                      userProjects.forEach(project => {
                        const gid = project.project_group_id || '';
                        if (!byGroup.has(gid)) byGroup.set(gid, []);
                        byGroup.get(gid).push(project);
                      });

                      const headingRow = (key, label) => (
                        <tr key={`heading-${key}`}>
                          <td colSpan={3} style={{ textAlign: 'left', paddingTop: '14px', border: 0 }}>
                            <span className="kicker">{label}</span>
                          </td>
                        </tr>
                      );

                      const rows = [];
                      projectGroups.forEach(group => {
                        const projects = byGroup.get(group.id);
                        if (!projects) return;
                        rows.push(headingRow(group.id, group.name));
                        projects.forEach(p => rows.push(projectRow(p)));
                        byGroup.delete(group.id);
                      });
                      const ungrouped = [...byGroup.values()].flat();
                      if (ungrouped.length) {
                        rows.push(headingRow('ungrouped', 'Not in a project'));
                        ungrouped.forEach(p => rows.push(projectRow(p)));
                      }
                      return rows;
                    })()}
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

export default CuttingOptimizer;
