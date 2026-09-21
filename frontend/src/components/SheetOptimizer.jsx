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
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import ConfirmDialog from './ConfirmDialog';
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

const validateSheetParts = (parts, t) => parts.map((part) => {
  const errors = {};
  const width = parseFloat(part.width);
  const height = parseFloat(part.height);
  const quantity = parseInt(part.quantity, 10);

  if (!part.width || isNaN(width) || width <= 0) errors.width = t('tileUi.positiveWidth');
  else if (width > 5000) errors.width = t('tileUi.cannotExceed', { label: t('workflow.width'), max: '5000 mm' });

  if (!part.height || isNaN(height) || height <= 0) errors.height = t('tileUi.positiveHeight');
  else if (height > 5000) errors.height = t('tileUi.cannotExceed', { label: t('workflow.height'), max: '5000 mm' });

  if (!part.quantity || isNaN(quantity) || quantity <= 0) errors.quantity = t('tileUi.numberRequired', { label: t('workflow.qty') });
  else if (quantity > 1000) errors.quantity = t('tileUi.cannotExceed', { label: t('workflow.qty'), max: 1000 });

  return Object.keys(errors).length > 0 ? errors : null;
});

const SheetOptimizer = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [step, setStep] = useState(STEP_PARTS);

  const [parts, setParts] = useState([
    { width: "800", height: "400", quantity: "2", name: t('workflow.parts'), id: "shelf_back" },
    { width: "300", height: "400", quantity: "4", name: t('workflow.parts'), id: "shelf_side" },
    { width: "780", height: "280", quantity: "2", name: t('workflow.parts'), id: "shelf_bottom" },
  ]);

  const [sheetWidth, setSheetWidth] = useState("1200");
  const [sheetHeight, setSheetHeight] = useState("2500");
  const [kerfWidth, setKerfWidth] = useState("3");
  const [materialType, setMaterialType] = useState("plywood");
  const [customMaterial, setCustomMaterial] = useState("");
  const [sheetThickness, setSheetThickness] = useState("");
  const [algorithm, setAlgorithm] = useState("");
  const [allowRotation, setAllowRotation] = useState(true);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
   const [inputErrors, setInputErrors] = useState({ parts: [], sheetWidth: "", sheetHeight: "", kerfWidth: "", sheetThickness: "", material: "" });

  const [strategyOpen, setStrategyOpen] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);

  /* the save step */
  const [projectGroups, setProjectGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [projectName, setProjectName] = useState("");
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [editingProject, setEditingProject] = useState(null);
  const [saveMode, setSaveMode] = useState('new');
  const [updateConfirmOpen, setUpdateConfirmOpen] = useState(false);

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
       parts: validateSheetParts(debouncedParts, t),
      sheetWidth: !debouncedSheetWidth || isNaN(width) || width <= 0
         ? t('tileUi.positiveWidth')
         : width > 10000 ? t('tileUi.cannotExceed', { label: t('workflow.width'), max: '10 000 mm' }) : "",
      sheetHeight: !debouncedSheetHeight || isNaN(height) || height <= 0
         ? t('tileUi.positiveHeight')
         : height > 10000 ? t('tileUi.cannotExceed', { label: t('workflow.height'), max: '10 000 mm' }) : "",
       kerfWidth: !debouncedKerfWidth || isNaN(kerf) || kerf < 0
          ? t('modelUi.kerfZero')
          : kerf > 50 ? t('modelUi.kerfWide') : "",
       sheetThickness: !sheetThickness || isNaN(parseFloat(sheetThickness)) || parseFloat(sheetThickness) <= 0
         ? t('auditUi.sheetThicknessRequired') : "",
       material: !materialType || (materialType === 'custom' && !customMaterial.trim())
         ? t('auditUi.sheetMaterialRequired') : "",
     });
   }, [debouncedParts, debouncedSheetWidth, debouncedSheetHeight, debouncedKerfWidth, sheetThickness, materialType, customMaterial, t]);

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
    setCustomMaterial('');
    setSheetThickness(project.sheet_thickness ? String(project.sheet_thickness) : '');
    setAlgorithm(project.algorithm || "");
    setAllowRotation(project.allow_rotation !== false);
    setSelectedGroupId(project.project_group_id || '');
    setProjectName(project.name);
    setEditingProject(project);
    setSaveMode('update');
    setLoadModalOpen(false);
    setStep(STEP_PARTS);
  };

  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get('edit');
    if (!editId || !userProjects.length) return;
    const project = userProjects.find((item) => String(item.id) === editId);
    if (!project) return;
    loadProject(project);
    window.history.replaceState({}, document.title, window.location.pathname);
  }, [userProjects]);

  /* ── derived facts ─────────────────────────────────────────────────────── */
  const partCount = parts.reduce((n, p) => n + (parseInt(p.quantity, 10) || 0), 0);
  const hasErrors = inputErrors.parts.some(Boolean)
    || !!inputErrors.sheetWidth || !!inputErrors.sheetHeight || !!inputErrors.kerfWidth
    || !!inputErrors.sheetThickness || !!inputErrors.material;
  const sheetError = inputErrors.sheetWidth || inputErrors.sheetHeight || inputErrors.sheetThickness || inputErrors.material;

  /* ── running a layout ──────────────────────────────────────────────────── */
  const handleLayoutSubmit = async (e) => {
    e.preventDefault();
    setApiError("");
    if (hasErrors) return;

    setLoading(true);
    setResult(null);
    setSaved(null);
    try {
      const effectiveMaterial = materialType === 'custom' ? customMaterial.trim() : materialType;
      const response = await optimizeSheetCutting(
        parts, sheetWidth, sheetHeight, kerfWidth, effectiveMaterial, algorithm || undefined, allowRotation
      );
      setResult(response);
      setStep(STEP_PLAN);
    } catch (error) {
      setApiError(error.message || t('auditUi.unknownError'));
    }
    setLoading(false);
  };

  /* ── keeping a layout ──────────────────────────────────────────────────── */
  const nameError = saveAttempted && !projectName.trim()
    ? t('workflow.nameAndKeep')
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
      setApiError(`${t('auditUi.createProjectFailed')}: ${err.message}`);
      return false;
    }
  };

  const savePlan = async () => {
    setSaving(true);
    try {
      const project = await saveSheetProject({
        id: saveMode === 'update' ? editingProject?.id : undefined,
        name: projectName.trim(),
        projectGroupId: selectedGroupId,
        parts,
        sheetWidth,
        sheetHeight,
        sheetThickness,
        kerfWidth,
        materialType: materialType === 'custom' ? customMaterial.trim() : materialType,
        algorithm,
        allowRotation,
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

  /* ── the rail ──────────────────────────────────────────────────────────── */
  const steps = [
    {
      label: t('workflow.parts'),
      reachable: true,
      summary: hasErrors
        ? t('workflow.someLinesNeedFixing')
        : t('workflow.sheetPartsSummary', { count: partCount, width: mm(parseFloat(sheetWidth)), height: mm(parseFloat(sheetHeight)) }),
    },
    {
      label: t('workflow.theLayout'),
      reachable: !!result,
      summary: result
        ? t('workflow.sheetsSummary', { count: result.total_sheets, efficiency: result.overall_efficiency.toFixed(1) })
        : '',
      locked: t('workflow.packsFromParts'),
    },
    {
      label: t('workflow.save'),
      reachable: !!result,
      summary: saved ? t('workflow.savedAs', { name: saved.name }) : t('workflow.nameAndKeep'),
      locked: t('workflow.waitsForLayout'),
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
              <h1 className="step-h1">{t('workflow.partsToCut')}</h1>
              <p className="step-lede">
                {t('workflow.partsToCutIntro')}
              </p>
            </div>
            <button type="button" className="btn" onClick={() => setLoadModalOpen(true)}>
              {t('workflow.loadSavedPlan')}
            </button>
          </div>

          <table className="cat-table">
            <thead>
              <tr><th>{t('workflow.item')}</th><th>{t('workflow.sizeMm')}</th><th>{t('workflow.qty')}</th><th>{t('workflow.name')}</th><th aria-label={t('common.remove')} /></tr>
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
            <Plus /> {t('workflow.addPart')}
          </button>

          {/* Kerf gets the same standalone bordered field as the board page,
              rather than a borderless row inside the sheet table — the same
              input on two sibling pages should not look like two controls. */}
          <div
            className="flex items-end gap-4"
            style={{ marginTop: '26px', paddingTop: '22px', borderTop: '1px solid var(--rule-hair)', flexWrap: 'wrap' }}
          >
            <div style={{ flex: 'none' }}>
              <label className="form-label" htmlFor="sheet-kerf">{t('workflow.sawBlade')}</label>
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
              {inputErrors.kerfWidth || t('auditUi.sheetKerfHint')}
            </p>
          </div>

          <section style={{ marginTop: '30px', paddingTop: '22px', borderTop: '1px solid var(--rule-hair)' }}>
            <div className="section-rule">
              <h2 className="section-title">{t('workflow.sheetSource')}</h2>
              <span className="folio">{t('workflow.sheetSourceHint')}</span>
            </div>
            <table className="cat-table">
              <tbody>
                <tr>
                    <td style={{ textAlign: 'left' }}>{t('workflow.width')}</td>
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      min="10"
                      value={sheetWidth}
                      onChange={(e) => setSheetField(setSheetWidth)(e.target.value)}
                      className={`cell-input ${inputErrors.sheetWidth ? 'is-error' : ''}`}
                      required
                  aria-label={t('ui.sheetWidthAria')}
                    />
                  </td>
                  <td style={{ width: '40px', color: 'var(--ink-3)' }}>mm</td>
                </tr>
                <tr>
                    <td style={{ textAlign: 'left' }}>{t('workflow.height')}</td>
                  <td>
                    <input
                      type="number"
                      step="0.1"
                      min="10"
                      value={sheetHeight}
                      onChange={(e) => setSheetField(setSheetHeight)(e.target.value)}
                      className={`cell-input ${inputErrors.sheetHeight ? 'is-error' : ''}`}
                      required
                  aria-label={t('ui.sheetHeightAria')}
                    />
                  </td>
                  <td style={{ color: 'var(--ink-3)' }}>mm</td>
                </tr>
                <tr>
                    <td style={{ textAlign: 'left' }}>{t('workflow.thickness')}</td>
                  <td>
                    <input id="sheet-thickness" type="number" min="0.1" step="0.1" value={sheetThickness} onChange={(e) => setSheetField(setSheetThickness)(e.target.value)} className={`cell-input ${inputErrors.sheetThickness ? 'is-error' : ''}`} required aria-describedby="sheet-stock-error" />
                  </td>
                  <td style={{ color: 'var(--ink-3)' }}>mm</td>
                </tr>
                <tr>
                    <td style={{ textAlign: 'left' }}>{t('workflow.material')}</td>
                  {/* Kept in the value column rather than spanning into the unit
                      column, so the control lines up with the numbers above it */}
                  <td>
                    <select
                      value={materialType}
                      onChange={(e) => setSheetField(setMaterialType)(e.target.value)}
                      className={`form-select ${inputErrors.material ? 'is-error' : ''}`}
                  aria-label={t('ui.materialType')}
                    >
                      <option value="plywood">{t('ui.materialPlywood')}</option>
                      <option value="mdf">{t('ui.materialMdf')}</option>
                      <option value="metal">{t('ui.materialMetal')}</option>
                      <option value="acrylic">{t('ui.materialAcrylic')}</option>
                      <option value="cardboard">{t('ui.materialCardboard')}</option>
                      <option value="custom">{t('ui.materialCustom')}</option>
                    </select>
                    {materialType === 'custom' && <input id="custom-sheet-material" className="form-input" style={{ marginTop: '8px' }} value={customMaterial} onChange={(e) => setSheetField(setCustomMaterial)(e.target.value)} placeholder={t('ui.customMaterialPlaceholder')} required />}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
            {/* Kerf reports next to its own field now, so this line carries only
                the sheet's own errors. */}
            <p
              id="sheet-stock-error"
              className={sheetError ? 'text-danger text-[12.5px] font-semibold' : 'synthetic'}
              style={{ marginTop: '10px' }}
            >
               {sheetError
                 || t('auditUi.sheetStockHint')}
            </p>
          </section>

          <div style={{ marginTop: '26px' }}>
            <Disclosure
              title={t('ui.packingStrategy')}
              hint={`${algorithm ? algorithm.replace(/_/g, ' ') : t('ui.autoSelected')} · 90° rotation ${allowRotation ? t('ui.rotationAllowed') : t('ui.rotationOff')}`}
              open={strategyOpen}
              onToggle={() => setStrategyOpen(v => !v)}
            >
              <label className="form-label" htmlFor="sheet-algorithm">{t('ui.algorithm')}</label>
              <select
                id="sheet-algorithm"
                value={algorithm}
                onChange={(e) => setSheetField(setAlgorithm)(e.target.value)}
                className="form-select"
              >
                <option value="">{t('ui.autoSelect')}</option>
                <option value="bottom_left_fill">{t('ui.bottomLeft')}</option>
                <option value="best_fit_2d">{t('ui.bestFit')}</option>
                <option value="genetic_2d">{t('ui.genetic')}</option>
                <option value="guillotine_cut">{t('ui.guillotine')}</option>
              </select>
              <label className="flex items-start gap-3" style={{ marginTop: '14px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={allowRotation}
                  onChange={(e) => setSheetField(setAllowRotation)(e.target.checked)}
                  style={{ marginTop: '3px' }}
                />
                <span>
                   <b style={{ fontSize: '13.5px' }}>{t('ui.allowRotation')}</b>
                  <span className="block synthetic">
                    Turns parts to fit tighter. Switch it off when the grain or the
                    face pattern has to run one way.
                  </span>
                </span>
              </label>
            </Disclosure>

            <Disclosure
              title={t('ui.whatPageReturns')}
              hint={t('ui.sheetsHint')}
              open={limitsOpen}
              onToggle={() => setLimitsOpen(v => !v)}
            >
              <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                <table className="cat-table is-reference">
                  <tbody>
                    <tr><td>{t('ui.sheet')}</td><td>{t('help.fewestSheets')}</td></tr>
                    <tr><td>{t('workflow.layout')}</td><td>{t('help.sheetPlacement')}</td></tr>
                    <tr><td>{t('ui.turned')}</td><td>{t('help.turnedParts')}</td></tr>
                    <tr><td>{t('ui.waste')}</td><td>{t('help.sheetWaste')}</td></tr>
                  </tbody>
                </table>
                <table className="cat-table is-reference">
                  <tbody>
                    <tr><td>{t('workflow.width')} / {t('workflow.height')}</td><td>≤ 5 000 mm</td></tr>
                    <tr><td>{t('workflow.sheetSource')}</td><td>≤ 10 000 mm</td></tr>
                    <tr><td>{t('workflow.qty')} {t('workflow.parts')}</td><td>≤ 1 000</td></tr>
                    <tr><td>{t('legacy.kerf')}</td><td>0–50 mm (2–4)</td></tr>
                  </tbody>
                </table>
              </div>
            </Disclosure>
          </div>

          <div className="step-foot">
            <p className="synthetic step-foot-note">
              {hasErrors
                 ? t('ui.fixLines', { kind: t('workflow.layout') })
                : `${partCount} parts onto ${mm(parseFloat(sheetWidth))} × ${mm(parseFloat(sheetHeight))} mm stock`}
            </p>
            <div className="step-foot-act">
              <button type="submit" className="btn-order" disabled={loading || hasErrors}>
                {loading ? <><Loader /> {t('workflow.packing')}</> : <>{t('workflow.packSheets')} <ArrowRight size={15} /></>}
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
              <h1 className="step-h1">{t('workflow.yourSheetLayout')}</h1>
              <p className="step-lede">
                {t('workflow.sheetLayoutIntro')}
              </p>
            </div>
          </div>

          <div className="plan-answer">
            <div className="plan-answer-fig">
              <b>{result.total_sheets}</b>
              <span className="answer-kicker">
                 {t('workflow.sheetsSummary', { count: result.total_sheets, efficiency: result.overall_efficiency.toFixed(1) })}
              </span>
            </div>
            <dl className="plan-facts">
              <div className="plan-fact">
                 <dt>{t('ui.materialUsed')}</dt><dd>{result.overall_efficiency.toFixed(1)} %</dd>
              </div>
              <div className="plan-fact">
                 <dt>{t('ui.waste')}</dt>
                <dd>
                  {result.total_waste_area >= 1000000
                    ? `${(result.total_waste_area / 1000000).toFixed(2)} m²`
                    : `${mm(result.total_waste_area)} mm²`}
                </dd>
              </div>
              <div className="plan-fact">
                 <dt>{t('ui.strategy')}</dt><dd>{result.algorithm_used.replace(/_/g, ' ')}</dd>
              </div>
            </dl>
          </div>

          <SheetResultDisplay result={result} projectName={projectName} />

          <div className="step-foot">
            <button type="button" className="btn" onClick={() => setStep(STEP_PARTS)}>
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
      {step === STEP_SAVE && result && (
        <form className="step-view is-form" onSubmit={handleSave}>
          <div className="step-head" style={{ marginBottom: '22px' }}>
            <div>
              <h1 className="step-h1">{saved ? t('workflow.planSaved') : t('workflow.saveThisPlan')}</h1>
              <p className="step-lede">
                {saved
                   ? t('ui.keptPlan')
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
              </div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '24px' }}>
                 <label className="form-label" htmlFor="sheet-save-mode">{t('ui.saveAs')}</label>
                <select
                  id="sheet-save-mode"
                  className="form-select"
                  value={saveMode}
                  onChange={(e) => {
                    const mode = e.target.value;
                    setSaveMode(mode);
                    if (mode === 'update' && !editingProject && userProjects.length) {
                      setEditingProject(userProjects[0]);
                      setProjectName(userProjects[0].name);
                      setSelectedGroupId(userProjects[0].project_group_id || '');
                    }
                  }}
                >
                   <option value="new">{t('ui.createNewPlan')}</option>
                   <option value="update" disabled={!userProjects.length}>{t('ui.updateExistingPlan')}</option>
                </select>
                {saveMode === 'update' && editingProject && (
                  <select
                    className="form-select"
                    style={{ marginTop: '10px' }}
                     aria-label={t('ui.planToUpdate')}
                    value={editingProject.id}
                    onChange={(e) => {
                      const target = userProjects.find(p => p.id === e.target.value);
                      setEditingProject(target);
                      setProjectName(target.name);
                      setSelectedGroupId(target.project_group_id || '');
                    }}
                  >
                    {userProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </div>
              <div style={{ marginBottom: '24px' }}>
                <ProjectPicker
                  groups={projectGroups}
                  value={selectedGroupId}
                  onChange={setSelectedGroupId}
                  onCreate={createGroup}
                />
              </div>

              <div>
                <label className="form-label" htmlFor="plan-name">{t('workflow.planName')}</label>
                <input
                  id="plan-name"
                  type="text"
                  className={`form-input ${nameError ? 'form-input-error' : ''}`}
                   placeholder={t('ui.planNamePlaceholder')}
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
                   {nameError || t('ui.savedNameHint')}
                </p>
              </div>
            </>
          )}

          <div className="step-foot">
            <button type="button" className="btn" onClick={() => setStep(STEP_PLAN)}>
               <ArrowLeft /> {t('workflow.backToLayout')}
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
                    {saving ? <><Loader /> {t('workflow.saving')}</> : saveMode === 'update' ? t('workflow.updatePlan') : t('workflow.savePlan')}
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
                    {userProjects.map(project => (
                      <tr key={project.id}>
                        <td style={{ textAlign: 'left', color: 'var(--ink)', fontSize: '13px' }}>{project.name}</td>
                        <td>{project.parts_data.reduce((sum, p) => sum + (p.quantity || 0), 0)}</td>
                        <td style={{ width: '90px' }}>
                          <button className="btn" style={{ padding: '5px 10px', minHeight: 0 }} onClick={() => loadProject(project)}>
                             {t('ui.load')}
                          </button>
                        </td>
                      </tr>
                    ))}
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

export default SheetOptimizer;
