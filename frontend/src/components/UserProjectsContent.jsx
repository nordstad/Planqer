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
import { useTranslation } from 'react-i18next';
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
import SavedMaterialList from './SavedMaterialList';
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

const plural = (n, singular, pluralWord = `${singular}s`) => `${n} ${n === 1 ? singular : pluralWord}`;

// The three saved project shapes don't share a "parts" concept — a tile
// layout has no parts list, just a chosen candidate — so this returns the
// three facts renderPlan/handlePrintAll actually print (type, count, stock)
// rather than forcing a tile project through totalParts/stockLine helpers
// shaped for board/sheet parts_data.
const planFacts = (project, t) => {
  if (project.projectType === 'sheet') {
    const count = Array.isArray(project.parts_data)
      ? project.parts_data.reduce((sum, p) => sum + (parseInt(p.quantity, 10) || 0), 0)
      : 0;
    return {
      type: t('common.sheetCutting'),
      count: t(count === 1 ? 'workflow.sheetPartsSummary_one' : 'workflow.sheetPartsSummary', { count }),
      stock: `${project.sheet_width}×${project.sheet_height}mm · ${project.material_type}`,
    };
  }
  if (project.projectType === 'tile') {
    const toBuy = project.layout_result?.tiles_to_purchase_with_waste ?? project.layout_result?.tiles_to_purchase;
    return {
      type: t('common.tileLayout'),
      count: Number.isFinite(toBuy) ? `${toBuy} ${t('ui.tilesToBuy')}` : '—',
      stock: `${project.surface_data.width}×${project.surface_data.height}mm · ${project.tile_data.width}×${project.tile_data.height} tile`,
    };
  }
  const count = project.parts_data && typeof project.parts_data === 'object'
    ? Object.values(project.parts_data).reduce((sum, qty) => sum + qty, 0)
    : 0;
  return {
    type: t('common.boardCutting'),
    count: t(count === 1 ? 'workflow.partsSummary_one' : 'workflow.partsSummary', { count, demand: '—', kerf: project.saw_blade_width }),
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
  const { t } = useTranslation();
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

  useEffect(() => {
    if (user) loadProjects();
  }, [user]);

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
       setError(t('projectUi.loadFailed', { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (project) => {
    setPendingDelete({
       message: t('projectUi.deletePlanConfirm', { name: project.name }),
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
           setError(t('projectUi.deleteFailed', { message: err.message }));
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
       const kind = project.projectType === 'sheet' ? t('common.sheetCutting') : project.projectType === 'tile' ? t('common.tileLayout') : t('common.boardCutting');
      triggerDownload(blob, `${project.name} - ${kind}.${format}`);
    } catch (err) {
      setError(err.message.includes('404')
         ? t('projectUi.noDiagramDownload', { name: project.name })
         : t('projectUi.exportFailed', { format: format.toUpperCase(), message: err.message }));
    } finally {
      setBusyId(null);
    }
  };

  // One document, every plan on its own page, via the browser's print
  // dialog — which is also where "save as PDF" lives. See printProject.js
  // for how each diagram picks the page orientation that renders it largest.
  const handlePrintAll = async (plans, title) => {
    const printable = plans.filter((p) => p.has_svg_image || p.cutlist_image);
    if (printable.length === 0) return;

    try {
      setPrinting(true);
      setError('');
      const withDiagrams = await Promise.all(printable.map(async (p) => {
        const pf = planFacts(p, t);
        return {
          name: p.name,
           facts: [pf.type, pf.count, pf.stock, t('projectUi.saved', { date: formatDate(p.created_at) })],
          svgBlob: await downloadProjectImage(p.id, p.projectType),
          extraHtml: p.projectType === 'tile' ? buildCutListHtml(p.layout_result, t) : undefined,
        };
      }));
      await printProjectPlans({
        title,
           meta: `${t(printable.length === 1 ? 'projectUi.printPlan' : 'projectUi.printPlans', { count: printable.length })} · ${t('projectUi.printed', { date: formatDate(new Date()) })}`,
        paper: paperSize,
        plans: withDiagrams,
      });
    } catch (err) {
       setError(t('projectUi.printableFailed', { message: err.message }));
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
       setError(t('projectUi.previewFailed', { message: err.message }));
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
       setError(t('projectUi.renamePlanFailed', { message: err.message }));
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
       setError(t('projectUi.renameProjectFailed', { message: err.message }));
    } finally {
      cancelEditGroup();
    }
  };

  const handleDeleteGroup = (group, planCount) => {
     const planNote = planCount > 0 ? ` ${t('projectUi.andPlansInIt', { count: planCount })}` : '';
    setPendingDelete({
       message: t('projectUi.deleteProjectConfirm', { name: group.name, planNote }),
      run: async () => {
        try {
          setBusyId(group.id);
          await deleteProjectGroup(group.id);
          setGroups((prev) => prev.filter((g) => g.id !== group.id));
          setAllProjects((prev) => prev.filter((p) => p.project_group_id !== group.id));
        } catch (err) {
           setError(t('projectUi.deleteProjectFailed', { message: err.message }));
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

  const deleteDialog = (
    <ConfirmDialog
      open={!!pendingDelete}
      title={t('ui.delete')}
      message={pendingDelete?.message}
      onConfirm={() => { pendingDelete.run(); setPendingDelete(null); }}
      onCancel={() => setPendingDelete(null)}
    />
  );

  /* ── one saved plan: its own diagram, its facts, its two exports ─────── */

   const renderPlan = (project) => {
     const hasDiagram = Boolean(project.has_svg_image || project.cutlist_image);
      const facts = planFacts(project, t);

     return (
       <div key={project.id}>
         <article className="plan-item">
           <button
             type="button"
             className="plan-item-thumb"
             onClick={() => handlePreview(project)}
             disabled={!hasDiagram}
              title={hasDiagram ? t('projectUi.openDiagram') : t('projectUi.noPlanDiagram')}
              aria-label={t('projectUi.openDiagramFor', { name: project.name })}
           >
             <PlanThumb project={project} />
           </button>

           <div className="plan-item-body">
             {editingId === project.id ? (
                nameField(editingName, setEditingName, () => saveEdit(project), cancelEdit, t('projectUi.planName'))
             ) : (
               <h3 className="plan-item-name">
                 {project.name}
                 <button
                   type="button"
                   className="name-edit-btn"
                   onClick={() => startEdit(project)}
                    aria-label={t('projectUi.rename', { name: project.name })}
                    title={t('projectUi.renamePlanTitle')}
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
              <p className="plan-item-date">{t('projectUi.saved', { date: formatDate(project.created_at) })}</p>
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
                {t('ui.delete')}
             </button>
           </div>
         </article>
          {project.projectType === 'tile' && project.layout_result && (
            <div style={{ marginTop: '22px', marginBottom: '28px' }}>
              <TileCutListTable candidate={project.layout_result} />
            </div>
          )}
          <SavedMaterialList project={project} />
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

  /* ── inside one project ─────────────────────────────────────────────── */

  if (groupId) {
    const group = groupId === LOOSE ? null : groups.find((g) => g.id === groupId);

    if (groupId !== LOOSE && !group) {
      return (
        <>
          {errorNotice}
          <p style={{ color: 'var(--ink-2)', marginBottom: '16px' }}>
             {t('projectUi.missingProject')}
          </p>
           <Link to="/dashboard" className="btn"><ArrowLeft /> {t('projectUi.allProjects')}</Link>
        </>
      );
    }

    const plans = plansIn(groupId);
     const title = group ? group.name : t('projectUi.notInAnyProject');
    const printableCount = plans.filter((p) => p.has_svg_image || p.cutlist_image).length;

    return (
      <>
         <Link to="/dashboard" className="crumb-back"><ArrowLeft />{t('projectUi.allProjects')}</Link>

        {errorNotice}

        <header className="proj-head">
          {group && editingGroup ? (
            nameField(
              editingGroupName, setEditingGroupName,
               () => saveEditGroup(group), cancelEditGroup, t('projectUi.projectName'),
            )
          ) : (
            <h2 className="proj-head-name">
              {title}
              {group && (
                <button
                  type="button"
                  className="name-edit-btn"
                  onClick={() => startEditGroup(group)}
                   aria-label={t('projectUi.rename', { name: group.name })}
                   title={t('projectUi.renameProjectTitle')}
                >
                  <Pencil size={15} />
                </button>
              )}
            </h2>
          )}

          <p className="proj-head-meta">
            {group
               ? `${plans.length ? t(plans.length === 1 ? 'projectUi.printPlan' : 'projectUi.printPlans', { count: plans.length }) : t('projectUi.empty')} · ${t('projectUi.projectCreated', { date: formatDate(group.created_at) })}`
               : `${t(plans.length === 1 ? 'projectUi.printPlan' : 'projectUi.printPlans', { count: plans.length })} ${t('projectUi.savedWithoutProject')}`}
          </p>

          {(printableCount > 0 || group) && (
            <span className="proj-head-act">
              {printableCount > 0 && (
                <span className="print-set">
                  <select
                    className="form-select print-paper"
                    value={paperSize}
                    onChange={(e) => setPaperSize(e.target.value)}
                     aria-label={t('projectUi.paperSize')}
                     title={t('projectUi.paperSizeTitle')}
                  >
                    <option value="a4">A4</option>
                    <option value="letter">Letter</option>
                  </select>
                  <button
                    className="btn"
                    onClick={() => handlePrintAll(plans, title)}
                    disabled={printing}
                     title={t('projectUi.printTitle')}
                  >
                     {printing ? t('projectUi.preparing') : t(printableCount === 1 ? 'projectUi.printPlan' : 'projectUi.printPlans', { count: printableCount })}
                  </button>
                </span>
              )}
              {group && (
                <button
                  className="btn btn-outline-danger"
                  onClick={() => handleDeleteGroup(group, plans.length)}
                  disabled={busyId === group.id}
                >
                   {t('projectUi.deleteProject')}
                </button>
              )}
            </span>
          )}
        </header>

        {plans.length > 0 ? (
          <div className="plan-list">{plans.map(renderPlan)}</div>
        ) : (
          <div className="proj-blank">
            <p>
               {t('projectUi.nothingFiled', { name: title })}
            </p>
             <Link to="/cutting" className="btn btn-primary">{t('projectUi.planACut')}</Link>
          </div>
        )}
        {deleteDialog}
      </>
    );
  }

  /* ── the index: every project, each showing its newest plan ─────────── */

  const shelves = groups.map((group) => ({ id: group.id, name: group.name, plans: plansIn(group.id) }));
  const loose = plansIn(LOOSE);

  return (
    <>
      <div className="section-rule" style={{ marginBottom: '18px' }}>
        <h2 className="section-title">{t('projects.myProjects')}</h2>
        <span className="section-rule-end">
          {allProjects.length > 0 && (
             <span className="folio">{groups.length} {t('ui.project')} · {allProjects.length} {t('workflow.planName').toLowerCase()}</span>
          )}
          <button type="button" className="btn btn-sm" onClick={loadProjects}>{t('projects.refresh')}</button>
        </span>
      </div>

      {errorNotice}

      {shelves.length === 0 && loose.length === 0 && (
        <div className="proj-blank is-first">
          <p>
            {t('projects.nothingSaved')}
          </p>
          <Link to="/cutting" className="btn btn-primary">{t('workflow.planCuts')}</Link>
        </div>
      )}

      {shelves.length > 0 && (
        <div className="proj-grid">
          {shelves.map((shelf) => (
            <Link key={shelf.id} to={`/dashboard/project/${shelf.id}`} className="proj-card">
              <span className="proj-card-cover">
                {shelf.plans.length > 0
                  ? <PlanThumb project={shelf.plans[0]} />
                   : <span className="thumb"><span className="thumb-none">{t('projects.noPlans')}</span></span>}
              </span>
              <span className="proj-card-foot">
                <span className="proj-card-text">
                  <b>{shelf.name}</b>
                  <em>
                    {shelf.plans.length > 0
                       ? t(shelf.plans.length === 1 ? 'projectUi.lastSavedOne' : 'projectUi.lastSaved', { count: shelf.plans.length, date: formatDate(shelf.plans[0].updated_at) })
                       : t('projectUi.noProjectEmpty')}
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
           {t('projectUi.noProjectsYet')}
        </p>
      )}

      {/* Plans nobody filed are not a project, so they are not drawn as one.
          A project is a card with cover art that you open; these are just
          plans, shown as plans, in the open. Giving them a matching card in
          the same grid made the absence of a container look like a container. */}
      {loose.length > 0 && (
        <section className="unfiled">
          <div className="section-rule" style={{ marginBottom: '10px' }}>
             <h3 className="section-title">{t('projectUi.looseTitle')}</h3>
            <span className="folio">{plural(loose.length, 'plan')}</span>
          </div>
          <p className="synthetic" style={{ marginBottom: '16px', maxWidth: 'none' }}>
             {t('projectUi.savedWithoutPicking')}
          </p>
          <div className="plan-list">{loose.slice(0, UNFILED_SHOWN).map(renderPlan)}</div>
          {loose.length > UNFILED_SHOWN && (
            <Link to={`/dashboard/project/${LOOSE}`} className="unfiled-all">
               {t('projectUi.showAll', { count: loose.length })} <ArrowRight />
            </Link>
          )}
        </section>
      )}

      {deleteDialog}
    </>
  );
};

export default UserProjectsContent;
