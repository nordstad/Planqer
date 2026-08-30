import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CatalogPage from './CatalogPage';
import { BoardIcon, SheetIcon, CubeIcon, ArrowRight } from './icons';
import { getHealth, getLatestRelease } from '../utils/api';

// Compares two dotted version strings, e.g. isNewer('0.2.0', '0.1.0') -> true
const isNewer = (latest, current) => {
  const a = latest.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
};

const TOOLS = [
  {
    path: '/cutting',
    title: 'Board cutting',
    body: 'Type part lengths and board stock. Boards, lumber, pipe.',
    Icon: BoardIcon,
  },
  {
    path: '/sheet-cutting',
    title: 'Sheet cutting',
    body: 'Nest rectangular parts on plywood, MDF, metal, glass.',
    Icon: SheetIcon,
  },
  {
    path: '/model-cutlist',
    title: '3D model',
    body: 'Upload an STL or STEP file — the model you already designed.',
    Icon: CubeIcon,
  },
];

/* One real solver run — parts {270:4, 179:8, 90:16, 81:4} on 300/360/500mm
   stock at 3mm kerf — used verbatim as the hero's proof. Not a live call:
   an honest, fixed example, not a fabricated metric. */
const SAMPLE = {
  boards: 10,
  parts: 32,
  waste: 458,
  kerf: 66,
};

const CutPlanPreview = () => (
  <div className="hp-visual">
    <div className="hp-visual-label">One real plan — {SAMPLE.parts} parts in</div>
    <div className="hp-plate">
      <div className="hp-plate-cut" style={{ flex: 270 }}>270</div>
      <div className="hp-plate-kerf" />
      <div className="hp-plate-cut" style={{ flex: 179 }}>179</div>
      <div className="hp-plate-kerf" />
      <div className="hp-plate-cut hp-plate-waste" style={{ flex: 48 }} />
    </div>
    <div className="hp-plate hp-plate-mini">
      <div className="hp-plate-cut" style={{ flex: 179 }} />
      <div className="hp-plate-kerf" />
      <div className="hp-plate-cut" style={{ flex: 179 }} />
      <div className="hp-plate-kerf" />
      <div className="hp-plate-cut" style={{ flex: 90 }} />
      <div className="hp-plate-cut hp-plate-waste" style={{ flex: 48 }} />
    </div>
    <div className="hp-plate hp-plate-mini">
      <div className="hp-plate-cut" style={{ flex: 90 }} />
      <div className="hp-plate-kerf" />
      <div className="hp-plate-cut" style={{ flex: 90 }} />
      <div className="hp-plate-kerf" />
      <div className="hp-plate-cut" style={{ flex: 90 }} />
      <div className="hp-plate-kerf" />
      <div className="hp-plate-cut" style={{ flex: 90 }} />
      <div className="hp-plate-cut hp-plate-waste" style={{ flex: 14 }} />
    </div>
    <div className="hp-visual-more">+ 7 more boards →</div>
    <p className="hp-visual-caption">
      <b>{SAMPLE.boards} boards</b> total · {SAMPLE.waste}mm waste · {SAMPLE.kerf}mm kerf — the exact output for this plan.
    </p>
  </div>
);

const HomePage = () => {
  const [version, setVersion] = useState(null);
  const [latestVersion, setLatestVersion] = useState(null);

  useEffect(() => {
    getHealth()
      .then((data) => setVersion(data.version))
      .catch(() => {});
    getLatestRelease()
      .then((tag) => setLatestVersion(tag.replace(/^v/, '')))
      .catch(() => {});
  }, []);

  const updateAvailable = version && latestVersion && isNewer(latestVersion, version);

  return (
  <CatalogPage>
    <div className="hp-top">
      <div className="hp-hero-text">
        <h1 className="hp-h1">
          Know what to buy.<br />Know where to <em>cut</em>.
        </h1>
        <p className="hp-lede">
          Guessing at material means paying for boards you didn't need, or coming up short at
          the saw. Give Planqer your part list — or the model you already designed — and get
          the fewest boards to buy, and exactly where to cut them.
        </p>
        <div className="hp-actions">
          <Link to="/cutting" className="btn-primary hp-cta">
            Plan a cut <ArrowRight size={15} />
          </Link>
          <Link to="/model-cutlist" className="hp-alt">or start from your 3D model</Link>
        </div>
      </div>

      <div className="hp-visual-area">
        <CutPlanPreview />
      </div>

      {/* a tape-measure rule dividing the pitch from the launcher — the
          direction's motif drawn in CSS, not a decorative image */}
      <div className="hp-rule" aria-hidden="true" />

      <div className="hp-grid-area">
        <div className="hp-grid">
          {TOOLS.map(({ path, title, body, Icon }) => (
            <Link key={path} to={path} className="hp-card">
              <div className="hp-card-ic"><Icon size={22} /></div>
              <div>
                <h2>{title}</h2>
                <p>{body}</p>
              </div>
              <span className="hp-card-arrow">→</span>
            </Link>
          ))}
        </div>
        <p className="hp-note">
          Also draws <b>a diagram for every board or sheet</b> — and runs on <b>your own computer</b>.
          No account is needed; signing in is optional and stays on this instance.
        </p>
      </div>
    </div>

    <footer className="hp-footer">
      <div>
        <Link to="/help">Help &amp; documentation</Link>
        <a href="https://gitlab.com/borkempire/planqer" target="_blank" rel="noopener noreferrer">
          Source on GitLab
        </a>
        <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener noreferrer">
          MIT licence
        </a>
      </div>
<span>
        No cloud account · no tracking · no analytics{version ? ` · v${version}` : ''}
        {updateAvailable && (
          <>
            {' · '}
            <a href="https://github.com/nordstad/Planqer/releases/latest" target="_blank" rel="noopener noreferrer">
              v{latestVersion} available
            </a>
          </>
        )}
      </span>
    </footer>
  </CatalogPage>
  );
};

export default HomePage;
