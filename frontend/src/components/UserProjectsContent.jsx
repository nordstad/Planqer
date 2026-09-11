/*
  Saved work, as containers you open rather than one flat list.

  The previous version printed every project's table on one page, one after
  another, with a "Delete project" button next to each heading — so a plan's
  relationship to its project was carried by nothing but vertical proximity,
  and the most destructive control on the page sat where you scrolled past it.
  Now the page is an index of projects, each showing its newest plan's own
  diagram, and opening one is a real route: /dashboard/project/<id>. Managing
  a project (rename, delete) lives inside it, where you can see what you are
  about to affect.

  Plans that were never filed collect under a project-shaped entry of their
  own at /dashboard/project/none, so they are findable by the same gesture as
  everything else instead of being a footnote called "Ungrouped".
*/

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getUserProjects, updateProject, deleteProject,
  getUserSheetProjects, updateSheetProject, deleteSheetProject,
  getUserTileProjects, updateTileProject, deleteTileProject,
  downloadProjectImage, getProjectGroups, renameProjectGroup, deleteProjectGroup,
} from '../utils/api';
import { svgBlobToPngBlob } from '../utils/svgToPng';
import { printProjectPlans } from '../utils/printProject';
import { buildCutListHtml } from '../utils/tileCutList';
import { useAuth } from '../contexts/AuthContext';
import Loader from './Loader';
import PlanThumb from './PlanThumb';
import ConfirmDialog from './ConfirmDialog';
import TileCutListTable from './TileCutListTable';
import PrintMenu from './PrintMenu';
import { ArrowLeft, ArrowRight, Pencil } from './icons';

// The plans nobody filed. A route segment, not a group id.
export const LOOSE = 'none';

// How many unfiled plans the index shows before handing off to their own page.
// Kept low on purpose: this section is subordinate to the projects above it, and
// at four rows a pile of loose plans was visually louder than the projects it
// sits under. Two is enough to see what is there; the rest go behind the link.
const UNFILED_SHOWN = 2;

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// What each diagram's marks mean, kept plan-type specific — a board's kerf
// line isn't a sheet's rotated part, and the tile diagram's own caption
// already covers slivers, so it stays out of this shared line.
const legendFor = (project) => {
  if (project.projectType === 'sheet') return 'Hatched area = waste \u00b7 Dashed outline = part turned 90\u00b0';
  if (project.projectType === 'tile') return 'Amber lines = joints \u00b7 Red outline = sliver below the guard';
  return 'Grey area = waste \u00b7 Red line = saw kerf';
};

// The three saved project shapes don't share a "parts" concept — a tile
// layout has no parts list, just a chosen candidate — so this returns the
// three facts renderPlan/handlePrintAll actually print (type, count, stock)
// rather than forcing a tile project through totalParts/stockLine helpers
// shaped for board/sheet parts_data.
const planFacts = (project) => {
  if (project.projectType === 'sheet') {
    const count = Array.isArray(project.parts_data)
      ? project.parts_data.reduce((sum, p) => sum + (parseInt(p.quantity, 10) || 0), 0)
      : 0;
    return {
      type: 'Sheet',
      count: plural(count, 'part'),
      stock: `${project.sheet_width}×${project.sheet_height}mm · ${project.material_type}`,
    };
  }
  if (project.projectType === 'tile') {
    const toBuy = project.layout_result?.tiles_to_purchase_with_waste ?? project.layout_result?.tiles_to_purchase;
    return {
      type: 'Tile',
      count: Number.isFinite(toBuy) ? `${toBuy} to buy` : '—',
      stock: `${project.surface_data.width}×${project.surface_data.height}mm · ${project.tile_data.width}×${project.tile_data.height} tile`,
    };
  }
  const count = project.parts_data && typeof project.parts_data === 'object'
    ? Object.values(project.parts_data).reduce((sum, qty) => sum + qty, 0)
    : 0;
  return {
    type: 'Board',
    count: plural(count, 'part'),
    stock: `${project.board_lengths.join(', ')}mm · ${project.saw_blade_width}mm kerf`,
  };
};

const triggerDownload = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

const UserProjectsContent = ({ onPreview, groupId }) => {
  const { user, logout } = useAuth();
  const [allProjects, setAllProjects] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingGroup, setEditingGroup] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [paperSize, setPaperSize] = useState('a4');
  const [printing, setPrinting] = useState(false);
  // Which plans are checked for export, inside the project you're viewing.
  // Empty means "none picked" — handlePrintAll then falls back to every
  // printable plan, so the default gesture stays "print the whole project".
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  useEffect(() => {
    if (user) loadProjects();
  }, [user]);

  // A fresh selection per project — ticking a plan in Kitchen shouldn't
  // still be ticked after navigating to Bathroom.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [groupId]);

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError('');

      const [boardProjects, sheetProjects, tileProjects, projectGroups] = await Promise.all([
        getUserProjects(),
        getUserSheetProjects(),
        getUserTileProjects(),
        getProjectGroups(),
      ]);

      const combined = [
        ...boardProjects.map((p) => ({ ...p, projectType: 'board' })),
        ...sheetProjects.map((p) => ({ ...p, projectType: 'sheet' })),
        ...tileProjects.map((p) => ({ ...p, projectType: 'tile' })),
      ].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

      setAllProjects(combined);
      setGroups(projectGroups);
    } catch (err) {
      if (err.message.includes('Could not validate credentials') || err.message.includes('Unauthorized')) {
        logout();
        return;
      }
      setError('Failed to load projects: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (project) => {
    setPendingDelete({
      message: `Delete the plan "${project.name}"? This cannot be undone.`,
      run: async () => {
        try {
          setBusyId(project.id);
          if (project.projectType === 'sheet') {
            await deleteSheetProject(project.id);
          } else if (project.projectType === 'tile') {
            await deleteTileProject(project.id);
          } else {
            await deleteProject(project.id);
          }
          setAllProjects((prev) => prev.filter((p) => p.id !== project.id));
        } catch (err) {
          setError('Failed to delete the plan: ' + err.message);
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  // Both exports come off the one stored SVG — the server keeps no PNG. See
  // svgToPng.js for why the rasterizing happens here.
  const handleDownload = async (project, format) => {
    try {
      setBusyId(project.id);
      const svg = await downloadProjectImage(project.id, project.projectType);
      const blob = format === 'png' ? await svgBlobToPngBlob(svg) : svg;
      const kind = project.projectType === 'sheet' ? 'Sheet Layout' : project.projectType === 'tile' ? 'Tile Layout' : 'Cutlist';
      triggerDownload(blob, `${project.name} - ${kind}.${format}`);
    } catch (err) {
      setError(err.message.includes('404')
        ? `No diagram was saved with "${project.name}", so there is nothing to download. Re-run the plan and save it again.`
        : `Could not build the ${format.toUpperCase()} — ${err.message}.`);
    } finally {
      setBusyId(null);
    }
  };

  // One document, every chosen plan on its own page, via the browser's
  // print dialog — which is also where "save as PDF" lives. See
  // printProject.js for how each diagram picks the page orientation that
  // renders it largest, and how a tile plan's cut templates get their own
  // pages instead of crowding the summary table.
  const handlePrintAll = async (plans, title) => {
    const printable = plans.filter((p) => p.has_svg_image || p.cutlist_image);
    if (printable.length === 0) return;

    try {
      setPrinting(true);
      setError('');
      const withDiagrams = await Promise.all(printable.map(async (p) => {
        const pf = planFacts(p);
        return {
          name: p.name,
          kind: pf.type,
          qty: pf.count,
          stock: pf.stock,
          savedDate: formatDate(p.created_at),
          svgBlob: await downloadProjectImage(p.id, p.projectType),
          legend: legendFor(p),
          extra: p.projectType === 'tile' ? (buildCutListHtml(p.layout_result) ?? undefined) : undefined,
        };
      }));
      await printProjectPlans({ title, paper: paperSize, plans: withDiagrams });
    } catch (err) {
      setError('Could not build the printable project — ' + err.message);
    } finally {
      setPrinting(false);
    }
  };

  const handlePreview = async (project) => {
    try {
      onPreview({ ...project, imageUrl: null });
      const blob = await downloadProjectImage(project.id, project.projectType);
      onPreview({ ...project, imageUrl: window.URL.createObjectURL(blob) });
    } catch (err) {
      setError('Failed to load preview: ' + err.message);
    }
  };

  const startEdit = (project) => {
    setEditingId(project.id);
    setEditingName(project.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const saveEdit = async (project) => {
    const name = editingName.trim();
    if (!name || name === project.name) {
      cancelEdit();
      return;
    }

    try {
      if (project.projectType === 'sheet') {
        await updateSheetProject(project.id, { name });
      } else if (project.projectType === 'tile') {
        await updateTileProject(project.id, { name });
      } else {
        await updateProject(project.id, { name });
      }
      setAllProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, name } : p)));
    } catch (err) {
      setError('Failed to rename the plan: ' + err.message);
    } finally {
      cancelEdit();
    }
  };

  const startEditGroup = (group) => {
    setEditingGroup(true);
    setEditingGroupName(group.name);
  };

  const cancelEditGroup = () => {
    setEditingGroup(false);
    setEditingGroupName('');
  };

  const saveEditGroup = async (group) => {
    const name = editingGroupName.trim();
    if (!name || name === group.name) {
      cancelEditGroup();
      return;
    }

    try {
      await renameProjectGroup(group.id, name);
      setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, name } : g)));
    } catch (err) {
      setError('Failed to rename the project: ' + err.message);
    } finally {
      cancelEditGroup();
    }
  };

  const handleDeleteGroup = (group, planCount) => {
    const planNote = planCount > 0 ? ` and the ${plural(planCount, 'plan')} in it` : '';
    setPendingDelete({
      message: `Delete the project "${group.name}"${planNote}? This cannot be undone.`,
      run: async () => {
        try {
          setBusyId(group.id);
          await deleteProjectGroup(group.id);
          setGroups((prev) => prev.filter((g) => g.id !== group.id));
          setAllProjects((prev) => prev.filter((p) => p.project_group_id !== group.id));
        } catch (err) {
          setError('Failed to delete the project: ' + err.message);
        } finally {
          setBusyId(null);
        }
      },
    });
  };

  const plansIn = (id) => (id === LOOSE
    ? allProjects.filter((p) => !p.project_group_id)
    : allProjects.filter((p) => p.project_group_id === id));

  const nameField = (value, onChange, onCommit, onCancelEdit, label) => (
    <input
      type="text"
      className="form-input name-edit"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit();
        if (e.key === 'Escape') onCancelEdit();
      }}
      aria-label={label}
      autoFocus
    />
  );

  /* ── one saved plan: its own diagram, its facts, its two exports ─────── */
  // `selectable` is only passed from inside an opened project, where the
  // print controls live — a plan shown loose on the index page has nothing
  // to be selected for yet.

   const renderPlan = (project, { selectable = false } = {}) => {
     const hasDiagram = Boolean(project.has_svg_image || project.cutlist_image);
     const facts = planFacts(project);

     return (
       <div key={project.id}>
         <article className="plan-item">
           {selectable && (
             <label
               className="plan-select"
               title={hasDiagram ? 'Include this plan when exporting' : 'No diagram was saved with this plan, so it cannot be exported'}
             >
               <input
                 type="checkbox"
                 checked={selectedIds.has(project.id)}
                 onChange={() => toggleSelected(project.id)}
                 disabled={!hasDiagram}
                 aria-label={`Select ${project.name} for export`}
               />
             </label>
           )}
           <button
             type="button"
             className="plan-item-thumb"
             onClick={() => handlePreview(project)}
             disabled={!hasDiagram}
             title={hasDiagram ? 'Open the full diagram' : 'No diagram was saved with this plan'}
             aria-label={`Open the full diagram for ${project.name}`}
           >
             <PlanThumb project={project} />
           </button>

           <div className="plan-item-body">
             {editingId === project.id ? (
               nameField(editingName, setEditingName, () => saveEdit(project), cancelEdit, 'Plan name')
             ) : (
               <h3 className="plan-item-name">
                 {project.name}
                 <button
                   type="button"
                   className="name-edit-btn"
                   onClick={() => startEdit(project)}
                   aria-label={`Rename ${project.name}`}
                   title="Rename this plan"
                 >
                   <Pencil />
                 </button>
               </h3>
             )}
             <p className="plan-item-facts">
               <span className="plan-item-type">{facts.type}</span>
               <span>{facts.count}</span>
               <span>{facts.stock}</span>
             </p>
             <p className="plan-item-date">Saved {formatDate(project.created_at)}</p>
           </div>

           <div className="plan-item-acts">
             <button
               className="btn btn-sm"
               onClick={() => handleDownload(project, 'svg')}
               disabled={busyId === project.id || !hasDiagram}
             >
               SVG
             </button>
             <button
               className="btn btn-sm"
               onClick={() => handleDownload(project, 'png')}
               disabled={busyId === project.id || !hasDiagram}
             >
               PNG
             </button>
             <button
               className="btn btn-sm btn-outline-danger"
               onClick={() => handleDelete(project)}
               disabled={busyId === project.id}
             >
               Delete
             </button>
           </div>
         </article>
         {project.projectType === 'tile' && project.layout_result && (
           <div style={{ marginTop: '22px', marginBottom: '28px' }}>
             <TileCutListTable candidate={project.layout_result} />
           </div>
         )}
       </div>
     );
   };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
        <Loader />
      </div>
    );
  }

  const errorNotice = error && (
    <div className="alert-danger" role="alert" style={{ marginBottom: '18px' }}>{error}</div>
  );

  // Rendered once, reused by both returns below (project view and index) —
  // the project view's own return used to omit this entirely, so clicking
  // Delete there set pendingDelete with nothing on screen to confirm it,
  // and the dialog only appeared once you navigated to whichever view did
  // render it, asking about a plan you'd since left.
  const confirmDialog = (
    <ConfirmDialog
      open={!!pendingDelete}
      title="Delete"
      message={pendingDelete?.message}
      onConfirm={() => { pendingDelete.run(); setPendingDelete(null); }}
      onCancel={() => setPendingDelete(null)}
    />
  );

  /* ── inside one project ─────────────────────────────────────────────── */

  if (groupId) {
    const group = groupId === LOOSE ? null : groups.find((g) => g.id === groupId);

    if (groupId !== LOOSE && !group) {
      return (
        <>
          {errorNotice}
          <p style={{ color: 'var(--ink-2)', marginBottom: '16px' }}>
            That project no longer exists.
          </p>
          <Link to="/dashboard" className="btn"><ArrowLeft /> All projects</Link>
        </>
      );
    }

    const plans = plansIn(groupId);
    const title = group ? group.name : 'Not in any project';
    const printablePlans = plans.filter((p) => p.has_svg_image || p.cutlist_image);
    const printableCount = printablePlans.length;
    const selectedPlans = printablePlans.filter((p) => selectedIds.has(p.id));

    return (
      <>
        <Link to="/dashboard" className="crumb-back"><ArrowLeft />All projects</Link>

        {errorNotice}

        <header className="proj-head">
          {group && editingGroup ? (
            nameField(
              editingGroupName, setEditingGroupName,
              () => saveEditGroup(group), cancelEditGroup, 'Project name',
            )
          ) : (
            <h2 className="proj-head-name">
              {title}
              {group && (
                <button
                  type="button"
                  className="name-edit-btn"
                  onClick={() => startEditGroup(group)}
                  aria-label={`Rename ${group.name}`}
                  title="Rename this project"
                >
                  <Pencil size={15} />
                </button>
              )}
            </h2>
          )}

          <p className="proj-head-meta">
            {group
              ? `${plans.length ? plural(plans.length, 'plan') : 'Empty'} · project created ${formatDate(group.created_at)}`
              : `${plural(plans.length, 'plan')} saved without a project`}
          </p>

          {(printableCount > 0 || group) && (
            <span className="proj-head-act">
              {printableCount > 0 && (
                <PrintMenu
                  paperSize={paperSize}
                  onPaperSizeChange={setPaperSize}
                  printableCount={printableCount}
                  selectedCount={selectedPlans.length}
                  printing={printing}
                  onPrintAll={() => handlePrintAll(printablePlans, title)}
                  onPrintSelected={() => handlePrintAll(selectedPlans, title)}
                />
              )}
              {group && (
                <button
                  className="btn btn-outline-danger"
                  onClick={() => handleDeleteGroup(group, plans.length)}
                  disabled={busyId === group.id}
                >
                  Delete project
                </button>
              )}
            </span>
          )}
        </header>

        {plans.length > 0 ? (
          <div className="plan-list">{plans.map((p) => renderPlan(p, { selectable: printableCount > 1 }))}</div>
        ) : (
          <div className="proj-blank">
            <p>
              Nothing filed here yet. Run a plan, then pick <b>{title}</b> as its project
              on the save step and it lands here.
            </p>
            <Link to="/cutting" className="btn btn-primary">Plan a cut</Link>
          </div>
        )}

        {confirmDialog}
      </>
    );
  }

  /* ── the index: every project, each showing its newest plan ─────────── */

  const shelves = groups.map((group) => ({ id: group.id, name: group.name, plans: plansIn(group.id) }));
  const loose = plansIn(LOOSE);

  return (
    <>
      <div className="section-rule" style={{ marginBottom: '18px' }}>
        <h2 className="section-title">My projects</h2>
        <span className="section-rule-end">
          {allProjects.length > 0 && (
            <span className="folio">{plural(groups.length, 'project')} · {plural(allProjects.length, 'plan')}</span>
          )}
          <button type="button" className="btn btn-sm" onClick={loadProjects}>Refresh</button>
        </span>
      </div>

      {errorNotice}

      {shelves.length === 0 && loose.length === 0 && (
        <div className="proj-blank is-first">
          <p>
            Nothing saved yet. Run a plan, name it on the save step, and it keeps
            itself here — on this instance, under your account.
          </p>
          <Link to="/cutting" className="btn btn-primary">Plan a cut</Link>
        </div>
      )}

      {shelves.length > 0 && (
        <div className="proj-grid">
          {shelves.map((shelf) => (
            <Link key={shelf.id} to={`/dashboard/project/${shelf.id}`} className="proj-card">
              <span className="proj-card-cover">
                {shelf.plans.length > 0
                  ? <PlanThumb project={shelf.plans[0]} />
                  : <span className="thumb"><span className="thumb-none">No plans yet</span></span>}
              </span>
              <span className="proj-card-foot">
                <span className="proj-card-text">
                  <b>{shelf.name}</b>
                  <em>
                    {shelf.plans.length > 0
                      ? `${plural(shelf.plans.length, 'plan')} · last saved ${formatDate(shelf.plans[0].updated_at)}`
                      : 'Empty — nothing filed here yet'}
                  </em>
                </span>
                <ArrowRight />
              </span>
            </Link>
          ))}
        </div>
      )}

      {shelves.length === 0 && loose.length > 0 && (
        <p className="unfiled-noprojects">
          No projects yet. A project holds the plans for one build — a chair's
          rails and its seat, together. Pick or create one on a plan's save step.
        </p>
      )}

      {/* Plans nobody filed are not a project, so they are not drawn as one.
          A project is a card with cover art that you open; these are just
          plans, shown as plans, in the open. Giving them a matching card in
          the same grid made the absence of a container look like a container. */}
      {loose.length > 0 && (
        <section className="unfiled">
          <div className="section-rule" style={{ marginBottom: '10px' }}>
            <h3 className="section-title">Not in any project</h3>
            <span className="folio">{plural(loose.length, 'plan')}</span>
          </div>
          <p className="synthetic" style={{ marginBottom: '16px', maxWidth: 'none' }}>
            Saved without picking a project — filing one just makes it easier to find later.
          </p>
          <div className="plan-list">{loose.slice(0, UNFILED_SHOWN).map(renderPlan)}</div>
          {loose.length > UNFILED_SHOWN && (
            <Link to={`/dashboard/project/${LOOSE}`} className="unfiled-all">
              Show all {loose.length} <ArrowRight />
            </Link>
          )}
        </section>
      )}

      {confirmDialog}
    </>
  );
};

export default UserProjectsContent;
