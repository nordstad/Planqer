import { useTranslation } from 'react-i18next';

const numeric = (value) => Number(value) || 0;

const VIEW = { width: 700, height: 400, x: 150, y: 80, drawWidth: 400, drawHeight: 200 };
const FIELD = { width: 120, height: 62 };

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
    { field: 'height_left', label: t('wallpaperUi.dimUpperLeft'), dot: upperLeft, box: [upperLeft[0] - FIELD.width - 14, upperLeft[1] - FIELD.height / 2] },
    { field: 'lower_left', label: t('wallpaperUi.dimLowerLeft'), dot: lowerLeft, box: [lowerLeft[0] - FIELD.width - 14, lowerLeft[1] - FIELD.height / 2] },
    { field: 'height_right', label: t('wallpaperUi.dimUpperRight'), dot: upperRight, box: [upperRight[0] + 14, upperRight[1] - FIELD.height / 2] },
    { field: 'lower_right', label: t('wallpaperUi.dimLowerRight'), dot: lowerRight, box: [lowerRight[0] + 14, lowerRight[1] - FIELD.height / 2] },
    { field: 'width', label: t('wallpaperUi.dimWallWidth'), dot: null, box: [scaleX(width / 2) - FIELD.width / 2, VIEW.y + VIEW.drawHeight + 38] },
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
    <svg viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} role="group" aria-label={guideLabel}>
      <path d={path} fill="var(--ground-2)" stroke="var(--ink)" strokeWidth="2" />
      <g><line x1={VIEW.x - 20} x2={VIEW.x + VIEW.drawWidth + 20} y1={scaleY(0)} y2={scaleY(0)} stroke="var(--ink-3)" strokeDasharray="6 4" /><text x={VIEW.x + VIEW.drawWidth / 2} y={scaleY(0) + 14} textAnchor="middle" className="wallpaper-svg-small">{t('wallpaperUi.levelDatum')}</text></g>
      {dimensions.map((dimension) => <g key={dimension.field}>
        {dimension.dot && <circle cx={dimension.dot[0]} cy={dimension.dot[1]} r="4" fill="var(--accent)" />}
        {dimension.dot && <line x1={dimension.dot[0]} y1={dimension.dot[1]} x2={dimension.box[0] < dimension.dot[0] ? dimension.box[0] + FIELD.width : dimension.box[0]} y2={dimension.box[1] + FIELD.height / 2} stroke="var(--accent)" strokeDasharray="3 3" />}
        <foreignObject x={dimension.box[0]} y={dimension.box[1]} width={FIELD.width} height={FIELD.height}>
          <label className="form-label" style={{ fontSize: '11px', margin: 0 }}>{t('wallpaperUi.dimWithMm', { label: dimension.label })}<input className="form-input" style={{ padding: '2px 6px', width: '100%' }} inputMode="decimal" value={valueOf(dimension.field)} onChange={(event) => change(dimension.field, event.target.value)} aria-label={t('wallpaperUi.dimWithMm', { label: dimension.label })} /></label>
        </foreignObject>
      </g>)}
    </svg>
    <figcaption>{`${guideLabel} ${t('wallpaperUi.outlineRedraws')}`}</figcaption>
  </figure>;
};

export default WallOutlineEditor;
