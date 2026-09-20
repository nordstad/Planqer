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
import { useTranslation } from 'react-i18next';
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
import BondPatternIcon from './BondPatternIcon';
import TileLayoutCandidateCard from './TileLayoutCandidateCard';
import TileResultDisplay from './TileResultDisplay';
import { ArrowLeft, ArrowRight, Plus, Tick } from './icons';
import { smallestCutMm } from '../utils/tileCutList';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

const STEP_SURFACE = 0;
const STEP_LAYOUT = 1;
const STEP_KEEP = 2;

const numberError = (value, { min, max, label, allowZero = false, t }) => {
  const n = parseFloat(value);
  if (value === '' || isNaN(n)) return t('tileUi.numberRequired', { label });
  if (allowZero ? n < min : n <= min) return t('tileUi.greaterThan', { label, min });
  if (n > max) return t('tileUi.cannotExceed', { label, max });
  return '';
};

const validateCutouts = (cutouts, surfaceWidth, surfaceHeight, t) => cutouts.map((cutout) => {
  const errors = {};
  const x = parseFloat(cutout.x);
  const y = parseFloat(cutout.y);
  const width = parseFloat(cutout.width);
  const height = parseFloat(cutout.height);
  const sw = parseFloat(surfaceWidth);
  const sh = parseFloat(surfaceHeight);

  if (cutout.x === '' || isNaN(x) || x < 0) errors.x = t('tileUi.xMinimum');
  if (cutout.y === '' || isNaN(y) || y < 0) errors.y = t('tileUi.yMinimum');
  if (!cutout.width || isNaN(width) || width <= 0) errors.width = t('tileUi.positiveWidth');
  if (!cutout.height || isNaN(height) || height <= 0) errors.height = t('tileUi.positiveHeight');

  if (!errors.x && !errors.width && !isNaN(sw) && x + width > sw) errors.width = t('tileUi.rightEdge');
  if (!errors.y && !errors.height && !isNaN(sh) && y + height > sh) errors.height = t('tileUi.topEdge');

  return Object.keys(errors).length > 0 ? errors : null;
});

const TileOptimizer = () => {
  const { t } = useTranslation();
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
  const [editingProject, setEditingProject] = useState(null);
  const [saveMode, setSaveMode] = useState('new');

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
       cutouts: validateCutouts(debounced.cutouts, debounced.surfaceWidth, debounced.surfaceHeight, t),
       surfaceWidth: numberError(debounced.surfaceWidth, { min: 100, max: 20000, label: t('tileUi.surfaceWidth'), t }),
       surfaceHeight: numberError(debounced.surfaceHeight, { min: 100, max: 20000, label: t('tileUi.surfaceHeight'), t }),
       tileWidth: numberError(debounced.tileWidth, { min: 10, max: 3000, label: t('tileUi.tileWidth'), t }),
       tileHeight: numberError(debounced.tileHeight, { min: 10, max: 3000, label: t('tileUi.tileHeight'), t }),
       jointWidth: numberError(debounced.jointWidth, { min: 0, max: 50, label: t('tileUi.jointWidth'), allowZero: true, t }),
       perimeterGap: numberError(debounced.perimeterGap, { min: 0, max: 200, label: t('tileUi.perimeterGap'), allowZero: true, t }),
      minEdgeCut: debounced.minEdgeCut === ''
        ? ''
         : numberError(debounced.minEdgeCut, { min: 0, max: 3000, label: t('tileUi.sliverThreshold'), allowZero: true, t }),
       wastePercent: numberError(debounced.wastePercent, { min: 0, max: 100, label: t('tileUi.breakageAllowance'), allowZero: true, t }),
      candidateCount: (() => {
        const n = parseInt(debounced.candidateCount, 10);
         if (!debounced.candidateCount || isNaN(n) || n < 1) return t('tileUi.greaterThan', { label: t('tileUi.candidateCount'), min: 0 });
         if (n > 20) return t('tileUi.cannotExceed', { label: t('tileUi.candidateCount'), max: 20 });
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
    setEditingProject(project);
    setSaveMode('update');
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
    ? `${t('tileUi.running')} ${Math.round(parseFloat(offsetFraction) * 100)}%`
    : {
        stack: t('tileUi.stack'), herringbone: t('tileUi.herringbone'), diagonal: t('tileUi.diagonal'),
        diagonal_herringbone: t('tileUi.diagonalHerringbone'), double_herringbone: t('tileUi.doubleHerringbone'),
        diagonal_double_herringbone: t('tileUi.diagonalDoubleHerringbone'),
      }[bondPattern] || t('tileUi.stack');

  const surfaceSummary = `${mm(parseFloat(surfaceWidth))} × ${mm(parseFloat(surfaceHeight))} mm`
    + ` · ${mm(parseFloat(tileWidth))} × ${mm(parseFloat(tileHeight))} tile`
    + ` · ${mm(parseFloat(jointWidth))} mm ${t('tileUi.joint').toLowerCase()}`
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
      setApiError(error.message || t('auditUi.unknownError'));
    }
    setLoading(false);
  };

  /* ── keeping a layout ──────────────────────────────────────────────────── */
  const nameError = saveAttempted && !projectName.trim()
    ? t('workflow.nameAndKeep')
    : '';

  const createGroup = async (name) => {
    try {
      const group = await createProjectGroup(name);
      setProjectGroups(prev => [group, ...prev]);
      setSelectedGroupId(group.id);
      setApiError('');
      return true;
    } catch (err) {
      setApiError(`${t('legacy.failed')}: ${err.message}`);
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
        id: saveMode === 'update' ? editingProject?.id : undefined,
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
      setUserProjects(prev => saveMode === 'update'
        ? prev.map(p => p.id === project.id ? project : p)
        : [project, ...prev]);
    } catch (error) {
      setApiError(error.message || t('auditUi.saveFailed'));
    }
    setSaving(false);
  };

  const savedGroupName = saved
    ? projectGroups.find(g => g.id === saved.project_group_id)?.name
    : null;

  /* ── the rail ──────────────────────────────────────────────────────────── */
  const steps = [
    {
      label: t('workflow.surface'),
      reachable: true,
      summary: hasErrors ? t('workflow.someFieldsNeedFixing') : surfaceSummary,
    },
    {
      label: t('workflow.layout'),
      reachable: !!result,
      summary: result
         ? t('ui.tileSummary', {
             count: selected.tiles_to_purchase_with_waste,
             cut: smallestCutMm(selected) === null ? t('ui.noneCut') : `${mm(smallestCutMm(selected))} mm`,
             offcuts: selected.reused_offcut_count,
           })
        : '',
      locked: t('workflow.solvesFromSurface'),
    },
    {
      label: t('workflow.keep'),
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

      {/* ── 01 · what you're covering ─────────────────────────────────────── */}
      {step === STEP_SURFACE && (
        <form className="step-view is-form" onSubmit={handleLayoutSubmit}>
          <div className="step-head">
            <div>
              <h1 className="step-h1">{t('workflow.surfaceTitle')}</h1>
              <p className="step-lede">
                {t('workflow.surfaceIntro')}
              </p>
            </div>
            <button type="button" className="btn" onClick={() => setLoadModalOpen(true)}>
              {t('workflow.loadSavedPlan')}
            </button>
          </div>

          <section>
            <div className="section-rule">
              <h2 className="section-title">{t('workflow.surface')}</h2>
              <span className="folio">{t('workflow.surfaceHint')}</span>
            </div>
            <table className="cat-table" style={{ marginTop: '14px' }}>
              <tbody>
                <tr>
                    <td style={{ textAlign: 'left' }}>{t('workflow.width')}</td>
                  <td>
                    <input
                      type="number" step="0.1" min="100"
                      value={surfaceWidth}
                      onChange={(e) => setField(setSurfaceWidth)(e.target.value)}
                      className={`cell-input ${inputErrors.surfaceWidth ? 'is-error' : ''}`}
                      required
                       aria-label={`${t('tileUi.surfaceWidth')} in millimetres`}
                    />
                  </td>
                  <td style={{ width: '40px', color: 'var(--ink-3)' }}>mm</td>
                </tr>
                <tr>
                    <td style={{ textAlign: 'left' }}>{t('workflow.height')}</td>
                  <td>
                    <input
                      type="number" step="0.1" min="100"
                      value={surfaceHeight}
                      onChange={(e) => setField(setSurfaceHeight)(e.target.value)}
                      className={`cell-input ${inputErrors.surfaceHeight ? 'is-error' : ''}`}
                      required
                       aria-label={`${t('tileUi.surfaceHeight')} in millimetres`}
                    />
                  </td>
                  <td style={{ color: 'var(--ink-3)' }}>mm</td>
                </tr>
              </tbody>
            </table>
            <p className={inputErrors.surfaceWidth || inputErrors.surfaceHeight ? 'text-danger text-[12.5px] font-semibold' : 'synthetic'} style={{ marginTop: '10px' }}>
               {inputErrors.surfaceWidth || inputErrors.surfaceHeight || t('tileUi.measureSurface')}
            </p>
          </section>

          <section style={{ marginTop: '30px', paddingTop: '22px', borderTop: '1px solid var(--rule-hair)' }}>
            <div className="section-rule">
              <h2 className="section-title">{t('workflow.openings')}</h2>
              <span className="folio">{t('workflow.openingsHint')}</span>
            </div>
            {cutouts.length > 0 && (
              <table className="cat-table" style={{ marginTop: '14px' }}>
                <thead>
                  <tr><th>{t('workflow.item')}</th><th>{t('workflow.positionMm')}</th><th>{t('workflow.sizeMm')}</th><th>{t('workflow.label')}</th><th aria-label={t('common.remove')} /></tr>
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
              <Plus /> {t('workflow.addOpening')}
            </button>
            {cutouts.length === 0 && (
                <p className="synthetic" style={{ marginTop: '10px' }}>{t('workflow.noOpenings')}</p>
            )}
          </section>

          <section style={{ marginTop: '30px', paddingTop: '22px', borderTop: '1px solid var(--rule-hair)' }}>
            <div className="section-rule">
              <h2 className="section-title">{t('workflow.tile')}</h2>
               <span className="folio">{t('workflow.tileHintCorrect')}</span>
            </div>
            <table className="cat-table" style={{ marginTop: '14px' }}>
              <tbody>
                <tr>
                    <td style={{ textAlign: 'left' }}>{t('workflow.width')}</td>
                  <td>
                    <input
                      type="number" step="0.1" min="10"
                      value={tileWidth}
                      onChange={(e) => setField(setTileWidth)(e.target.value)}
                      className={`cell-input ${inputErrors.tileWidth ? 'is-error' : ''}`}
                      required
                       aria-label={`${t('tileUi.tileWidth')} in millimetres`}
                    />
                  </td>
                  <td style={{ width: '40px', color: 'var(--ink-3)' }}>mm</td>
                </tr>
                <tr>
                    <td style={{ textAlign: 'left' }}>{t('workflow.height')}</td>
                  <td>
                    <input
                      type="number" step="0.1" min="10"
                      value={tileHeight}
                      onChange={(e) => setField(setTileHeight)(e.target.value)}
                      className={`cell-input ${inputErrors.tileHeight ? 'is-error' : ''}`}
                      required
                       aria-label={`${t('tileUi.tileHeight')} in millimetres`}
                    />
                  </td>
                  <td style={{ color: 'var(--ink-3)' }}>mm</td>
                </tr>
              </tbody>
            </table>
            <p className={inputErrors.tileWidth || inputErrors.tileHeight ? 'text-danger text-[12.5px] font-semibold' : 'synthetic'} style={{ marginTop: '10px' }}>
               {inputErrors.tileWidth || inputErrors.tileHeight || t('tileUi.tileRange')}
            </p>
            <label className="flex items-start gap-3" style={{ marginTop: '14px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allowRotation}
                onChange={(e) => setField(setAllowRotation)(e.target.checked)}
                style={{ marginTop: '3px' }}
              />
              <span>
                <b style={{ fontSize: '13.5px' }}>{t('workflow.allowRotation')}</b>
                <span className="block synthetic">
                  {t('workflow.rotationHintCorrect')}
                </span>
              </span>
            </label>
          </section>

          <section style={{ marginTop: '30px', paddingTop: '22px', borderTop: '1px solid var(--rule-hair)' }}>
            <div className="section-rule">
              <h2 className="section-title">{t('workflow.jointBond')}</h2>
              <span className="folio">{t('tileUi.jointBondHint')}</span>
            </div>
            <div className="flex items-end gap-4" style={{ marginTop: '14px', flexWrap: 'wrap' }}>
              <div style={{ flex: 'none' }}>
                <label className="form-label" htmlFor="tile-joint">{t('tileUi.joint')}</label>
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
                 <label className="form-label" htmlFor="tile-perimeter">{t('tileUi.perimeterGap')}</label>
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
              <div className="tile-bond-control" style={{ flex: 'none' }}>
                <div className="flex items-center gap-2">
                  <span className="bond-preview" style={{ color: 'var(--accent)' }}>
                    <BondPatternIcon pattern={bondPattern} size={44} />
                  </span>
                  <select
                    id="tile-bond"
                    aria-label={t('tileUi.bondPattern')}
                    value={bondPattern}
                    onChange={(e) => setField(setBondPattern)(e.target.value)}
                    className="form-select"
                    style={{ width: '280px' }}
                  >
                    {/* Straight-grid family first (no weave), then the
                        herringbone family from simplest to most compound —
                        "diagonal" sits with stack/running because it's the
                        same plain grid, just rotated, not a weave. */}
                    <option value="stack">{t('tileUi.stack')}</option><option value="running">{t('tileUi.running')}</option>
                    <option value="diagonal">{t('tileUi.diagonal')}</option><option value="herringbone">{t('tileUi.herringbone')}</option>
                    <option value="diagonal_herringbone">{t('tileUi.diagonalHerringbone')}</option><option value="double_herringbone">{t('tileUi.doubleHerringbone')}</option>
                    <option value="diagonal_double_herringbone">{t('tileUi.diagonalDoubleHerringbone')}</option>
                  </select>
                </div>
              </div>
              {bondPattern === 'running' && (
                <div style={{ flex: 'none' }}>
                  <label className="form-label" htmlFor="tile-offset">{t('workflow.rowOffset')}</label>
                  <div className="flex items-center gap-2">
                    <input
                      id="tile-offset" type="number" step="1" min="1" max="99"
                      value={Math.round(parseFloat(offsetFraction) * 100) || ''}
                      onChange={(e) => setField(setOffsetFraction)((parseFloat(e.target.value) / 100).toString())}
                      className="form-input"
                      style={{ width: '78px' }}
                    />
                     <span style={{ fontSize: '13.5px', color: 'var(--ink-3)', fontWeight: 600 }}>{t('tileUi.rowOffsetUnit')}</span>
                  </div>
                </div>
              )}
            </div>
            <p className={inputErrors.jointWidth || inputErrors.perimeterGap ? 'text-danger text-[12.5px] font-semibold' : 'synthetic'} style={{ marginTop: '10px' }}>
              {inputErrors.jointWidth || inputErrors.perimeterGap
                || {
                   herringbone: t('tileUi.herringboneHint'), diagonal: t('tileUi.diagonalHint'), diagonal_herringbone: t('tileUi.diagonalHerringboneHint'),
                   double_herringbone: t('tileUi.doubleHerringboneHint'), diagonal_double_herringbone: t('tileUi.diagonalDoubleHerringboneHint'),
                 }[bondPattern] || t('tileUi.defaultBondHint')}
            </p>
          </section>


          <div style={{ marginTop: '26px' }}>
            <Disclosure
              title={t('workflow.sliverGuardBreakage')}
               hint={t('tileUi.sliverSummary', { value: minEdgeCut ? `${mm(parseFloat(minEdgeCut))} mm` : t('tileUi.off'), waste: wastePercent, count: candidateCount })}
              open={guardOpen}
              onToggle={() => setGuardOpen(v => !v)}
            >
              <label className="form-label" htmlFor="tile-min-edge">{t('workflow.sliverThreshold')}</label>
              <div className="flex items-center gap-2">
                <input
                  id="tile-min-edge" type="number" step="1" min="0"
                   placeholder={t('tileUi.off')}
                  value={minEdgeCut}
                  onChange={(e) => setField(setMinEdgeCut)(e.target.value)}
                  className={`form-input ${inputErrors.minEdgeCut ? 'form-input-error' : ''}`}
                  style={{ width: '110px' }}
                />
                 <span style={{ fontSize: '13.5px', color: 'var(--ink-3)', fontWeight: 600 }}>{t('tileUi.thresholdUnit')}</span>
              </div>
              <p className="synthetic" style={{ marginTop: '10px' }}>
                 {t('tileUi.ruleOfThumb')}
              </p>

               <label className="form-label" style={{ marginTop: '18px' }} htmlFor="tile-waste">{t('tileUi.breakageAllowance')}</label>
              <div className="flex items-center gap-2">
                <input
                  id="tile-waste" type="number" step="1" min="0" max="100"
                  value={wastePercent}
                  onChange={(e) => setField(setWastePercent)(e.target.value)}
                  className={`form-input ${inputErrors.wastePercent ? 'form-input-error' : ''}`}
                  style={{ width: '110px' }}
                />
                 <span style={{ fontSize: '13.5px', color: 'var(--ink-3)', fontWeight: 600 }}>{t('tileUi.extraTiles')}</span>
              </div>

               <label className="form-label" style={{ marginTop: '18px' }} htmlFor="tile-candidates">{t('tileUi.candidateCount')}</label>
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
                  <b style={{ fontSize: '13.5px' }}>{t('workflow.reuseOffcuts')}</b>
                  <span className="block synthetic">
                     {t('tileUi.reuseHint')}
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
               {hasErrors ? t('tileUi.fixFields') : surfaceSummary}
            </p>
            <div className="step-foot-act">
              <button type="submit" className="btn-order" disabled={loading || hasErrors}>
                {loading ? <><Loader /> {t('workflow.solving')}</> : <>{t('workflow.solveLayout')} <ArrowRight size={15} /></>}
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
               <h1 className="step-h1">{t('tileUi.pickLayout')}</h1>
               <p className="step-lede">{t('tileUi.pickLayoutIntro')}</p>
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
               <span className="answer-kicker">{t('workflow.tilesToBuy')}</span>
            </div>
            <dl className="plan-facts">
              <div className="plan-fact">
                 <dt>{t('workflow.fullTiles')}</dt><dd>{selected.full_tile_count}</dd>
              </div>
              <div className="plan-fact">
                 <dt>{t('workflow.cutTiles')}</dt><dd>{selected.cut_tile_count}</dd>
              </div>
              <div className="plan-fact">
                 <dt>{t('workflow.used')}</dt><dd>{(selected.efficiency * 100).toFixed(1)}%</dd>
              </div>
            </dl>
          </div>

          <TileResultDisplay candidate={selected} projectName={projectName} />

          <div className="step-foot">
            <button type="button" className="btn" onClick={() => setStep(STEP_SURFACE)}>
               <ArrowLeft /> {t('workflow.changeSurface')}
            </button>
            <div className="step-foot-act">
              <button type="button" className="btn-order" onClick={() => setStep(STEP_KEEP)}>
                 {t('workflow.nameIt')} <ArrowRight size={15} />
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
                <h1 className="step-h1">{saved ? t('ui.layoutSaved') : t('ui.saveLayout')}</h1>
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
                   <b>{t('workflow.savedAs', { name: saved.name })}</b>
                <p>
                    {savedGroupName
                    ? <>{t('ui.filedUnder', { group: savedGroupName })}</>
                      : <>{t('ui.unfiled')}</>}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '24px' }}>
                  <label className="form-label" htmlFor="tile-save-mode">{t('ui.saveAs')}</label>
                <select
                  id="tile-save-mode"
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
                  <label className="form-label" htmlFor="tile-plan-name">{t('ui.planNamePlaceholder')}</label>
                <input
                  id="tile-plan-name"
                  type="text"
                  className={`form-input ${nameError ? 'form-input-error' : ''}`}
                   placeholder={t('tileUi.planPlaceholder')}
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
                    {nameError || t('ui.savedNameHint')}
                </p>
              </div>
            </>
          )}

          <div className="step-foot">
            <button type="button" className="btn" onClick={() => setStep(STEP_LAYOUT)}>
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
      {loadModalOpen && (
         <div className="cat-overlay" role="dialog" aria-modal="true" aria-label={t('workflow.loadSavedPlan')}>
          <div className="cat-sheet">
            <div className="masthead" style={{ marginTop: 0 }}>
               <span className="masthead-brand" style={{ fontSize: '13px' }}>{t('tileUi.savedPlans')}</span>
              <span className="masthead-section" />
              <button type="button" className="masthead-flash" onClick={() => setLoadModalOpen(false)}>
                 {t('ui.close')}
              </button>
            </div>
            <div style={{ padding: '14px 16px 18px' }}>
              {userProjects.length === 0 ? (
                <p style={{ color: 'var(--ink-3)', fontSize: '13px' }}>
                   {t('tileUi.nothingSaved')}
                </p>
              ) : (
                 <table className="cat-table">
                   <thead><tr><th>{t('tileUi.name')}</th><th>{t('tileUi.surface')}</th><th aria-label={t('tileUi.actions')} /></tr></thead>
                  <tbody>
                    {userProjects.map(project => (
                      <tr key={project.id}>
                        <td style={{ textAlign: 'left', color: 'var(--ink)', fontSize: '13px' }}>{project.name}</td>
                        <td>{mm(project.surface_data.width)} × {mm(project.surface_data.height)} mm</td>
                        <td style={{ width: '90px' }}>
                          <button className="btn" style={{ padding: '5px 10px', minHeight: 0 }} onClick={() => loadProject(project)}>
                             {t('tileUi.load')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="synthetic" style={{ marginTop: '12px' }}>
                 {t('tileUi.renameDelete')}
              </p>
            </div>
          </div>
        </div>
      )}
    </CatalogPage>
  );
};

export default TileOptimizer;
