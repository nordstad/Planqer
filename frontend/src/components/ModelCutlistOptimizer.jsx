/*
  One model in, several cutlists out — replacing the two near-identical pages
  this used to be (STL upload, STEP upload). The two file formats differ only
  in what metadata comes back with the geometry; everything after the upload
  — grouping into cutlists, planning them, saving them — was duplicated for no
  reason two files couldn't share.

  Units are gone from the form entirely: Planqer is millimetres throughout
  (see PRODUCT.md), so a unit picker on this one page was the one place asking
  a question the rest of the product already answers.

  Three steps, matching the board and sheet pages' own rail:
    01 Model     — upload, and Planqer measures every part in it
    02 Cutlists  — the distinct sizes found, grouped, pick which to keep
    03 Save      — each cutlist's stock, kerf and optional prices, planned and
                   saved together

  The reason there is a step 2 at all: one model is rarely one cutlist. A
  bench is boards of three different cross-sections and a plywood top — three
  things to plan, not one. Step 2 is where that's visible before committing to
  planning any of them, and a single group can also jump straight to the board
  or sheet page instead of joining the batch, for the one-cutlist case that
  doesn't need a project at all.
*/

import { Fragment, useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import Loader from './Loader';
import Disclosure from './Disclosure';
import ProjectPicker from './ProjectPicker';
import PlanSteps from './PlanSteps';
import ModelGroupSettings from './ModelGroupSettings';
import ProductPicker from './ProductPicker';
import AuthModal from './auth/AuthModal';
import { useAuth } from '../contexts/AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import { ArrowLeft, ArrowRight, Tick, Strike, CubeIcon } from './icons';
import {
  process3DCutlist, processStepCutlist,
  optimizeCutting, saveProject,
  optimizeSheetCutting, saveSheetProject,
  getProjectGroups, createProjectGroup,
  getUserSettings,
} from '../utils/api';
import {
  groupBoards, groupSheets, groupLabel, planNameFor, resolveMaterial,
  groupDimensions, groupMemoryKey,
  initialConfig, boardCostPayloads, sheetPricingPayload,
  applySettingsToAll, validateGroupConfig, standaloneHandoff,
} from '../utils/modelGroups';
import { loadCatalogue, buildSnapshot } from '../utils/catalogue';

const STEP_MODEL = 0;
const STEP_CUTLISTS = 1;
const STEP_SAVE = 2;

const DEFAULT_MONEY = { currency: 'SEK', vatRate: 25, pricesIncludeVat: true };

const formatFileSize = (bytes) => {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const extensionOf = (filename) => filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || '';
const ACCEPTED = ['.stl', '.step', '.stp'];

const spaced = (n) => Math.round(n).toLocaleString('sv-SE');

const ModelCutlistOptimizer = () => {
  const { t, i18n } = useTranslation();
  const { user, isAuthenticated } = useAuth();

  const [step, setStep] = useState(STEP_MODEL);

  /* ── 01 · the model ─────────────────────────────────────────────────── */
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState(null);

  /* ── 02 · the cutlists found in it ─────────────────────────────────── */
  const [groups, setGroups] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedIds, setExpandedIds] = useState(new Set());
  // id -> that cutlist's own name, material, stock, kerf and prices
  const [configs, setConfigs] = useState({});
  const [defaults, setDefaults] = useState({});
  const [money, setMoney] = useState(DEFAULT_MONEY);

  const modelName = file ? file.name.replace(/\.[a-z0-9]+$/i, '') : t('workflow.model');
  const selectedGroups = groups.filter((g) => selectedIds.has(g.id));
  const labelOf = (group) => groupLabel(group, configs[group.id] || {}, t, i18n.language);
  const planNameOf = (group) => planNameFor(modelName, group, configs[group.id] || {}, t, i18n.language);

  /* ── 03 · save: the project and the batch itself ─────────────────────── */
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [projectGroups, setProjectGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [apiError, setApiError] = useState('');
  const [appliedNote, setAppliedNote] = useState('');
  const [statuses, setStatuses] = useState({}); // id -> 'pending' | 'running' | 'done' | 'error'
  const [statusMessages, setStatusMessages] = useState({});
  const [saving, setSaving] = useState(false);

  const debouncedConfigs = useDebounce(configs, 300);
  // Validation follows the debounced values so errors don't flash while typing; a
  // cutlist too new to be in them yet is checked as it stands.
  const errorsOf = (group, source) => validateGroupConfig(group, source[group.id] || configs[group.id], t);
  const stockHasErrors = selectedGroups.some((g) => errorsOf(g, debouncedConfigs).hasErrors);

  const allDone = selectedGroups.length > 0 && selectedGroups.every((g) => statuses[g.id] === 'done');
  const savedCount = selectedGroups.filter((g) => statuses[g.id] === 'done').length;

  // Loaded lazily, only once the save step is actually reached. The saved
  // user defaults seed each cutlist's stock, kerf and currency if the user is
  // signed in; cutlists already read keep what they were given.
  useEffect(() => {
    if (!user) return;

    if (step === STEP_SAVE) {
      getProjectGroups().then(setProjectGroups).catch(() => {});
    }

    getUserSettings().then((settings) => {
      const next = {};
      if (Array.isArray(settings?.default_board_lengths) && settings.default_board_lengths.length > 0) {
        next.boards = settings.default_board_lengths.map(String);
      }
      if (Number.isFinite(settings?.default_saw_blade_width) && settings.default_saw_blade_width > 0) {
        next.boardKerf = String(settings.default_saw_blade_width);
      }
      setDefaults(next);
      setMoney({
        currency: settings?.default_currency || DEFAULT_MONEY.currency,
        vatRate: Number.isFinite(settings?.default_vat_rate) ? settings.default_vat_rate : DEFAULT_MONEY.vatRate,
        pricesIncludeVat: typeof settings?.default_prices_include_vat === 'boolean'
          ? settings.default_prices_include_vat
          : DEFAULT_MONEY.pricesIncludeVat,
      });
    }).catch(() => {});
  }, [user, step]);

  /* ── the model ─────────────────────────────────────────────────────── */
  const retireAll = () => {
    setGroups([]);
    setSelectedIds(new Set());
    setExpandedIds(new Set());
    setConfigs({});
    setStatuses({});
    setStatusMessages({});
    setApiError('');
    setAppliedNote('');
  };

  const acceptFile = (candidate) => {
    if (!candidate) return;
    if (!ACCEPTED.includes(extensionOf(candidate.name))) {
       setError(t('ui.modelFileRequired'));
      return;
    }
    setFile(candidate);
    setError(null);
    retireAll();
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    acceptFile(e.dataTransfer.files?.[0]);
  }, []);

  const removeFile = () => {
    setFile(null);
    setError(null);
    retireAll();
  };

  const readModel = async () => {
    if (!file) {
       setError(t('ui.modelFileRequired'));
      return;
    }
    setReading(true);
    setError(null);
    try {
      const isStep = ['.step', '.stp'].includes(extensionOf(file.name));
      const data = isStep ? await processStepCutlist(file) : await process3DCutlist(file);
      const found = [...groupBoards(data.boards || []), ...groupSheets(data.sheets || [])];
      if (found.length === 0) {
         setError(t('ui.noModelComponents'));
        setReading(false);
        return;
      }
      // A catalogue that can't be loaded only costs the suggestions: every
      // cutlist still starts unspecified and can be planned without a product.
      const catalogue = await loadCatalogue().catch(() => null);
      setGroups(found);
      setConfigs(Object.fromEntries(found.map((g) => [g.id, initialConfig(g, defaults, catalogue)])));
      setSelectedIds(new Set(found.map((g) => g.id)));
      setExpandedIds(new Set());
      setStep(STEP_CUTLISTS);
    } catch (err) {
       setError(err.message || t('ui.modelReadFailed'));
    }
    setReading(false);
  };

  /* ── the cutlists step ─────────────────────────────────────────────── */
  const toggleIn = (setter) => (id) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleGroup = toggleIn(setSelectedIds);
  const toggleExpanded = toggleIn(setExpandedIds);

  const updateConfig = (id, patch) => {
    setConfigs((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    setAppliedNote('');
  };

  const applyToAll = (sourceId) => {
    const source = groups.find((g) => g.id === sourceId);
    setConfigs((prev) => applySettingsToAll(prev, groups, sourceId));
    setAppliedNote(t(source.kind === 'board' ? 'modelUi.appliedBoards' : 'modelUi.appliedSheets'));
  };

  const planGroupAlone = (group) => {
    const { key, path, data } = standaloneHandoff(group, configs[group.id], planNameOf(group), t('ui.sheet'));
    localStorage.setItem(key, JSON.stringify(data));
    window.location.href = path;
  };

  const totalComponents = groups.reduce((n, g) => n + g.quantity, 0);

  /* ── the save step ─────────────────────────────────────────────────── */
  const createGroup = async (name) => {
    try {
      const group = await createProjectGroup(name);
      setProjectGroups((prev) => [group, ...prev]);
      setSelectedGroupId(group.id);
      setApiError('');
      return true;
    } catch (err) {
       setApiError(`${t('legacy.failed')}: ${err.message}`);
      return false;
    }
  };

  const runOne = async (group) => {
    const config = configs[group.id];
    const material = resolveMaterial(config, i18n.language, group);
    const product = buildSnapshot(config.product, i18n.language, groupDimensions(group));
    setStatuses((prev) => ({ ...prev, [group.id]: 'running' }));
    try {
      if (group.kind === 'board') {
        const parts = group.lengths.map((l) => ({ length: String(l.length), quantity: String(l.qty) }));
        const stock = config.boards.map((row) => row.length);
        const { costData, saved } = boardCostPayloads(config, money);
        const result = await optimizeCutting(parts, stock, config.kerf, costData);
        await saveProject({
          name: planNameOf(group),
          projectGroupId: selectedGroupId,
          parts,
          boards: stock,
          sawKerf: config.kerf,
          materialType: material,
          product,
          boardThickness: group.thickness,
          boardWidth: group.width,
          boardCosts: saved,
          result,
        });
      } else {
        const parts = group.sizes.map((s, i) => ({
          width: String(s.width), height: String(s.length), quantity: String(s.qty),
           name: `${group.names[0] || t('ui.sheet')}_${i + 1}`, id: `sheet_${i + 1}`,
        }));
        const result = await optimizeSheetCutting(parts, config.sheetWidth, config.sheetHeight, config.kerf, material, undefined, config.allowRotation);
        await saveSheetProject({
          name: planNameOf(group),
          projectGroupId: selectedGroupId,
          parts,
          sheetWidth: config.sheetWidth,
          sheetHeight: config.sheetHeight,
          sheetThickness: group.thickness,
          kerfWidth: config.kerf,
          materialType: material,
          product,
          algorithm: '',
          allowRotation: config.allowRotation,
          result,
          pricing: sheetPricingPayload(config, money),
        });
      }
      setStatuses((prev) => ({ ...prev, [group.id]: 'done' }));
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [group.id]: 'error' }));
       setStatusMessages((prev) => ({ ...prev, [group.id]: err.message || t('legacy.failed') }));
    }
  };

  const planAndSaveAll = async () => {
    setApiError('');
    if (selectedGroups.some((g) => errorsOf(g, configs).hasErrors)) return;
    setSaving(true);
    // One at a time: /cutting-plans and /sheet-optimization are both rate
    // limited to 10 requests a minute, and this keeps the per-row status
    // readable instead of every row flipping to "running" at once.
    for (const group of selectedGroups) {
      if (statuses[group.id] === 'done') continue;
      await runOne(group);
    }
    setSaving(false);
  };

  const savedGroupName = allDone ? projectGroups.find((g) => g.id === selectedGroupId)?.name : null;
  const savedProjectPath = allDone && selectedGroupId ? `/dashboard/project/${selectedGroupId}` : '/dashboard';
  const boardGroupCount = selectedGroups.filter((g) => g.kind === 'board').length;
  const sheetGroupCount = selectedGroups.filter((g) => g.kind === 'sheet').length;

  /* ── the rail ──────────────────────────────────────────────────────── */
  const steps = [
    {
      label: t('workflow.model'),
      reachable: true,
        summary: file ? `${file.name} · ${formatFileSize(file.size)}` : t('ui.noFileYet'),
    },
    {
      label: t('workflow.cutlists'),
      reachable: groups.length > 0,
        summary: groups.length > 0 ? `${totalComponents} ${t('workflow.parts')} · ${t(groups.length === 1 ? 'modelUi.planCutlist' : 'modelUi.planCutlists', { count: groups.length })}` : '',
        locked: t('ui.readsFromModel'),
    },
    {
      label: t('workflow.save'),
      reachable: selectedGroups.length > 0,
        summary: allDone ? t('modelUi.savedCount', { saved: savedCount, total: selectedGroups.length }) : selectedGroups.length ? t('ui.planAndKeep') : '',
        locked: t('ui.waitsForCutlists'),
    },
  ];

  return (
    <CatalogPage>
      <PlanSteps steps={steps} current={step} onSelect={setStep} />

      {error && step === STEP_MODEL && (
        <div className="alert-danger" style={{ marginBottom: '20px' }} role="alert">{error}</div>
      )}

      {/* ── 01 · the model ─────────────────────────────────────────────── */}
      {step === STEP_MODEL && (
        <div className="step-view is-form">
          <div className="step-head">
            <div>
              <h1 className="step-h1">{t('workflow.uploadModel')}</h1>
              <p className="step-lede">
                 {t('workflow.uploadModelIntroCorrect')}
              </p>
            </div>
          </div>

          <div
            style={{
              border: `1.5px dashed ${dragActive ? 'var(--accent)' : 'var(--ink-4)'}`,
              borderRadius: '16px',
              padding: '36px 24px',
              textAlign: 'center',
              background: dragActive ? 'var(--accent-bg)' : 'var(--card)',
              transition: 'border-color .12s linear, background .12s linear',
            }}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {file ? (
              <div>
                <p style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{file.name}</p>
                <p className="synthetic" style={{ margin: '0 auto 16px' }}>{formatFileSize(file.size)}</p>
                <button type="button" onClick={removeFile} className="btn" style={{ color: 'var(--revision)', borderColor: 'var(--revision)' }}>
                  {t('workflow.removeFile')}
                </button>
              </div>
            ) : (
              <div>
                <div
                  aria-hidden="true"
                  style={{
                    width: '42px', height: '42px', borderRadius: '10px',
                    background: 'var(--accent-bg)', color: 'var(--accent)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 14px',
                  }}
                >
                  <CubeIcon size={22} />
                </div>
                <p style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{t('workflow.dropModel')}</p>
                <p className="synthetic" style={{ margin: '0 auto 16px' }}>
                   {t('modelUi.acceptedModelFiles')}
                </p>
                <label className="btn-primary" style={{ cursor: 'pointer' }}>
                  <input
                    type="file"
                    accept=".stl,.step,.stp"
                    onChange={(e) => acceptFile(e.target.files?.[0])}
                    className="hidden"
                    style={{ display: 'none' }}
                  />
                  {t('workflow.browseFiles')}
                </label>
              </div>
            )}
          </div>

          <div style={{ marginTop: '26px' }}>
            <Disclosure
               title={t('ui.whatPageReturns')}
               hint={t('ui.modelHint')}
              open={limitsOpen}
              onToggle={() => setLimitsOpen((v) => !v)}
            >
              <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                <table className="cat-table is-reference">
                  <tbody>
                    <tr><td>{t('legacy.boards')}</td><td>{t('legacy.longSolids')}</td></tr>
                    <tr><td>{t('legacy.sheets')}</td><td>{t('legacy.thinSolids')}</td></tr>
                    <tr><td>{t('legacy.namesMaterial')}</td><td>{t('legacy.readStepStl')}</td></tr>
                    <tr><td>{t('legacy.quantity')}</td><td>{t('legacy.countedParts')}</td></tr>
                  </tbody>
                </table>
                <table className="cat-table is-reference">
                  <tbody>
                    <tr><td>{t('legacy.fileSize', { format: 'STL' })}</td><td>50 MB</td></tr>
                    <tr><td>{t('legacy.fileSize', { format: 'STEP' })}</td><td>50 MB</td></tr>
                  </tbody>
                </table>
              </div>
            </Disclosure>
          </div>

          <div className="step-foot">
            <p className="synthetic step-foot-note">
               {file ? t('ui.readyToRead') : t('ui.chooseFileContinue')}
            </p>
            <div className="step-foot-act">
              <button type="button" className="btn-order" disabled={!file || reading} onClick={readModel}>
                {reading ? <><Loader /> {t('workflow.readingModel')}</> : <>{t('workflow.readModel')} <ArrowRight size={15} /></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 02 · the cutlists found ─────────────────────────────────────── */}
      {step === STEP_CUTLISTS && groups.length > 0 && (
        <div className="step-view">
          <div className="step-head" style={{ marginBottom: '20px' }}>
            <div>
          <h1 className="step-h1">{t('ui.cutlistsFound')}</h1>
              <p className="step-lede">
                 {t('ui.cutlistsIntro', { model: modelName })}
              </p>
            </div>
          </div>

          <table className="cat-table model-cutlists">
            <thead>
              <tr>
                 <th aria-label={t('ui.include')} style={{ width: '30px' }} />
                 <th style={{ textAlign: 'left' }}>{t('ui.cutlist')}</th>
                 <th style={{ textAlign: 'left' }}>{t('productUi.product')}</th>
                 <th>{t('workflow.qty')}</th>
                 <th aria-label={t('ui.planAlone')} />
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const config = configs[group.id];
                const label = labelOf(group);
                const expanded = expandedIds.has(group.id);
                return (
                  <Fragment key={group.id}>
                    <tr>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(group.id)}
                          onChange={() => toggleGroup(group.id)}
                          aria-label={`${t('ui.include')} ${label}`}
                        />
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <input
                          type="text"
                          className="form-input"
                          style={{ fontWeight: 700, fontSize: '13.5px', maxWidth: '260px' }}
                          value={config.label}
                          placeholder={groupLabel(group, { ...config, label: '' }, t)}
                          onChange={(e) => updateConfig(group.id, { label: e.target.value })}
                          aria-label={t('modelUi.renameCutlist', { name: groupLabel(group, { ...config, label: '' }, t) })}
                        />
                        <p className="synthetic" style={{ marginTop: '4px', whiteSpace: 'normal' }}>
                          {group.names.join(', ')}
                        </p>
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{ marginTop: '6px' }}
                          aria-expanded={expanded}
                          onClick={() => toggleExpanded(group.id)}
                        >
                          {t(expanded
                            ? (group.kind === 'board' ? 'modelUi.hideLengths' : 'modelUi.hideSizes')
                            : (group.kind === 'board' ? 'modelUi.showLengths' : 'modelUi.showSizes'))}
                        </button>
                      </td>
                      <td style={{ textAlign: 'left', minWidth: '260px' }}>
                        <ProductPicker
                          kind={group.kind}
                          value={config.product}
                          onChange={(product) => updateConfig(group.id, { product })}
                          dims={groupDimensions(group)}
                          memoryKey={groupMemoryKey(group)}
                          label={t('productUi.chooseProductFor', { name: label })}
                        />
                      </td>
                      <td>{group.quantity}×</td>
                      <td style={{ width: '110px' }}>
                        <button type="button" className="btn btn-sm" onClick={() => planGroupAlone(group)}>
                           {t('ui.planAlone')}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr data-testid={`breakdown-${group.id}`}>
                        <td />
                        <td colSpan={4} style={{ textAlign: 'left' }}>
                          <ul className="synthetic" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            {group.kind === 'board'
                              ? group.lengths.map((l) => (
                                <li key={l.length}>{spaced(l.length)} mm × {l.qty}</li>
                              ))
                              : group.sizes.map((sz) => (
                                <li key={`${sz.length}x${sz.width}`}>{spaced(sz.length)} × {spaced(sz.width)} mm × {sz.qty}</li>
                              ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          <div className="step-foot">
            <button type="button" className="btn" onClick={() => setStep(STEP_MODEL)}>
               <ArrowLeft /> {t('ui.chooseFile')}
            </button>
            <div className="step-foot-act">
              <button
                type="button"
                className="btn-order"
                disabled={selectedIds.size === 0}
                onClick={() => setStep(STEP_SAVE)}
              >
                 {t(selectedIds.size === 1 ? 'modelUi.planCutlist' : 'modelUi.planCutlists', { count: selectedIds.size })} <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 03 · plan and save the batch ─────────────────────────────────── */}
      {step === STEP_SAVE && selectedGroups.length > 0 && (
        <div className="step-view is-form">
          {!isAuthenticated ? (
             <SignInRequired message={t('modelUi.signInCutlist')} />
          ) : (
            <>
              <div className="step-head" style={{ marginBottom: '22px' }}>
                <div>
                   <h1 className="step-h1">{allDone ? t('modelUi.cutlistsSaved') : t('modelUi.planAndSave')}</h1>
                  <p className="step-lede">
                    {allDone
                       ? t('modelUi.cutlistsSavedCount', { saved: savedCount, total: selectedGroups.length })
                       : t('modelUi.batchPlanIntro')}
                  </p>
                </div>
              </div>

              {apiError && (
                <div className="alert-danger" style={{ marginBottom: '20px' }} role="alert">{apiError}</div>
              )}

              {!allDone && (
                <>
                  {selectedGroups.map((group) => (
                    <ModelGroupSettings
                      key={group.id}
                      group={group}
                      config={configs[group.id]}
                      errors={errorsOf(group, debouncedConfigs)}
                      label={labelOf(group)}
                      currency={money.currency}
                      onChange={(patch) => updateConfig(group.id, patch)}
                      onApplyAll={(group.kind === 'board' ? boardGroupCount : sheetGroupCount) > 1
                        ? () => applyToAll(group.id)
                        : null}
                    />
                  ))}
                  {appliedNote && <p className="synthetic" role="status" style={{ marginBottom: '20px' }}>{appliedNote}</p>}

                  <section style={{ marginBottom: '26px' }}>
                    <ProjectPicker
                      groups={projectGroups}
                      value={selectedGroupId}
                      onChange={setSelectedGroupId}
                      onCreate={createGroup}
                      defaultNewName={modelName}
                    />
                  </section>
                </>
              )}

              <section>
                <div className="section-rule">
                   <h2 className="section-title">{allDone ? t('modelUi.saved') : t('modelUi.willBeSaved')}</h2>
                </div>
                <table className="cat-table">
                  <tbody>
                    {selectedGroups.map((group) => {
                      const status = statuses[group.id];
                      return (
                        <tr key={group.id}>
                          <td style={{ textAlign: 'left' }}>{planNameOf(group)}</td>
                          <td style={{ width: '140px' }}>
                            {status === 'done' && <span style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Tick size={14} /> {t('legacy.saved')}</span>}
                            {status === 'running' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Loader /> {t('legacy.planning')}</span>}
                            {status === 'error' && <span style={{ color: 'var(--revision)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Strike size={12} /> {t('legacy.failed')}</span>}
                            {!status && <span className="text-muted">{t('legacy.waiting')}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {Object.entries(statusMessages).map(([id, message]) => (
                  statuses[id] === 'error' && (
                    <p key={id} className="text-danger text-[12.5px] font-semibold" style={{ marginTop: '8px' }}>
                      {planNameOf(groups.find((g) => g.id === id))}: {message}
                    </p>
                  )
                ))}
              </section>

              <div className="step-foot">
                <button type="button" className="btn" onClick={() => setStep(STEP_CUTLISTS)}>
                   <ArrowLeft /> {t('modelUi.backToCutlists')}
                </button>
                <div className="step-foot-act">
                  {allDone ? (
                    <Link to={savedProjectPath} className="btn-order">
                       {selectedGroupId ? t('modelUi.openProject') : t('ui.openDashboard')} <ArrowRight size={15} />
                    </Link>
                  ) : (
                    <button type="button" className="btn-order" disabled={saving || stockHasErrors} onClick={planAndSaveAll}>
                      {saving
                         ? <><Loader /> {t('legacy.planning')}</>
                         : <>{t('modelUi.planCutlists', { count: selectedGroups.length })} <ArrowRight size={15} /></>}
                    </button>
                  )}
                </div>
              </div>

              {allDone && (
                <p className="synthetic" style={{ marginTop: '16px' }}>
                   {savedGroupName
                     ? t('ui.filedUnder', { group: savedGroupName })
                     : t('ui.unfiled')}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </CatalogPage>
  );
};

/* The one part of ProtectedRoute's gate this page needs, inline: steps 1 and 2
   — reading a model — stay open to everyone, so only this step's own content
   is gated rather than the whole route. */
const SignInRequired = ({ message }) => {
  const { t } = useTranslation();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const { needsSetup, setupCheckError } = useAuth();

  if (setupCheckError) {
    return (
      <div className="card" style={{ maxWidth: '420px', margin: '40px auto', textAlign: 'center' }}>
        <h2 className="section-title" style={{ marginBottom: '10px' }}>{t('common.apiUnavailableHeading')}</h2>
        <p style={{ color: 'var(--ink-2)' }}>
          {t('common.apiUnavailableDescription')}
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: '420px', margin: '40px auto', textAlign: 'center' }}>
      <h2 className="section-title" style={{ marginBottom: '10px' }}>{t('common.signInRequired')}</h2>
      <p style={{ color: 'var(--ink-2)', marginBottom: '18px' }}>{message}</p>
      <button type="button" className="btn-order" onClick={() => setAuthModalOpen(true)}>{t('common.signIn')}</button>
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} initialMode={needsSetup ? 'register' : 'login'} isFirstRun={needsSetup} />
    </div>
  );
};

export default ModelCutlistOptimizer;
