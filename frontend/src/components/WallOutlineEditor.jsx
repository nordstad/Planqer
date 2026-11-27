import { useTranslation } from 'react-i18next';
import FormField from './FormField';

const numeric = (value) => Number(value) || 0;

const VIEW = { x: 150, y: 80, drawWidth: 400, drawHeight: 200 };

const outlineVertices = (wall) => {
  const width = numeric(wall.width_top);
  return [[0, numeric(wall.lower_left)], [width, numeric(wall.lower_right)], [width, numeric(wall.height_right)], [0, numeric(wall.height_left)]];
};

const dimensionsFor = (wall, scaleX, scaleY, t) => {
  const width = numeric(wall.width_top);
  const upperLeft = [scaleX(0), scaleY(numeric(wall.height_left))];
  const upperRight = [scaleX(width), scaleY(numeric(wall.height_right))];
  const lowerLeft = [scaleX(0), scaleY(numeric(wall.lower_left))];
  const lowerRight = [scaleX(width), scaleY(numeric(wall.lower_right))];
  return [
    { field: 'height_left', label: t('wallpaperUi.dimUpperLeft'), dot: upperLeft },
    { field: 'height_right', label: t('wallpaperUi.dimUpperRight'), dot: upperRight },
    { field: 'lower_left', label: t('wallpaperUi.dimLowerLeft'), dot: lowerLeft },
    { field: 'lower_right', label: t('wallpaperUi.dimLowerRight'), dot: lowerRight },
    { field: 'width', label: t('wallpaperUi.dimWallWidth'), dot: null },
  ];
};

const WallOutlineEditor = ({ wall, onChange }) => {
  const { t } = useTranslation();
  const vertices = outlineVertices(wall);
  const maxWidth = Math.max(1, ...vertices.map(([x]) => x));
  const maxHeight = Math.max(1, ...vertices.map(([, y]) => y));
  const scaleX = (value) => VIEW.x + (value / maxWidth) * VIEW.drawWidth;
  const scaleY = (value) => VIEW.y + VIEW.drawHeight - (value / maxHeight) * VIEW.drawHeight;
  const path = `M ${vertices.map(([x, y]) => `${scaleX(x)} ${scaleY(y)}`).join(' L ')} Z`;
  const dimensions = dimensionsFor(wall, scaleX, scaleY, t);
  const valueOf = (field) => (field === 'width' ? wall.width_top : wall[field]);
  const change = (field, value) => onChange(field === 'width' ? { width_top: value, width_middle: value, width_bottom: value } : { [field]: value });
  const guideLabel = t('wallpaperUi.outlineGuide');
  return <figure className="wallpaper-measurement-guide" aria-label={t('wallpaperUi.outlineAria')}>
    <div className="wall-outline-layout">
    <div className="wall-outline-drawing">
    <svg viewBox="120 55 460 255" role="img" aria-label={guideLabel}>
      <path d={path} fill="var(--ground-2)" stroke="var(--ink)" strokeWidth="2" />
      <line x1={VIEW.x - 20} x2={VIEW.x + VIEW.drawWidth + 20} y1={scaleY(0)} y2={scaleY(0)} stroke="var(--ink-3)" strokeDasharray="6 4" />
      {dimensions.map((dimension) => <g key={dimension.field}>
        {dimension.dot && <circle cx={dimension.dot[0]} cy={dimension.dot[1]} r="4" fill="var(--accent)" />}
      </g>)}
    </svg>
    <span className="synthetic">{t('wallpaperUi.levelDatum')}</span>
    </div>
    {dimensions.map(({ field, label }) => <div key={field} style={{ gridArea: field }}>
      <FormField label={t('wallpaperUi.dimWithMm', { label })} required><input className="form-input" inputMode="numeric" value={valueOf(field)} onChange={(event) => change(field, event.target.value)} /></FormField>
    </div>)}
    </div>
    <figcaption>{`${guideLabel} ${t('wallpaperUi.outlineRedraws')}`}</figcaption>
  </figure>;
};

export default WallOutlineEditor;
