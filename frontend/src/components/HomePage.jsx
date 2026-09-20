import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CatalogPage from './CatalogPage';
import { BoardIcon, SheetIcon, CubeIcon, TileIcon, ArrowRight } from './icons';
import { getHealth, getLatestRelease } from '../utils/api';
import packageJson from '../../package.json';

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
    title: 'home.boardTitle',
    body: 'home.boardDescription',
    Icon: BoardIcon,
  },
  {
    path: '/sheet-cutting',
    title: 'home.sheetTitle',
    body: 'home.sheetDescription',
    Icon: SheetIcon,
  },
  {
    path: '/tile-layout',
    title: 'home.tileTitle',
    body: 'home.tileDescription',
    Icon: TileIcon,
  },
  {
    path: '/model-cutlist',
    title: 'home.modelTitle',
    body: 'home.modelDescription',
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

const CutPlanPreview = ({ t }) => (
  <div className="hp-visual">
    <div className="hp-visual-label">{t('home.samplePlan', { count: SAMPLE.parts })}</div>
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
    <div className="hp-visual-more">{t('home.moreBoards', { count: SAMPLE.boards - 3 })}</div>
    <p className="hp-visual-caption">
      <b>{t('home.sampleCaptionBoards', { count: SAMPLE.boards })}</b> · {t('home.sampleCaption', { waste: SAMPLE.waste, kerf: SAMPLE.kerf })}
    </p>
  </div>
);

const HomePage = () => {
  const { t } = useTranslation();
  const [version, setVersion] = useState(packageJson.version);
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
          {t('home.titleLineOne')}<br />{t('home.titleLineTwo')} <em>{t('home.cut')}</em>.
        </h1>
        <p className="hp-lede">
          {t('home.lede')}
        </p>
        <div className="hp-actions">
          <Link to="/cutting" className="btn-primary hp-cta">
            {t('home.planCut')} <ArrowRight size={15} />
          </Link>
          <Link to="/model-cutlist" className="hp-alt">{t('home.startFromModel')}</Link>
        </div>
      </div>

      <div className="hp-visual-area">
         <CutPlanPreview t={t} />
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
               <h2>{t(title)}</h2>
               <p>{t(body)}</p>
              </div>
              <span className="hp-card-arrow">→</span>
            </Link>
          ))}
        </div>
        <p className="hp-note">
           {t('home.noteBefore')} <b>{t('home.noteDiagram')}</b> — {t('home.noteRunsOn')} <b>{t('home.noteComputer')}</b>.
           {t('home.noteAccount')}
        </p>
      </div>
    </div>

    <footer className="hp-footer">
      <div>
         <Link to="/help">{t('home.helpDocumentation')}</Link>
        <a href="https://github.com/nordstad/Planqer" target="_blank" rel="noopener noreferrer">
           {t('home.sourceGithub')}
        </a>
        <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener noreferrer">
           {t('home.mitLicence')}
        </a>
      </div>
<span>
         {t('home.footerPrivacy')}{version ? ` · v${version}` : ''}
        {updateAvailable && (
          <>
            {' · '}
            <a href="https://github.com/nordstad/Planqer/releases/latest" target="_blank" rel="noopener noreferrer">
               {t('home.versionAvailable', { version: latestVersion })}
            </a>
          </>
        )}
      </span>
    </footer>
  </CatalogPage>
  );
};

export default HomePage;
