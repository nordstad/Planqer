import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import CatalogPage from './CatalogPage';
import { BoardIcon, SheetIcon, CubeIcon, TileIcon, WallpaperIcon } from './icons';
import { getHealth, getLatestRelease } from '../utils/api';
import { isStaticMode } from '../utils/mode';
import { version as appVersion } from '../../package.json';
import heroIllustration from '../assets/planqer-hero-animated.svg?raw';

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
    path: '/wallpaper',
    title: 'home.wallpaperTitle',
    body: 'home.wallpaperDescription',
    Icon: WallpaperIcon,
  },
  {
    path: '/model-cutlist',
    title: 'home.modelTitle',
    body: 'home.modelDescription',
    Icon: CubeIcon,
  },
];

/* The materials each tool plans, cut into their plans by a passing blade.
   The SVG animates itself once when it is added, so it is only mounted when
   it first scrolls into view; on a phone it sits below the cards. It is
   inlined rather than an <img> so its prefers-reduced-motion rule applies. */
const CutPlanPreview = () => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    }, { threshold: 0.4 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="hp-visual"
      aria-hidden="true"
      dangerouslySetInnerHTML={inView ? { __html: heroIllustration } : undefined}
    />
  );
};

const HomePage = () => {
  const { t } = useTranslation();
  const [version, setVersion] = useState(appVersion);
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
          {t('home.titleLineOne')}<br /><em>{t('home.build')}</em> {t('home.titleLineTwo')}
        </h1>
        <p className="hp-lede">
          {t('home.lede')}
        </p>
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
               <h2>{t(title)}</h2>
               <p>{t(body)}</p>
              </div>
              <span className="hp-card-arrow">→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>

    {!isStaticMode() && <footer className="hp-footer">
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
    </footer>}
  </CatalogPage>
  );
};

export default HomePage;
