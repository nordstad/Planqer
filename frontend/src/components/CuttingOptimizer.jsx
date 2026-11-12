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

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { optimizeCutting, saveProject, getProjectGroups, getUserProjects, getUserSettings, movePlanToProject } from '../utils/api';
import { materialLabel } from '../utils/materialLabel';
import { boardPartCount, restoreBoardParts } from '../utils/boardParts';
import ProductPicker from './ProductPicker';
import {
  emptySelection, selectionName, buildSnapshot, selectionFromSnapshot, selectionFromLegacyMaterial,
} from '../utils/catalogue';
import {
  MAX_BOARD_LENGTH,
  SAW_KERF_MAX,
  SAW_KERF_MIN,
  validateBoards,
  validatePartFields,
  validateParts,
} from '../utils/validators';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../contexts/AuthContext';
import { useAccountContext } from '../contexts/useAccountContext';
import BoardLengthRow from './BoardLengthRow';
import CatalogPage from './CatalogPage';
import ConfirmDialog from './ConfirmDialog';
import CostAnalysisPanel from './CostAnalysisPanel';
import Disclosure from './Disclosure';
import FormField, { SectionCard, SectionStatus, splitUnit } from './FormField';
import SavePlanCard from './SavePlanCard';
import MovePlanMenu from './MovePlanMenu';
import { useProjectChoice } from '../hooks/useProjectChoice';
import Loader from './Loader';
import InfoTip from './InfoTip';
import PlanSteps from './PlanSteps';
import { ArrowLeft, ArrowRight, Plus, Tick } from './icons';
import PartInputRow from './PartInputRow';
import ResultDisplay from './ResultDisplay';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

const STEP_PARTS = 0;
const STEP_PLAN = 1;
const STEP_SAVE = 2;

const DEFAULT_CURRENCY = 'SEK';

const EXAMPLE_PARTS = [
  { length: "600", quantity: "4", name: "" },
  { length: "800", quantity: "2", name: "" },
  { length: "1200", quantity: "4", name: "" },
  { length: "1800", quantity: "4", name: "" },
];

const CuttingOptimizer = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const accountContext = useAccountContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState(STEP_PARTS);

  const [parts, setParts] = useState([]);
  const [boards, setBoards] = useState(["2500", "3600", "4200", "5100"]);
  const [sawKerf, setSawKerf] = useState("3"); // millimetres, whole numbers
  const [productSel, setProductSel] = useState(emptySelection);
  const [boardThickness, setBoardThickness] = useState('');
  const [boardWidth, setBoardWidth] = useState('');
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [vatRate, setVatRate] = useState(25);
  const [pricesIncludeVat, setPricesIncludeVat] = useState(true);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [inputErrors, setInputErrors] = useState({ boards: [], sawKerf: "" });

  const [limitsOpen, setLimitsOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);

  /* the save step */
  const [projectGroups, setProjectGroups] = useState([]);
  const [projectName, setProjectName] = useState("");
  const { groupId, setGroupId, newName, setNewName, resolve: resolveProject } = useProjectChoice({
    groups: projectGroups,
    onCreated: (group) => setProjectGroups(prev => [group, ...prev]),
    fallbackName: projectName,
  });
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
  const [saveMode, setSaveMode] = useState('new');
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);

  /* loading one back */
  const [userProjects, setUserProjects] = useState([]);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const inputRevision = useRef(0);

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
  const stockSectionRef = useRef(null);
  const partsHeadingRef = useRef(null);

  const debouncedBoards = useDebounce(boards, 300);
  const debouncedSawKerf = useDebounce(sawKerf, 300);

  useEffect(() => {
    const kerfValue = parseFloat(debouncedSawKerf);
    setInputErrors({
      boards: validateBoards(debouncedBoards, t),
      sawKerf: !debouncedSawKerf || kerfValue < SAW_KERF_MIN
        ? "A kerf of zero would plan cuts that lose no material"
        : kerfValue > SAW_KERF_MAX
          ? t('auditUi.kerfWide')
          : "",
    });
  }, [debouncedBoards, debouncedSawKerf]);

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
      if (Number.isFinite(settings?.default_vat_rate)) setVatRate(settings.default_vat_rate);
      if (typeof settings?.default_prices_include_vat === 'boolean') setPricesIncludeVat(settings.default_prices_include_vat);
    }).catch(() => {
      setCurrency(DEFAULT_CURRENCY);
    });

    getProjectGroups().then(setProjectGroups).catch(() => {});
    getUserProjects().then(setUserProjects).catch(() => {});
  }, [user]);

  // A cutlist handed over from an uploaded model lands here as the starting parts
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    if (urlParams.get('import') !== '3d') return;
    const importData = localStorage.getItem('planqer-3d-import');
    if (!importData) return;
    try {
      const data = JSON.parse(importData);
      if (data.parts && data.source === 'model-cutlist') {
        setParts(Object.entries(data.parts).map(([length, quantity]) => ({
          name: '',
          length,
          quantity: quantity.toString(),
        })));
        setProjectName(data.projectName || '');
        if (data.product?.type) setProductSel(data.product);
        if (data.boardThickness != null) setBoardThickness(String(data.boardThickness));
        if (data.boardWidth != null) setBoardWidth(String(data.boardWidth));
        localStorage.removeItem('planqer-3d-import');
        navigate(location.pathname, { replace: true });
      }
    } catch (err) {
      console.error('Failed to import 3D cutlist data:', err);
    }
  }, [location.pathname, location.search, navigate]);

  /* ── a plan belongs to its inputs ──────────────────────────────────────
     Anything that changes what gets cut retires the plan and the save that
     went with it, so the diagram on the plan step is never a plan for
     different parts. Prices are excluded: they have their own apply button. */
  const retirePlan = () => {
    inputRevision.current += 1;
    setLoading(false);
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
    const previousBoard = boards[index];
    setBoards(boards.map((b, i) => (i === index ? value : b)));
    const previousLength = parseFloat(previousBoard);
    const nextLength = parseFloat(value);
    setBoardCosts((previous) => {
      const next = { ...previous };
      if (Number.isFinite(previousLength)) delete next[previousLength];
      if (Number.isFinite(nextLength) && previous[previousLength] && !next[nextLength]) {
        next[nextLength] = previous[previousLength];
      }
      return next;
    });
  };

  const handleKerfChange = (value) => {
    retirePlan();
    setSawKerf(value);
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
      return { length: length || '', quantity: quantity || '1', name: '' };
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
    setBoardCosts((previous) => Object.fromEntries(
      Object.entries(previous).filter(([length]) => newBoards.some((board) => parseFloat(board) === parseFloat(length)))
    ));
  };

  const addPart = () => { retirePlan(); setParts([...parts, { length: "", quantity: "", name: "" }]); };
  const loadExample = () => { retirePlan(); setParts(EXAMPLE_PARTS.map((part) => ({ ...part }))); };
  const removePart = (index) => {
    if (parts.length <= 1) return;
    retirePlan();
    setParts(parts.filter((_, i) => i !== index));
  };
  const addBoard = () => { retirePlan(); setBoards([...boards, ""]); };
  const removeBoard = (index) => {
    if (boards.length <= 1) return;
    retirePlan();
    const removedLength = parseFloat(boards[index]);
    const remainingBoards = boards.filter((_, i) => i !== index);
    setBoards(remainingBoards);
    if (!remainingBoards.some((board) => parseFloat(board) === removedLength)) {
      setBoardCosts((previous) => {
        const next = { ...previous };
        delete next[removedLength];
        return next;
      });
    }
  };

  const loadProject = (project) => {
    retirePlan();
    setParts(restoreBoardParts(project.parts_data));
    setBoards(project.board_lengths.map(String));
    setSawKerf(project.saw_blade_width.toString());
    setProductSel(project.product
      ? selectionFromSnapshot(project.product)
      : selectionFromLegacyMaterial('board', materialLabel(project.material_type || '', t)));
    setBoardThickness(project.board_thickness ? String(project.board_thickness) : '');
    setBoardWidth(project.board_width ? String(project.board_width) : '');
    setGroupId(project.project_group_id || '');
    setProjectName(project.name);
    setEditingProject(project);
    setSaveMode('update');

    // A plan's prices come back with it — a supplier's quote belongs to the job,
    // not to the app, so a loaded plan is ready to re-run at the prices it was
    // costed at rather than asking for every figure again.
    const priced = project.board_costs;
    setBoardCosts(priced?.board_costs || {});
    setSamePriceForAll(!!priced?.same_price_for_all);
    setUniformPrice(priced?.uniform_price != null ? String(priced.uniform_price) : '');
    setOptimizeFor(priced?.optimize_for || 'waste');
    setVatRate(priced?.vat_rate ?? 25);
    setPricesIncludeVat(priced?.prices_include_vat ?? true);
    setPricesApplied(!!priced);
    setCostOpen(!!priced);

    setLoadModalOpen(false);
    setStep(STEP_PARTS);
  };

  useEffect(() => {
    const editId = new URLSearchParams(location.search).get('edit');
    if (!editId || !userProjects.length) return;
    const project = userProjects.find((item) => String(item.id) === editId);
    if (!project) return;
    loadProject(project);
    navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate, userProjects]);

  /* ── derived facts ─────────────────────────────────────────────────────── */
  const currentPartErrors = parts.map((part) => validatePartFields(part, t));
  const visiblePartError = (part, index) => {
    const errors = currentPartErrors[index];
    if (!errors) return null;
    const visible = Object.fromEntries(Object.entries(errors).filter(([field]) => part[field] !== ''));
    return Object.keys(visible).length > 0 ? visible : null;
  };
  const partCount = parts.reduce((n, p) => n + (parseInt(p.quantity, 10) || 0), 0);
  const demand = parts.reduce(
    (sum, p) => sum + (parseFloat(p.length) || 0) * (parseFloat(p.quantity) || 0), 0);
  const sectionDims = { thickness: parseFloat(boardThickness), width: parseFloat(boardWidth) };
  const material = selectionName(productSel, i18n.language, sectionDims);
  const hasErrors = parts.length === 0 || currentPartErrors.some(Boolean) || inputErrors.boards.some(Boolean) || !!inputErrors.sawKerf
    || !parseFloat(boardThickness) || !parseFloat(boardWidth);
  const validBoards = boards.filter(b => b && !isNaN(parseFloat(b)));
  const uniqueValidBoards = [...new Set(validBoards.map((board) => parseFloat(board)))];
  const pricedBoardCount = uniqueValidBoards.filter((board) => boardCosts[board]?.price_per_meter > 0).length;
  const pricingComplete = uniqueValidBoards.length > 0 && pricedBoardCount === uniqueValidBoards.length;
  const pricingPartial = pricedBoardCount > 0 && !pricingComplete;

  const goToRequiredParts = () => {
    partsHeadingRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    partsHeadingRef.current?.focus({ preventScroll: true });
  };

  /* ── section status and the first thing blocking the plan ──────────────── */
  const unitless = (key) => splitUnit(t(key)).text;
  const materialMissing = [
    !parseFloat(boardThickness) && unitless('workflow.thicknessMm'),
    !parseFloat(boardWidth) && unitless('workflow.widthMm'),
  ].filter(Boolean);
  const partRowsWrong = parts.some((part, index) => visiblePartError(part, index));
  const partRowsBlank = currentPartErrors.some((errors, index) => errors && Object.keys(errors).some((field) => parts[index][field] === ''));
  const stockWrong = inputErrors.boards.some(Boolean);
  const goToSection = (id) => window.setTimeout(() => {
    const section = document.getElementById(id);
    if (!section) return;
    section.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    const fields = [...section.querySelectorAll('input:not([type=checkbox]):not([type=radio]), select')];
    (fields.find((field) => !field.value) || fields[0])?.focus({ preventScroll: true });
  }, 0);
  const toParts = { name: t('workflow.goToRequiredParts'), go: goToRequiredParts };
  const toMaterial = { name: t('formUi.goTo', { name: t('workflow.materialProfile') }), go: () => goToSection('board-material') };
  const blocker = parts.length === 0 ? { text: t('workflow.partsRequiredBeforePlanning'), ...toParts }
    : partRowsWrong ? { text: t('ui.fixLines'), ...toParts }
    : partRowsBlank ? { text: t('boardUi.fillPartRows'), ...toParts }
    : inputErrors.sawKerf ? { text: inputErrors.sawKerf, ...toMaterial }
    : materialMissing.length ? { text: t('boardUi.fillToPlan', { fields: materialMissing.join(', ') }), ...toMaterial }
    : stockWrong ? { text: t('ui.fixLines'), name: t('formUi.goTo', { name: t('workflow.stockAvailable') }), go: () => goToSection('board-stock') }
    : null;
  const pricingSummary = [
    pricingComplete ? t('ui.pricesComplete', { total: uniqueValidBoards.length })
      : pricingPartial ? t('ui.pricesProgress', { priced: pricedBoardCount, total: uniqueValidBoards.length })
        : t('boardUi.noPrices'),
    optimizeFor === 'cost' ? t('ui.leastMoney') : t('ui.leastWaste'),
  ].join(' · ');

  useEffect(() => {
    if (!pricingComplete && optimizeFor === 'cost') setOptimizeFor('waste');
  }, [pricingComplete, optimizeFor]);

  const handleBoardPriceChange = (board, value) => {
    retirePlan();
    setSamePriceForAll(false);
    const boardLength = parseFloat(board);
    const pricePerMeter = parseFloat(value) || 0;
    setBoardCosts((previous) => ({
      ...previous,
      [boardLength]: {
        price_per_meter: pricePerMeter,
        price_per_board: pricePerMeter * (boardLength / 1000),
      },
    }));
  };

  const priceEveryBoard = (pricePerMeter) => {
    const next = {};
    uniqueValidBoards.forEach((boardLength) => {
      next[boardLength] = {
        price_per_meter: pricePerMeter,
        price_per_board: pricePerMeter * (boardLength / 1000),
      };
    });
    setBoardCosts(next);
    retirePlan();
  };

  const handleUniformPriceChange = (value) => {
    setUniformPrice(value);
    if (samePriceForAll) priceEveryBoard(parseFloat(value) || 0);
  };

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
  const runPlan = async (withPrices) => {
    setApiError("");
    if (hasErrors) return;

    const requestRevision = ++inputRevision.current;

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
      if (requestRevision !== inputRevision.current) return;
      setResult(response);
      setPricesApplied(withPrices);
      setPricedBefore(before);
      setAppliedPriceKey(withPrices ? key : null);
      setStep(STEP_PLAN);
    } catch (error) {
      if (requestRevision !== inputRevision.current) return;
      setApiError(error.message || t('auditUi.unknownError'));
    } finally {
      if (requestRevision === inputRevision.current) setLoading(false);
    }
  };

  const handlePlanSubmit = (e) => {
    e.preventDefault();
    const currentParts = validateParts(parts, t);
    const currentErrors = {
      boards: validateBoards(boards, t),
      sawKerf: !sawKerf || parseFloat(sawKerf) < SAW_KERF_MIN
        ? t('workflow.kerfHint')
        : parseFloat(sawKerf) > SAW_KERF_MAX ? t('auditUi.kerfWide') : '',
    };
    setInputErrors(currentErrors);
    if (currentParts.some(Boolean) || currentErrors.boards.some(Boolean) || currentErrors.sawKerf) return;
    runPlan(pricingComplete);
  };

  const addStockPrices = () => {
    setStep(STEP_PARTS);
    window.setTimeout(() => {
      stockSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      stockSectionRef.current?.focus();
    }, 0);
  };

  /* ── keeping a plan ────────────────────────────────────────────────────── */
  const nameError = saveAttempted && !projectName.trim()
    ? t('auditUi.nameRequired')
    : '';

  const savePlan = async () => {
    setSaving(true);
    try {
      const project = await saveProject({
        id: saveMode === 'update' ? editingProject?.id : undefined,
        name: projectName.trim(),
        projectGroupId: await resolveProject(),
        parts,
        boards,
        sawKerf,
        materialType: material,
        product: buildSnapshot(productSel, i18n.language, sectionDims),
        boardThickness,
        boardWidth,
        // Only recorded when the plan on screen was actually costed — otherwise
        // half-typed prices would be saved as if they had produced this plan.
        boardCosts: pricesApplied ? {
          same_price_for_all: samePriceForAll,
           uniform_price: samePriceForAll ? parseFloat(uniformPrice) || null : null,
           currency,
           vat_rate: vatRate,
           prices_include_vat: pricesIncludeVat,
           optimize_for: optimizeFor,
          board_costs: boardCosts,
        } : null,
        result,
      });
      setSaved(project);
      setUserProjects(prev => saveMode === 'update'
        ? prev.map(p => p.id === project.id ? project : p)
        : [project, ...prev]);
    } catch (error) {
      setApiError(error.message || t('auditUi.saveFailed'));
    }
    setSaving(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveAttempted(true);
    setApiError("");
    if (!projectName.trim()) return;
    if (saveMode === 'update') {
      setUpdateConfirmOpen(true);
      return;
    }
    await savePlan();
  };

  const savedGroupName = saved
    ? projectGroups.find(g => g.id === saved.project_group_id)?.name
    : null;
  const selectedGroupName = projectGroups.find(g => g.id === groupId)?.name;
  const moveSavedPlan = async (group) => {
    try {
      const moved = await movePlanToProject({ ...saved, projectType: 'board' }, group.id);
      setSaved(moved);
      localStorage.setItem('planqer.lastProjectGroup', group.id);
      return true;
    } catch (error) {
      setApiError(t('projectUi.moveFailed', { message: error.message }));
      return false;
    }
  };

  /* ── the rail ──────────────────────────────────────────────────────────── */
  const steps = [
    {
      label: t('workflow.parts'),
      reachable: true,
      // Name the actual state: no parts, something wrong, or the parts so far
      // (a missing board size is shown on its own card, not as a broken row).
      summary: parts.length === 0
        ? t('workflow.partsNeeded')
        : partRowsWrong || stockWrong || inputErrors.sawKerf
          ? t('workflow.someLinesNeedFixing')
          : t('workflow.partsSummary', { count: partCount, demand: mm(demand), kerf: sawKerf || 0 }),
    },
    {
      label: t('workflow.thePlan'),
      reachable: !!plan,
      summary: plan ? t('workflow.boardsSummary', { count: plan.boardsUsed, offcut: mm(plan.offcut) }) : '',
      locked: t('workflow.runsFromParts'),
    },
    {
      label: t('workflow.save'),
      reachable: !!plan,
      summary: saved ? t('workflow.savedAs', { name: saved.name }) : t('workflow.nameAndKeep'),
      locked: t('workflow.waitsForPlan'),
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
        <form className="step-view is-form" onSubmit={handlePlanSubmit} noValidate>
          <div className="step-head">
            <div>
              <h1 className="step-h1">{t('common.boardCutting')}</h1>
              <p className="step-lede">{t('workflow.requiredPartsIntro')}</p>
              <p className="form-legend"><span className="req-mark" aria-hidden="true" />{t('formUi.requiredLegend')}</p>
            </div>
            <button type="button" className="btn-text" onClick={() => setLoadModalOpen(true)}>
              {t('workflow.loadSavedPlan')}
            </button>
          </div>

          <SectionCard
            id="board-parts"
            title={t('workflow.requiredParts')}
            titleRef={partsHeadingRef}
            status={parts.length === 0 ? <SectionStatus todo={t('workflow.partsNeeded')} live />
              : partRowsWrong ? <SectionStatus error={t('formUi.checkValues')} />
                : partRowsBlank ? <SectionStatus todo={t('boardUi.emptyRows')} />
                  : <SectionStatus done={t('boardUi.partsDone', { count: partCount, demand: mm(demand) })} />}
          >
            <table className="cat-table parts-table">
              <colgroup>
                <col className="part-item-col" />
                <col className="part-size-col" />
                <col className="part-quantity-col" />
                <col />
                <col className="part-remove-col" />
              </colgroup>
              <thead>
                <tr>
                  <th>{t('workflow.item')}</th>
                  <th>{t('workflow.lengthMm')}<span className="req-mark" aria-hidden="true" /></th>
                  <th>{t('workflow.qty')}<span className="req-mark" aria-hidden="true" /></th>
                  <th>{t('workflow.name')}{' '}<span className="opt-mark">{t('formUi.optionalMark')}</span></th>
                  <th aria-label={t('common.remove')} />
                </tr>
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
                    error={visiblePartError(part, index)}
                    canRemove={parts.length > 1}
                  />
                ))}
                {parts.length > 0 ? (
                  <tr className="is-sum">
                    <td>Σ</td><td>{mm(demand)}</td><td>{partCount}</td><td /><td />
                  </tr>
                ) : (
                  <tr>
                    <td colSpan="5" className="synthetic">{t('workflow.emptyParts')}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="flex items-center gap-3" style={{ marginTop: '14px', flexWrap: 'wrap' }}>
              <button type="button" className="btn-primary" onClick={addPart}>
                <Plus /> {t('workflow.addPart')}
              </button>
              {parts.length === 0 && (
                <button type="button" className="btn-text" onClick={loadExample}>
                  {t('workflow.tryExample')}
                </button>
              )}
              <InfoTip label={t('workflow.parts')}>{t('workflow.pasteParts')}</InfoTip>
            </div>
          </SectionCard>

          <SectionCard
            id="board-material"
            title={t('workflow.materialProfile')}
            status={inputErrors.sawKerf ? <SectionStatus error={t('formUi.checkValues')} /> : <SectionStatus missing={materialMissing} />}
          >
            <div style={{ marginBottom: '18px' }}>
              <span className="form-label" style={{ display: 'block' }}>{t('productUi.product')}{' '}<span className="opt-mark">{t('formUi.optionalMark')}</span></span>
              <ProductPicker
                kind="board"
                value={productSel}
                onChange={(next) => { retirePlan(); setProductSel(next); }}
                dims={sectionDims}
                label={t('productUi.product')}
                onUseDimensions={(entry) => {
                  retirePlan();
                  setBoardThickness(String(entry.thickness));
                  setBoardWidth(String(entry.width));
                }}
                onUseLengths={(lengths) => { retirePlan(); setBoards(lengths.map(String)); }}
              />
            </div>
            <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
              <FormField label={t('workflow.thicknessMm')} required>
                <input id="board-thickness" type="number" min="1" step="1" value={boardThickness} onChange={(e) => { retirePlan(); setBoardThickness(e.target.value); }} className="form-input dimension-input" />
              </FormField>
              <FormField label={t('workflow.widthMm')} required>
                <input id="board-width" type="number" min="1" step="1" value={boardWidth} onChange={(e) => { retirePlan(); setBoardWidth(e.target.value); }} className="form-input dimension-input" />
              </FormField>
              <div className="md:col-span-2">
                <FormField label={t('workflow.sawBlade')} unit="mm" required tip={t('workflow.kerfHint')}>
                  <input
                    id="saw-kerf"
                    type="number"
                    min={SAW_KERF_MIN}
                    max={SAW_KERF_MAX}
                    step="0.1"
                    value={sawKerf}
                    onChange={(e) => handleKerfChange(e.target.value)}
                    className={`form-input kerf-input dimension-input ${inputErrors.sawKerf ? 'form-input-error' : ''}`}
                    aria-invalid={!!inputErrors.sawKerf || undefined}
                    aria-describedby={inputErrors.sawKerf ? 'saw-kerf-error' : undefined}
                  />
                </FormField>
                {inputErrors.sawKerf && <p id="saw-kerf-error" className="text-danger text-[12.5px] font-semibold" style={{ marginTop: '6px' }}>{inputErrors.sawKerf}</p>}
              </div>
            </div>
          </SectionCard>

          {/* Stock stays in plain sight. It was folded away on the first pass on
              the theory that most people never touch it, which is wrong: what a
              yard actually stocks changes between jobs, and a plan against the
              wrong lengths is wrong at the till. Mirrors the sheet page, where
              the sheet's own dimensions are visible for the same reason. */}
          <SectionCard
            id="board-stock"
            sectionRef={stockSectionRef}
            title={t('workflow.stockAvailable')}
            summary={t('workflow.supplierStock')}
            status={stockWrong ? <SectionStatus error={t('formUi.checkValues')} />
              : validBoards.length === 0 ? <SectionStatus todo={t('boardUi.addStock')} />
                : <SectionStatus done={t('workflow.lengthCount', { count: validBoards.length })} />}
          >
            <div className="stock-table-wrap">
              <table className="cat-table">
                <thead>
                  <tr>
                    <th>{t('workflow.lengthMm')}<span className="req-mark" aria-hidden="true" /></th>
                    <th>{t('workflow.metres')}</th>
                    <th>{t('ui.stockPrice')}{' '}<span className="opt-mark">{t('formUi.optionalMark')}</span></th>
                    <th aria-label={t('common.remove')} />
                  </tr>
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
                      currency={currency}
                      price={boardCosts[parseFloat(board)]?.price_per_meter}
                      handlePriceChange={handleBoardPriceChange}
                    />
                  ))}
                  <tr className="is-sum">
                    <td>{t('workflow.offered')}</td>
                    <td>{t('workflow.lengthCount', { count: validBoards.length })}</td>
                    <td />
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
            <button type="button" className="btn-primary" style={{ marginTop: '14px' }} onClick={addBoard}>
              <Plus /> {t('workflow.addStockLength')}
            </button>
            <p className="synthetic" style={{ marginTop: '10px' }}>
              {t('ui.checkStock')}
            </p>
          </SectionCard>

          <SectionCard
            id="board-pricing"
            title={t('ui.pricesAndCost')}
            optional
            tip={t('ui.stockPricingOptional')}
            summary={pricingSummary}
          >
            <label className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: '13.5px', fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={samePriceForAll}
                onChange={(e) => {
                  retirePlan();
                  setSamePriceForAll(e.target.checked);
                  if (e.target.checked && uniformPrice) priceEveryBoard(parseFloat(uniformPrice) || 0);
                }}
              />
              {t('ui.onePriceAll')}
            </label>
            {samePriceForAll && (
              <FormField label={t('ui.uniformPrice', { currency })} className="mt-3">
                <input
                  id="uniform-stock-price"
                  type="number"
                  min="0"
                  step="0.1"
                  value={uniformPrice}
                  onChange={(e) => handleUniformPriceChange(e.target.value)}
                  className="form-input dimension-input"
                />
              </FormField>
            )}
            <fieldset style={{ marginTop: '16px', border: 0, padding: 0, minWidth: 0 }}>
              <legend className="form-label" style={{ padding: 0 }}>{t('ui.whatChase')}</legend>
              <label className="flex items-start gap-3" style={{ cursor: 'pointer', padding: '5px 0' }}>
                <input
                  type="radio"
                  name="optimizeFor-input"
                  value="waste"
                  checked={optimizeFor === 'waste'}
                  onChange={() => { retirePlan(); setOptimizeFor('waste'); }}
                  style={{ marginTop: '3px' }}
                />
                <span><b style={{ fontSize: '13.5px' }}>{t('ui.leastWaste')}</b><span className="block synthetic">{t('ui.leastWasteHint')}</span></span>
              </label>
              <label className="flex items-start gap-3" style={{ cursor: pricingComplete ? 'pointer' : 'default', padding: '5px 0' }}>
                <input
                  type="radio"
                  name="optimizeFor-input"
                  value="cost"
                  checked={optimizeFor === 'cost'}
                  onChange={() => { retirePlan(); setOptimizeFor('cost'); }}
                  disabled={!pricingComplete}
                  aria-describedby="lowest-cost-help"
                  style={{ marginTop: '3px' }}
                />
                <span><b style={{ fontSize: '13.5px' }}>{t('ui.leastMoney')}</b><span className="block synthetic">{t('ui.leastMoneyHint')}</span></span>
              </label>
              {!pricingComplete && <p id="lowest-cost-help" className="synthetic" style={{ margin: '4px 0 0 28px' }}>{t('ui.lowestCostNeedsPrices')}</p>}
            </fieldset>
          </SectionCard>

          <div style={{ marginTop: '22px' }}>
            <Disclosure
               title={t('ui.whatPageReturns')}
               hint={t('ui.boardsHint')}
              open={limitsOpen}
              onToggle={() => setLimitsOpen(v => !v)}
            >
              <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                <table className="cat-table is-reference">
                  <tbody>
                    <tr><td>{t('legacy.boards')}</td><td>{t('help.cutPlanText')}</td></tr>
                    <tr><td>{t('workflow.whatToBuy')}</td><td>{t('workflow.supplierStock')}</td></tr>
                    <tr><td>{t('workflow.cutOrder')}</td><td>{t('workflow.cuttingPlanIntro')}</td></tr>
                    <tr><td>{t('ui.offcut')}</td><td>{t('help.offcutText')}</td></tr>
                  </tbody>
                </table>
                <table className="cat-table is-reference">
                  <tbody>
                    <tr><td>{t('workflow.lengthMm')}</td><td>≤ {mm(MAX_BOARD_LENGTH)} mm</td></tr>
                    <tr><td>{t('workflow.parts')}</td><td>≤ 1 000</td></tr>
                    <tr><td>{t('help.kerf')}</td><td>{t('legacy.unitsDeclared')}</td></tr>
                    <tr><td>{t('common.units')}</td><td>{t('common.units')}</td></tr>
                  </tbody>
                </table>
              </div>
            </Disclosure>
          </div>

          <div className="step-foot">
            <p className="synthetic step-foot-note">
              {blocker ? blocker.text : t('ui.partsAgainstStock', { parts: partCount, stock: validBoards.length, unit: t(validBoards.length === 1 ? 'ui.stockUnit' : 'ui.stockUnits') })}
              {blocker && <> <button type="button" className="btn-link" onClick={blocker.go}>{blocker.name}</button></>}
            </p>
            <div className="step-foot-act">
              <button type="submit" className="btn-order" disabled={loading || hasErrors}>
                {loading ? <><Loader /> {t('workflow.planning')}</> : <>{t('workflow.planTheCuts')} <ArrowRight size={15} /></>}
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
              <h1 className="step-h1">{t('workflow.yourCuttingPlan')}</h1>
              <p className="step-lede">
                {t('workflow.cuttingPlanIntro')}
              </p>
              <p className="plan-material-summary" data-testid="plan-material-summary">
                {material ? `${material} · ` : ''}{boardThickness} × {boardWidth} mm
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
                   {t('ui.forAllParts', { count: partCount }).replace('{{count}}', `${plan.boardsUsed} ${t(plan.boardsUsed === 1 ? 'ui.board' : 'ui.boards')}`)}
                </span>
              </div>
              <dl className="plan-facts">
                {plan.bought !== null && (
                   <div className="plan-fact"><dt>{t('ui.materialBought')}</dt><dd>{mm(plan.bought)} mm</dd></div>
                )}
                {plan.offcut !== null && (
                   <div className="plan-fact"><dt>{t('ui.offcut')}</dt><dd>{mm(plan.offcut)} mm</dd></div>
                )}
                {plan.kerfLoss !== null && (
                   <div className="plan-fact"><dt>{t('ui.bladeTakes')}</dt><dd>{mm(plan.kerfLoss)} mm</dd></div>
                )}
                {plan.efficiency !== null && (
                   <div className="plan-fact"><dt>{t('ui.efficiency')}</dt><dd>{plan.efficiency} %</dd></div>
                )}
                {appliedCost && (
                  <div className="plan-fact">
                     <dt>{t('ui.cost')}</dt>
                    <dd>{Number(appliedCost.totalCost).toFixed(2)} {appliedCost.currency}</dd>
                  </div>
                )}
              </dl>
            </div>

             <ResultDisplay result={result} projectName={projectName} materialType={material} boardThickness={parseFloat(boardThickness)} boardWidth={parseFloat(boardWidth)} />
          </div>

          <div style={{ marginTop: '34px' }}>
            <Disclosure
               title={t('ui.pricesAndCost')}
               hint={pricesDirty
                 ? t('auditUi.pricesChanged')
                 : appliedCost
                    ? t('ui.pricedForPlan', { total: Number(appliedCost.totalCost).toFixed(2), currency: appliedCost.currency })
                   : t('auditUi.priceStock')}
              open={costOpen}
              onToggle={() => setCostOpen(v => !v)}
            >
              <CostAnalysisPanel
                optimizeFor={optimizeFor}
                appliedCost={appliedCost}
                pricesDirty={pricesDirty}
                previous={pricedBefore}
                boardsUsed={plan.boardsUsed}
                offcut={plan.offcut}
                onAddStockPrices={addStockPrices}
              />
            </Disclosure>
          </div>

          <div className="step-foot">
            <button type="button" className="btn-text" onClick={() => setStep(STEP_PARTS)}>
               <ArrowLeft /> {t('ui.changeParts')}
            </button>
            <div className="step-foot-act">
              <button type="button" className="btn-order" onClick={() => setStep(STEP_SAVE)}>
                 {saved ? t('ui.backToSave') : t('ui.nameAndSave')} <ArrowRight size={15} />
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
               <h1 className="step-h1">{saved ? t('workflow.planSaved') : t('workflow.saveThisPlan')}</h1>
              <p className="step-lede">
                {saved
                   ? t('ui.keptPlan', accountContext)
                   : t('ui.namePlan')}
              </p>
            </div>
          </div>

          {saved ? (
            <div className="saved-mark">
              <Tick size={16} />
              <div>
                   <b>{t('ui.savedAs', { name: saved.name })}</b>
                <p>
                    {savedGroupName ? t('ui.filedUnder', { group: savedGroupName }) : t('ui.unfiled')}
                </p>
                <MovePlanMenu groups={projectGroups} currentGroupId={saved.project_group_id} onMove={moveSavedPlan} />
                <p className="synthetic">
                  {t('ui.addMorePlans')} <Link to="/">{t('ui.startAnotherPlan')}</Link>
                </p>
              </div>
            </div>
          ) : (
            <SavePlanCard
              id="board-save"
              nameId="plan-name"
              modeId="board-save-mode"
              nameLabel={t('ui.name')}
              projectName={projectName}
              onProjectName={setProjectName}
              nameError={nameError}
              editingProject={editingProject}
              onEditingProject={setEditingProject}
              saveMode={saveMode}
              onSaveMode={setSaveMode}
              userProjects={userProjects}
              projectGroups={projectGroups}
              groupId={groupId}
              onGroupId={setGroupId}
              newName={newName}
              onNewName={setNewName}
            />
          )}

          <div className="step-foot">
            <button type="button" className="btn-text" onClick={() => setStep(STEP_PLAN)}>
              <ArrowLeft /> {t('workflow.backToPlan')}
            </button>
            {saved ? (
              <div className="step-foot-act">
                <Link to="/dashboard" className="btn-order">
                   {t('ui.openDashboard')} <ArrowRight size={15} />
                </Link>
              </div>
            ) : (
              <div className="step-foot-act">
                <button type="submit" className="btn-order" disabled={saving}>
                    {saving ? <><Loader /> {t('common.saving')}</> : saveMode === 'update' ? t('workflow.updatePlan') : selectedGroupName ? t('ui.saveToProject', { project: selectedGroupName }) : t('workflow.savePlan')}
                </button>
              </div>
            )}
          </div>
        </form>
      )}

      {/* ── load a saved plan ─────────────────────────────────────────────── */}
      <ConfirmDialog
        open={updateConfirmOpen}
        title={t('ui.updatePlanTitle')}
        message={t('ui.updatePlanConfirm', { name: editingProject?.name || projectName })}
        confirmLabel={t('ui.updateExistingPlan')}
        danger={false}
        onConfirm={() => { setUpdateConfirmOpen(false); savePlan(); }}
        onCancel={() => setUpdateConfirmOpen(false)}
      />

      {loadModalOpen && (
         <div className="cat-overlay" role="dialog" aria-modal="true" aria-label={t('workflow.loadSavedPlan')}>
          <div className="cat-sheet">
            <div className="masthead" style={{ marginTop: 0 }}>
               <span className="masthead-brand" style={{ fontSize: '13px' }}>{t('ui.savedPlans')}</span>
              <span className="masthead-section" />
              <button type="button" className="masthead-flash" onClick={() => setLoadModalOpen(false)}>
                 {t('ui.close')}
              </button>
            </div>
            <div style={{ padding: '14px 16px 18px' }}>
              {userProjects.length === 0 ? (
                <p style={{ color: 'var(--ink-3)', fontSize: '13px' }}>
                   {t('ui.nothingSavedShort')}
                </p>
              ) : (
                <table className="cat-table">
                   <thead><tr><th>{t('ui.name')}</th><th>{t('ui.parts')}</th><th aria-label={t('ui.actions')} /></tr></thead>
                  <tbody>
                    {(() => {
                      const projectRow = (project) => (
                        <tr key={project.id}>
                          <td style={{ textAlign: 'left', color: 'var(--ink)', fontSize: '13px' }}>{project.name}</td>
                          <td>{boardPartCount(project.parts_data)}</td>
                          <td style={{ width: '90px' }}>
                            <button className="btn btn-primary btn-sm" onClick={() => loadProject(project)}>
                               {t('ui.load')}
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
                        rows.push(headingRow('ungrouped', t('auditUi.ungrouped')));
                        ungrouped.forEach(p => rows.push(projectRow(p)));
                      }
                      return rows;
                    })()}
                  </tbody>
                </table>
              )}
              <p className="synthetic" style={{ marginTop: '12px' }}>
                 {t('ui.renameDeleteHint')}
              </p>
            </div>
          </div>
        </div>
      )}
    </CatalogPage>
  );
};

export default CuttingOptimizer;
