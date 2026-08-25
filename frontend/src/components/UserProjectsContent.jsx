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
  downloadProjectImage, getProjectGroups, renameProjectGroup, deleteProjectGroup,
} from '../utils/api';
import { svgBlobToPngBlob } from '../utils/svgToPng';
import { printProjectPlans } from '../utils/printProject';
import { useAuth } from '../contexts/AuthContext';
import Loader from './Loader';
import PlanThumb from './PlanThumb';
import ConfirmDialog from './ConfirmDialog';
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

const totalParts = (partsData, projectType) => {
  if (projectType === 'sheet') {
    return Array.isArray(partsData) ? partsData.reduce((sum, p) => sum + (parseInt(p.quantity, 10) || 0), 0) : 0;
  }
  return partsData && typeof partsData === 'object'
    ? Object.values(partsData).reduce((sum, qty) => sum + qty, 0)
    : 0;
};

const stockLine = (project) => (project.projectType === 'sheet'
  ? `${project.sheet_width}×${project.sheet_height}mm · ${project.material_type}`
  : `${project.board_lengths.join(', ')}mm · ${project.saw_blade_width}mm kerf`);

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

  useEffect(() => {
    if (user) loadProjects();
  }, [user]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError('');

      const [boardProjects, sheetProjects, projectGroups] = await Promise.all([
        getUserProjects(),
        getUserSheetProjects(),
        getProjectGroups(),
      ]);

      const combined = [
        ...boardProjects.map((p) => ({ ...p, projectType: 'board' })),
        ...sheetProjects.map((p) => ({ ...p, projectType: 'sheet' })),
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
      const kind = project.projectType === 'sheet' ? 'Sheet Layout' : 'Cutlist';
      triggerDownload(blob, `${project.name} - ${kind}.${format}`);
    } catch (err) {
      setError(err.message.includes('404')
        ? `No diagram was saved with "${project.name}", so there is nothing to download. Re-run the plan and save it again.`
        : `Could not build the ${format.toUpperCase()} — ${err.message}.`);
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
      const withDiagrams = await Promise.all(printable.map(async (p) => ({
        name: p.name,
        facts: [
          p.projectType === 'sheet' ? 'Sheet' : 'Board',
          plural(totalParts(p.parts_data, p.projectType), 'part'),
          stockLine(p),
          `saved ${formatDate(p.created_at)}`,
        ],
        svgBlob: await downloadProjectImage(p.id, p.projectType),
      })));
      await printProjectPlans({
        title,
        meta: `${plural(printable.length, 'plan')} · printed ${formatDate(new Date())}`,
        paper: paperSize,
        plans: withDiagrams,
      });
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

  const renderPlan = (project) => {
    const hasDiagram = Boolean(project.has_svg_image || project.cutlist_image);

    return (
      <article className="plan-item" key={project.id}>
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
            <span className="plan-item-type">{project.projectType === 'sheet' ? 'Sheet' : 'Board'}</span>
            <span>{plural(totalParts(project.parts_data, project.projectType), 'part')}</span>
            <span>{stockLine(project)}</span>
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
            That project no longer exists.
          </p>
          <Link to="/dashboard" className="btn"><ArrowLeft /> All projects</Link>
        </>
      );
    }

    const plans = plansIn(groupId);
    const title = group ? group.name : 'Not in any project';
    const printableCount = plans.filter((p) => p.has_svg_image || p.cutlist_image).length;

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
                <span className="print-set">
                  <select
                    className="form-select print-paper"
                    value={paperSize}
                    onChange={(e) => setPaperSize(e.target.value)}
                    aria-label="Paper size for printing"
                    title="Paper size"
                  >
                    <option value="a4">A4</option>
                    <option value="letter">Letter</option>
                  </select>
                  <button
                    className="btn"
                    onClick={() => handlePrintAll(plans, title)}
                    disabled={printing}
                    title="One document with every plan on its own page — print it or save it as a PDF"
                  >
                    {printing ? 'Preparing…' : `Print ${plural(printableCount, 'plan')}`}
                  </button>
                </span>
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
          <div className="plan-list">{plans.map(renderPlan)}</div>
        ) : (
          <div className="proj-blank">
            <p>
              Nothing filed here yet. Run a plan, then pick <b>{title}</b> as its project
              on the save step and it lands here.
            </p>
            <Link to="/cutting" className="btn btn-primary">Plan a cut</Link>
          </div>
        )}
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

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete"
        message={pendingDelete?.message}
        onConfirm={() => { pendingDelete.run(); setPendingDelete(null); }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
};

export default UserProjectsContent;
