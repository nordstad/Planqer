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
    03 Save      — stock and kerf once, planned and saved together

  The reason there is a step 2 at all: one model is rarely one cutlist. A
  bench is boards of three different cross-sections and a plywood top — three
  things to plan, not one. Step 2 is where that's visible before committing to
  planning any of them, and a single group can also jump straight to the board
  or sheet page instead of joining the batch, for the one-cutlist case that
  doesn't need a project at all.
*/

import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import Loader from './Loader';
import Disclosure from './Disclosure';
import ProjectPicker from './ProjectPicker';
import PlanSteps from './PlanSteps';
import BoardLengthRow from './BoardLengthRow';
import AuthModal from './auth/AuthModal';
import { useAuth } from '../contexts/AuthContext';
import { useDebounce } from '../hooks/useDebounce';
import { validateBoards } from '../utils/validators';
import { ArrowLeft, ArrowRight, Plus, Tick, Strike, CubeIcon } from './icons';
import {
  process3DCutlist, processStepCutlist,
  optimizeCutting, saveProject,
  optimizeSheetCutting, saveSheetProject,
  getProjectGroups, createProjectGroup,
  getUserSettings,
} from '../utils/api';

const mm = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('sv-SE') : '—');

const STEP_MODEL = 0;
const STEP_CUTLISTS = 1;
const STEP_SAVE = 2;

const formatFileSize = (bytes) => {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const extensionOf = (filename) => filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || '';
const ACCEPTED = ['.stl', '.step', '.stp'];

/* Every distinct size Planqer found becomes one cutlist, whatever format it
   came from. Material joins the grouping key: two identical rectangles in
   different materials are two different purchases, not one. */
const groupBoards = (items) => {
  const grouped = new Map();
  items.forEach((item) => {
    const width = Math.round(item.width);
    const thickness = Math.round(item.thickness);
    if (width <= 0 || thickness <= 0) return;
    const material = item.material || null;
    const id = `board|${material || ''}|${width}x${thickness}`;
    if (!grouped.has(id)) {
      grouped.set(id, { id, kind: 'board', material, width, thickness, quantity: 0, names: [], lengths: [] });
    }
    const g = grouped.get(id);
    g.quantity += item.quantity;
    g.names.push(item.name);
    g.lengths.push({ length: Math.round(item.length), qty: item.quantity });
  });
  return [...grouped.values()];
};

const groupSheets = (items) => {
  const grouped = new Map();
  items.forEach((item) => {
    const thickness = Math.round(item.thickness);
    if (thickness <= 0) return;
    const material = item.material || null;
    const id = `sheet|${material || ''}|${thickness}`;
    if (!grouped.has(id)) {
      grouped.set(id, { id, kind: 'sheet', material, thickness, quantity: 0, names: [], sizes: [] });
    }
    const g = grouped.get(id);
    g.quantity += item.quantity;
    g.names.push(item.name);
    g.sizes.push({ length: Math.round(item.length), width: Math.round(item.width), qty: item.quantity });
  });
  return [...grouped.values()];
};

const dimLabel = (group) => (group.kind === 'board'
  ? `${group.width} × ${group.thickness} mm boards`
  : `${group.thickness} mm sheet`);

const planNameFor = (modelName, group) => {
  const label = dimLabel(group);
  return group.material ? `${modelName} · ${group.material} ${label}` : `${modelName} · ${label}`;
};

const ModelCutlistOptimizer = () => {
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

  const modelName = file ? file.name.replace(/\.[a-z0-9]+$/i, '') : 'Model';
  const selectedGroups = groups.filter((g) => selectedIds.has(g.id));
  const hasBoards = selectedGroups.some((g) => g.kind === 'board');
  const hasSheets = selectedGroups.some((g) => g.kind === 'sheet');

  /* ── 03 · save: stock, kerf, project, and the batch itself ───────────── */
  const [boards, setBoards] = useState(["2500", "3600", "4200", "5100"]);
  const [boardKerf, setBoardKerf] = useState("3");
  const [sheetWidth, setSheetWidth] = useState("1200");
  const [sheetHeight, setSheetHeight] = useState("2500");
  const [sheetKerf, setSheetKerf] = useState("3");
  const [materialType, setMaterialType] = useState("plywood");
  const [allowRotation, setAllowRotation] = useState(true);
  const [limitsOpen, setLimitsOpen] = useState(false);

  const [projectGroups, setProjectGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [apiError, setApiError] = useState('');
  const [statuses, setStatuses] = useState({}); // id -> 'pending' | 'running' | 'done' | 'error'
  const [statusMessages, setStatusMessages] = useState({});
  const [saving, setSaving] = useState(false);

  const debouncedBoards = useDebounce(boards, 300);
  const debouncedBoardKerf = useDebounce(boardKerf, 300);
  const debouncedSheetWidth = useDebounce(sheetWidth, 300);
  const debouncedSheetHeight = useDebounce(sheetHeight, 300);
  const debouncedSheetKerf = useDebounce(sheetKerf, 300);

  const boardErrors = hasBoards ? validateBoards(debouncedBoards) : [];
  const validBoards = boards.filter((b) => b && !isNaN(parseFloat(b)));
  const boardKerfError = hasBoards
    ? (!debouncedBoardKerf || parseFloat(debouncedBoardKerf) <= 0
      ? "A kerf of zero would plan cuts that lose no material"
      : parseFloat(debouncedBoardKerf) > 20
        ? "That kerf is wider than any saw blade — 2 to 4 mm is typical"
        : "")
    : "";
  const sheetWidthError = hasSheets
    ? (!debouncedSheetWidth || isNaN(parseFloat(debouncedSheetWidth)) || parseFloat(debouncedSheetWidth) <= 0
      ? "Sheet width must be a positive number" : "")
    : "";
  const sheetHeightError = hasSheets
    ? (!debouncedSheetHeight || isNaN(parseFloat(debouncedSheetHeight)) || parseFloat(debouncedSheetHeight) <= 0
      ? "Sheet height must be a positive number" : "")
    : "";
  const sheetKerfError = hasSheets
    ? (!debouncedSheetKerf || isNaN(parseFloat(debouncedSheetKerf)) || parseFloat(debouncedSheetKerf) < 0
      ? "A kerf of zero would plan cuts that lose no material" : "")
    : "";
  const stockHasErrors = boardErrors.some(Boolean) || !!boardKerfError
    || !!sheetWidthError || !!sheetHeightError || !!sheetKerfError;

  const allDone = selectedGroups.length > 0 && selectedGroups.every((g) => statuses[g.id] === 'done');
  const savedCount = selectedGroups.filter((g) => statuses[g.id] === 'done').length;

  // Loaded lazily, only once the save step is actually reached. The saved
  // user defaults also populate the stock list if the user is signed in.
  useEffect(() => {
    if (!user) return;

    if (step === STEP_SAVE) {
      getProjectGroups().then(setProjectGroups).catch(() => {});
    }

    getUserSettings().then((settings) => {
      if (Array.isArray(settings?.default_board_lengths) && settings.default_board_lengths.length > 0) {
        setBoards(settings.default_board_lengths.map(String));
      }
      if (Number.isFinite(settings?.default_saw_blade_width) && settings.default_saw_blade_width > 0) {
        setBoardKerf(String(settings.default_saw_blade_width));
      }
    }).catch(() => {});
  }, [user, step]);

  /* ── the model ─────────────────────────────────────────────────────── */
  const retireAll = () => {
    setGroups([]);
    setSelectedIds(new Set());
    setStatuses({});
    setStatusMessages({});
    setApiError('');
  };

  const acceptFile = (candidate) => {
    if (!candidate) return;
    if (!ACCEPTED.includes(extensionOf(candidate.name))) {
      setError('Please select an STL, STEP or STP file');
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
      setError('Please select a model file');
      return;
    }
    setReading(true);
    setError(null);
    try {
      const isStep = ['.step', '.stp'].includes(extensionOf(file.name));
      const data = isStep ? await processStepCutlist(file) : await process3DCutlist(file);
      const found = [...groupBoards(data.boards || []), ...groupSheets(data.sheets || [])];
      if (found.length === 0) {
        setError("No board or sheet components found in this file — Planqer measures solids, and this model doesn't hold any it recognises.");
        setReading(false);
        return;
      }
      setGroups(found);
      setSelectedIds(new Set(found.map((g) => g.id)));
      setStep(STEP_CUTLISTS);
    } catch (err) {
      setError(err.message || 'Failed to read this model');
    }
    setReading(false);
  };

  /* ── the cutlists step ─────────────────────────────────────────────── */
  const toggleGroup = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const planGroupAlone = (group) => {
    if (group.kind === 'board') {
      const parts = {};
      group.lengths.forEach((l) => { parts[l.length.toString()] = l.qty; });
      localStorage.setItem('planqer-3d-import', JSON.stringify({
        parts, projectName: planNameFor(modelName, group), source: 'model-cutlist',
      }));
      window.location.href = '/cutting?import=3d';
    } else {
      const parts = group.sizes.map((s, i) => ({
        width: s.width, height: s.length, quantity: s.qty,
        name: `${group.names[0] || 'Sheet'}_${i + 1}`, id: `sheet_${i + 1}`,
      }));
      localStorage.setItem('planqer-3d-sheet-import', JSON.stringify({
        parts, projectName: planNameFor(modelName, group), source: 'model-cutlist-sheet',
      }));
      window.location.href = '/sheet-cutting?import=3d';
    }
  };

  const totalComponents = groups.reduce((n, g) => n + g.quantity, 0);

  /* ── the save step ─────────────────────────────────────────────────── */
  const addBoard = () => setBoards([...boards, ""]);
  const removeBoard = (index) => { if (boards.length > 1) setBoards(boards.filter((_, i) => i !== index)); };
  const handleBoardChange = (index, value) => setBoards(boards.map((b, i) => (i === index ? value : b)));
  const handleBoardsPaste = (index, e) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\n')) return;
    e.preventDefault();
    const rows = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[,\t]|\s+/)[0]);
    if (!rows.length) return;
    const next = [...boards];
    next.splice(index, 1, ...rows);
    setBoards(next);
  };

  const createGroup = async (name) => {
    try {
      const group = await createProjectGroup(name);
      setProjectGroups((prev) => [group, ...prev]);
      setSelectedGroupId(group.id);
      setApiError('');
      return true;
    } catch (err) {
      setApiError('Could not create that project: ' + err.message);
      return false;
    }
  };

  const runOne = async (group) => {
    setStatuses((prev) => ({ ...prev, [group.id]: 'running' }));
    try {
      if (group.kind === 'board') {
        const parts = group.lengths.map((l) => ({ length: String(l.length), quantity: String(l.qty) }));
        const result = await optimizeCutting(parts, boards, boardKerf, null);
        await saveProject({
          name: planNameFor(modelName, group),
          projectGroupId: selectedGroupId,
          parts, boards, sawKerf: boardKerf, boardCosts: null, result,
        });
      } else {
        const parts = group.sizes.map((s, i) => ({
          width: String(s.width), height: String(s.length), quantity: String(s.qty),
          name: `${group.names[0] || 'Sheet'}_${i + 1}`, id: `sheet_${i + 1}`,
        }));
        const result = await optimizeSheetCutting(parts, sheetWidth, sheetHeight, sheetKerf, materialType, undefined, allowRotation);
        await saveSheetProject({
          name: planNameFor(modelName, group),
          projectGroupId: selectedGroupId,
          parts, sheetWidth, sheetHeight, kerfWidth: sheetKerf, materialType, algorithm: '', allowRotation, result,
        });
      }
      setStatuses((prev) => ({ ...prev, [group.id]: 'done' }));
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [group.id]: 'error' }));
      setStatusMessages((prev) => ({ ...prev, [group.id]: err.message || 'Could not plan this one' }));
    }
  };

  const planAndSaveAll = async () => {
    setApiError('');
    if (stockHasErrors) return;
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

  /* ── the rail ──────────────────────────────────────────────────────── */
  const steps = [
    {
      label: 'Model',
      reachable: true,
      summary: file ? `${file.name} · ${formatFileSize(file.size)}` : 'No file yet',
    },
    {
      label: 'Cutlists',
      reachable: groups.length > 0,
      summary: groups.length > 0 ? `${totalComponents} parts · ${groups.length} ${groups.length === 1 ? 'cutlist' : 'cutlists'}` : '',
      locked: 'Reads from your model',
    },
    {
      label: 'Save',
      reachable: selectedGroups.length > 0,
      summary: allDone ? `Saved ${savedCount} of ${selectedGroups.length}` : selectedGroups.length ? 'Plan and keep them' : '',
      locked: 'Waits for selected cutlists',
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
              <h1 className="step-h1">Upload a model</h1>
              <p className="step-lede">
                An STL or a STEP file — the model you already designed. Planqer measures
                every solid in it and sorts them into cutlists you can plan and save.
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
                <p className="synthetic" style={{ marginBottom: '16px' }}>{formatFileSize(file.size)}</p>
                <button type="button" onClick={removeFile} className="btn" style={{ color: 'var(--revision)', borderColor: 'var(--revision)' }}>
                  Remove file
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
                <p style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Drop your model here</p>
                <p className="synthetic" style={{ marginBottom: '16px' }}>
                  STL, STEP or STP · up to 50MB
                </p>
                <label className="btn-primary" style={{ cursor: 'pointer' }}>
                  <input
                    type="file"
                    accept=".stl,.step,.stp"
                    onChange={(e) => acceptFile(e.target.files?.[0])}
                    className="hidden"
                    style={{ display: 'none' }}
                  />
                  Browse files
                </label>
              </div>
            )}
          </div>

          <div style={{ marginTop: '26px' }}>
            <Disclosure
              title="What this page returns, and its limits"
              hint="Boards and sheets, grouped by size — ready for either optimizer"
              open={limitsOpen}
              onToggle={() => setLimitsOpen((v) => !v)}
            >
              <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                <table className="cat-table is-reference">
                  <tbody>
                    <tr><td>Boards</td><td>Long, narrow solids — cross-section and length</td></tr>
                    <tr><td>Sheets</td><td>Thin, wide solids — thickness, length and width</td></tr>
                    <tr><td>Names, material</td><td>Read from STEP; STL carries geometry only</td></tr>
                    <tr><td>Quantity</td><td>Counted from repeated parts and assemblies</td></tr>
                  </tbody>
                </table>
                <table className="cat-table is-reference">
                  <tbody>
                    <tr><td>STL file size</td><td>50 MB maximum</td></tr>
                    <tr><td>STEP file size</td><td>50 MB maximum</td></tr>
                    <tr><td>Units</td><td>Millimetres — the file's own declared unit is used if it has one</td></tr>
                  </tbody>
                </table>
              </div>
            </Disclosure>
          </div>

          <div className="step-foot">
            <p className="synthetic step-foot-note">
              {file ? 'Ready to read' : 'Choose a file to continue'}
            </p>
            <div className="step-foot-act">
              <button type="button" className="btn-order" disabled={!file || reading} onClick={readModel}>
                {reading ? <><Loader /> Reading model</> : <>Read the model <ArrowRight size={15} /></>}
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
              <h1 className="step-h1">Cutlists found</h1>
              <p className="step-lede">
                Every distinct size in {modelName}, grouped so you can plan them together
                or send just one to its own optimizer.
              </p>
            </div>
          </div>

          <table className="cat-table">
            <thead>
              <tr>
                <th aria-label="Include" style={{ width: '30px' }} />
                <th style={{ textAlign: 'left' }}>Cutlist</th>
                <th>Qty</th>
                <th aria-label="Plan alone" />
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(group.id)}
                      onChange={() => toggleGroup(group.id)}
                      aria-label={`Include ${dimLabel(group)}`}
                    />
                  </td>
                  <td style={{ textAlign: 'left' }}>
                    <b style={{ fontSize: '13.5px' }}>
                      {group.material ? `${group.material} · ` : ''}{dimLabel(group)}
                    </b>
                    <p className="synthetic" style={{ marginTop: '2px', whiteSpace: 'normal' }}>
                      {group.names.join(', ')}
                    </p>
                  </td>
                  <td>{group.quantity}×</td>
                  <td style={{ width: '110px' }}>
                    <button type="button" className="btn btn-sm" onClick={() => planGroupAlone(group)}>
                      Plan alone
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="step-foot">
            <button type="button" className="btn" onClick={() => setStep(STEP_MODEL)}>
              <ArrowLeft /> Choose a different file
            </button>
            <div className="step-foot-act">
              <button
                type="button"
                className="btn-order"
                disabled={selectedIds.size === 0}
                onClick={() => setStep(STEP_SAVE)}
              >
                Plan {selectedIds.size} {selectedIds.size === 1 ? 'cutlist' : 'cutlists'} <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 03 · plan and save the batch ─────────────────────────────────── */}
      {step === STEP_SAVE && selectedGroups.length > 0 && (
        <div className="step-view is-form">
          {!isAuthenticated ? (
            <SignInRequired message="Sign in or create a local account on this instance to plan and save cutlists." />
          ) : (
            <>
              <div className="step-head" style={{ marginBottom: '22px' }}>
                <div>
                  <h1 className="step-h1">{allDone ? 'Cutlists saved' : 'Plan and save'}</h1>
                  <p className="step-lede">
                    {allDone
                      ? `${savedCount} of ${selectedGroups.length} planned and kept on this instance.`
                      : 'Set the stock and kerf once — every selected cutlist plans against it and lands in one project.'}
                  </p>
                </div>
              </div>

              {apiError && (
                <div className="alert-danger" style={{ marginBottom: '20px' }} role="alert">{apiError}</div>
              )}

              {!allDone && (
                <>
                  {hasBoards && (
                    <section style={{ marginBottom: '30px' }}>
                      <div className="section-rule">
                        <h2 className="section-title">Stock available</h2>
                        <span className="folio">For the board cutlists below</span>
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
                              error={boardErrors[index]}
                              canRemove={boards.length > 1}
                              inPlan={null}
                            />
                          ))}
                        </tbody>
                      </table>
                      <button type="button" className="btn" style={{ marginTop: '12px' }} onClick={addBoard}>
                        <Plus /> Add stock length
                      </button>

                      <div className="flex items-center gap-2" style={{ marginTop: '18px' }}>
                        <label className="form-label" htmlFor="model-board-kerf" style={{ marginBottom: 0 }}>Saw blade</label>
                        <input
                          id="model-board-kerf"
                          type="number"
                          step="1"
                          min="1"
                          max="20"
                          value={boardKerf}
                          onChange={(e) => setBoardKerf(e.target.value.replace(/\D/g, '').slice(0, 2))}
                          className={`form-input kerf-input ${boardKerfError ? 'form-input-error' : ''}`}
                          style={{ width: '78px' }}
                        />
                        <span style={{ fontSize: '13.5px', color: 'var(--ink-3)', fontWeight: 600 }}>mm</span>
                      </div>
                      {boardKerfError && <p className="text-danger text-[12.5px] font-semibold" style={{ marginTop: '5px' }}>{boardKerfError}</p>}
                    </section>
                  )}

                  {hasSheets && (
                    <section style={{ marginBottom: '30px' }}>
                      <div className="section-rule">
                        <h2 className="section-title">The sheet you're cutting from</h2>
                        <span className="folio">For the sheet cutlists below</span>
                      </div>
                      <table className="cat-table">
                        <tbody>
                          <tr>
                            <td style={{ textAlign: 'left' }}>Width</td>
                            <td>
                              <input
                                type="number" step="0.1" min="10"
                                value={sheetWidth}
                                onChange={(e) => setSheetWidth(e.target.value)}
                                className={`cell-input ${sheetWidthError ? 'is-error' : ''}`}
                                aria-label="Sheet width in millimetres"
                              />
                            </td>
                            <td style={{ width: '40px', color: 'var(--ink-3)' }}>mm</td>
                          </tr>
                          <tr>
                            <td style={{ textAlign: 'left' }}>Height</td>
                            <td>
                              <input
                                type="number" step="0.1" min="10"
                                value={sheetHeight}
                                onChange={(e) => setSheetHeight(e.target.value)}
                                className={`cell-input ${sheetHeightError ? 'is-error' : ''}`}
                                aria-label="Sheet height in millimetres"
                              />
                            </td>
                            <td style={{ color: 'var(--ink-3)' }}>mm</td>
                          </tr>
                          <tr>
                            <td style={{ textAlign: 'left' }}>Kerf</td>
                            <td>
                              <input
                                type="number" step="0.1" min="0"
                                value={sheetKerf}
                                onChange={(e) => setSheetKerf(e.target.value)}
                                className={`cell-input ${sheetKerfError ? 'is-error' : ''}`}
                                aria-label="Sheet kerf in millimetres"
                              />
                            </td>
                            <td style={{ color: 'var(--ink-3)' }}>mm</td>
                          </tr>
                          <tr>
                            <td style={{ textAlign: 'left' }}>Material</td>
                            <td>
                              <select
                                value={materialType}
                                onChange={(e) => setMaterialType(e.target.value)}
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
                      {(sheetWidthError || sheetHeightError || sheetKerfError) && (
                        <p className="text-danger text-[12.5px] font-semibold" style={{ marginTop: '10px' }}>
                          {sheetWidthError || sheetHeightError || sheetKerfError}
                        </p>
                      )}
                    </section>
                  )}

                  <section style={{ marginBottom: '26px' }}>
                    <ProjectPicker
                      groups={projectGroups}
                      value={selectedGroupId}
                      onChange={setSelectedGroupId}
                      onCreate={createGroup}
                    />
                  </section>
                </>
              )}

              <section>
                <div className="section-rule">
                  <h2 className="section-title">{allDone ? 'Saved' : 'Will be planned and saved'}</h2>
                </div>
                <table className="cat-table">
                  <tbody>
                    {selectedGroups.map((group) => {
                      const status = statuses[group.id];
                      return (
                        <tr key={group.id}>
                          <td style={{ textAlign: 'left' }}>{planNameFor(modelName, group)}</td>
                          <td style={{ width: '140px' }}>
                            {status === 'done' && <span style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Tick size={14} /> Saved</span>}
                            {status === 'running' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Loader /> Planning</span>}
                            {status === 'error' && <span style={{ color: 'var(--revision)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}><Strike size={12} /> Failed</span>}
                            {!status && <span className="text-muted">Waiting</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {Object.entries(statusMessages).map(([id, message]) => (
                  statuses[id] === 'error' && (
                    <p key={id} className="text-danger text-[12.5px] font-semibold" style={{ marginTop: '8px' }}>
                      {planNameFor(modelName, groups.find((g) => g.id === id))}: {message}
                    </p>
                  )
                ))}
              </section>

              <div className="step-foot">
                <button type="button" className="btn" onClick={() => setStep(STEP_CUTLISTS)}>
                  <ArrowLeft /> Back to cutlists
                </button>
                <div className="step-foot-act">
                  {allDone ? (
                    <Link to="/dashboard" className="btn-order">
                      Open your dashboard <ArrowRight size={15} />
                    </Link>
                  ) : (
                    <button type="button" className="btn-order" disabled={saving || stockHasErrors} onClick={planAndSaveAll}>
                      {saving
                        ? <><Loader /> Planning</>
                        : <>Plan and save {selectedGroups.length} {selectedGroups.length === 1 ? 'cutlist' : 'cutlists'} <ArrowRight size={15} /></>}
                    </button>
                  )}
                </div>
              </div>

              {allDone && (
                <p className="synthetic" style={{ marginTop: '16px' }}>
                  {savedGroupName
                    ? <>Filed under {savedGroupName}. Open any of them from <Link to="/dashboard">your dashboard</Link>.</>
                    : <>Not in a project. Open any of them from <Link to="/dashboard">your dashboard</Link>.</>}
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
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const { needsSetup, setupCheckError } = useAuth();

  if (setupCheckError) {
    return (
      <div className="card" style={{ maxWidth: '420px', margin: '40px auto', textAlign: 'center' }}>
        <h2 className="section-title" style={{ marginBottom: '10px' }}>Can't reach the API</h2>
        <p style={{ color: 'var(--ink-2)' }}>
          Couldn't confirm whether this instance has any accounts yet. If you're
          accessing Planqer from a LAN address or hostname (not localhost), add
          it to <code>PLANQER_CORS_ORIGINS</code> on the backend and restart it.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: '420px', margin: '40px auto', textAlign: 'center' }}>
      <h2 className="section-title" style={{ marginBottom: '10px' }}>Sign in required</h2>
      <p style={{ color: 'var(--ink-2)', marginBottom: '18px' }}>{message}</p>
      <button type="button" className="btn-order" onClick={() => setAuthModalOpen(true)}>Sign in</button>
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} initialMode={needsSetup ? 'register' : 'login'} isFirstRun={needsSetup} />
    </div>
  );
};

export default ModelCutlistOptimizer;
