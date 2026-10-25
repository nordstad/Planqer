import { useTranslation } from 'react-i18next';

// Plans saved before connected strips have no segments; treat them as one face.
const legacyFace = (piece, strip) => ({
  wall_index: piece.wall_index,
  x_start: strip.x_start,
  x_end: strip.x_end,
  notches: piece.notches || [],
});

export const pieceFaces = (piece, strip) => {
  let offset = 0;
  const segments = piece.segments?.length ? piece.segments : [legacyFace(piece, strip)];
  return segments.map((segment) => {
    const face = { ...segment, offset, notches: segment.notches || [] };
    offset += segment.x_end - segment.x_start;
    return face;
  });
};

export const KIND_KEYS = {
  door: 'wallpaperUi.kindDoor', window: 'wallpaperUi.kindWindow', opening: 'wallpaperUi.kindOpening', heat_pump: 'wallpaperUi.kindHeatPump', radiator: 'wallpaperUi.kindRadiator',
  outlet: 'wallpaperUi.kindOutlet', switch: 'wallpaperUi.kindSwitch', pipe: 'wallpaperUi.kindPipe', custom: 'wallpaperUi.kindCustom',
};

const INK = 'var(--ink, #16150f)';
const INK_3 = 'var(--ink-3, #6f6a55)';
const ACCENT = 'var(--accent, #a34f18)';
const CARD = 'var(--card, #ffffff)';
const GROUND = 'var(--ground-2, #f2efe6)';
const LABEL = { fontSize: 15, fontWeight: 700, fill: INK };
const SMALL = { fontSize: 12, fill: INK };
const HALO = { paintOrder: 'stroke', stroke: CARD, strokeWidth: 3 };

// Every opening on a piece, in piece coordinates (mm from the piece's left edge and lower edge).
// `core` is the real opening; the rest of the notch around it is the margin. Plans saved before
// the core was recorded have none, and are drawn as a plain notch.
const openingsOf = (piece, strip) => pieceFaces(piece, strip).flatMap((face) => face.notches.map((notch) => {
  const left = notch.x_start - face.x_start + face.offset;
  const base = { mode: notch.mode, kind: notch.kind, label: notch.label, left, bottom: notch.y_start - piece.y_start, width: notch.x_end - notch.x_start, height: notch.y_end - notch.y_start };
  if (!notch.core) return base;
  const [coreStart, coreBottom, coreEnd, coreTop] = notch.core;
  return { ...base, core: { left: face.offset + coreStart - face.x_start, bottom: coreBottom - piece.y_start, width: coreEnd - coreStart, height: coreTop - coreBottom } };
}));

export const WallpaperPieceDiagram = ({ piece, strip, repeat }) => {
  const { t } = useTranslation();
  const faces = pieceFaces(piece, strip);
  const openings = openingsOf(piece, strip);
  const overlap = strip.return_overlap || 0;
  const faceWidth = strip.width || strip.x_end - strip.x_start;
  const width = faceWidth + overlap;
  // Trim material only sits at the ends of a piece that reaches the ceiling or the floor.
  const atCeiling = piece.y_end >= strip.top_height - 0.5;
  const atFloor = piece.y_start <= (strip.bottom_height ?? 0) + 0.5;
  const trimTop = atCeiling ? strip.allowance_top || 0 : 0;
  const trimBottom = atFloor ? strip.allowance_bottom || 0 : 0;
  const scale = Math.min(230 / width, 270 / (piece.length + trimTop + trimBottom));
  const paperWidth = width * scale;
  const paperHeight = piece.length * scale;
  const left = 270 - paperWidth / 2;
  const top = 62 + trimTop * scale;
  const bottom = top + paperHeight;
  const hatchId = `hatch-${piece.id}`;
  const openingName = (opening) => opening.label || (KIND_KEYS[opening.kind] ? t(KIND_KEYS[opening.kind]) : '');
  return <svg viewBox="0 0 540 462" className="wallpaper-wall-drawing" role="img" aria-label={t('wallpaperUi.pieceAria', { id: piece.id })} fontFamily="Helvetica Neue, Arial, sans-serif">
    <defs><pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill={CARD} /><line x1="0" y1="0" x2="0" y2="6" stroke={ACCENT} strokeWidth="1.5" opacity="0.55" /></pattern></defs>
    <rect x="0" y="0" width="540" height="462" fill={CARD} />
    <text x="28" y="30" {...LABEL}>{t('wallpaperUi.pieceStrip', { id: piece.id, number: piece.strip_number })}</text>
    <line x1="508" y1="92" x2="508" y2="36" stroke={ACCENT} strokeWidth="2" /><polygon points="508,28 502,40 514,40" fill={ACCENT} /><text x="508" y="112" textAnchor="middle" {...LABEL} fill={ACCENT}>{t('wallpaperUi.up')}</text>
    <text x="270" y="52" textAnchor="middle" {...SMALL} fontWeight="700">{atCeiling ? t('wallpaperUi.edgeTopCeiling') : t('wallpaperUi.edgeTop')}</text>
    {trimTop > 0 && <g data-testid="trim-top"><rect x={left} y={62} width={paperWidth} height={trimTop * scale} fill={GROUND} stroke={INK_3} strokeDasharray="3 3" /><text x={left + paperWidth + 8} y={62 + trimTop * scale / 2 + 4} {...SMALL}>{t('wallpaperUi.trimBand', { mm: Math.round(trimTop) })}</text></g>}
    {trimBottom > 0 && <g data-testid="trim-bottom"><rect x={left} y={bottom} width={paperWidth} height={trimBottom * scale} fill={GROUND} stroke={INK_3} strokeDasharray="3 3" /><text x={left + paperWidth + 8} y={bottom + trimBottom * scale / 2 + 4} {...SMALL}>{t('wallpaperUi.trimBand', { mm: Math.round(trimBottom) })}</text></g>}
    <rect x={left} y={top} width={paperWidth} height={paperHeight} fill={GROUND} stroke={INK} strokeWidth="2" />
    {overlap > 0 && <line x1={left + faceWidth * scale} x2={left + faceWidth * scale} y1={top} y2={bottom} stroke={ACCENT} strokeDasharray="2 3" />}
    {faces.slice(1).map((face) => <line key={`fold-${face.offset}`} x1={left + face.offset * scale} x2={left + face.offset * scale} y1={top} y2={bottom} stroke={INK_3} strokeDasharray="2 3" />)}
    {openings.map((opening, index) => {
      const box = (rect) => ({ x: left + rect.left * scale, y: bottom - (rect.bottom + rect.height) * scale, width: rect.width * scale, height: rect.height * scale });
      const dashed = opening.mode === 'mark' ? '5 4' : undefined;
      const modeLabel = opening.mode === 'mark' ? t('wallpaperUi.markOnWall') : t('wallpaperUi.tableCut');
      const margin = box(opening);
      if (!opening.core) {
        return <g key={index}><rect {...margin} fill={CARD} stroke={ACCENT} strokeWidth="2" strokeDasharray={dashed} /><text x={margin.x + margin.width / 2} y={margin.y + margin.height / 2} textAnchor="middle" {...SMALL}>{modeLabel}</text><text x={margin.x + margin.width / 2} y={margin.y + margin.height / 2 + 13} textAnchor="middle" {...SMALL}>{Math.round(opening.width)} × {Math.round(opening.height)} mm</text></g>;
      }
      const core = box(opening.core);
      const name = openingName(opening);
      const roomy = core.width >= 90 && core.height >= 40;
      const textX = roomy ? core.x + core.width / 2 : core.x + core.width + 6;
      const textY = core.y + core.height / 2 - 6;
      const anchor = roomy ? 'middle' : 'start';
      const midY = core.y + core.height / 2;
      const midX = core.x + core.width / 2;
      const fromTop = Math.round(piece.y_end - (piece.y_start + opening.core.bottom + opening.core.height));
      const fromLeft = Math.round(opening.core.left);
      return <g key={index} data-testid="piece-opening">
        <rect {...margin} fill={`url(#${hatchId})`} stroke={ACCENT} strokeWidth="1" strokeDasharray="2 2" />
        <rect {...core} fill={CARD} stroke={ACCENT} strokeWidth="2.5" strokeDasharray={dashed} />
        <text x={textX} y={textY} textAnchor={anchor} {...SMALL} fontWeight="700" {...(roomy ? {} : HALO)}>{name}</text>
        <text x={textX} y={textY + 13} textAnchor={anchor} {...SMALL} {...(roomy ? {} : HALO)}>{Math.round(opening.core.width)} × {Math.round(opening.core.height)} mm</text>
        <text x={textX} y={textY + 26} textAnchor={anchor} {...SMALL} fill={ACCENT} {...(roomy ? {} : HALO)}>{modeLabel}</text>
        <line x1={midX} y1={top} x2={midX} y2={core.y} stroke={INK_3} strokeDasharray="3 2" /><line x1={midX - 4} y1={top} x2={midX + 4} y2={top} stroke={INK_3} />
        <text x={midX + 4} y={(top + core.y) / 2 + 4} {...SMALL} fontWeight="700" {...HALO}>{fromTop}</text>
        <line x1={left} y1={midY} x2={core.x} y2={midY} stroke={INK_3} strokeDasharray="3 2" /><line x1={left} y1={midY - 4} x2={left} y2={midY + 4} stroke={INK_3} />
        <text x={(left + core.x) / 2} y={midY - 4} textAnchor="middle" {...SMALL} fontWeight="700" {...HALO}>{fromLeft}</text>
        {opening.width - opening.core.width > 0 && <title>{t('wallpaperUi.marginLabel', { mm: Math.round((opening.width - opening.core.width) / 2) })}</title>}
      </g>;
    })}
    <line x1={left - 24} y1={top} x2={left - 24} y2={bottom} stroke={INK_3} /><text x={left - 32} y={top + paperHeight / 2} textAnchor="middle" transform={`rotate(-90 ${left - 32} ${top + paperHeight / 2})`} {...SMALL}>{t('wallpaperUi.precut', { mm: Math.round(piece.length) })}</text>
    <text x="270" y={bottom + trimBottom * scale + 16} textAnchor="middle" {...SMALL} fontWeight="700">{atFloor ? t('wallpaperUi.edgeBottomFloor') : t('wallpaperUi.edgeBottom')}</text>
    <line x1={left} y1="392" x2={left + paperWidth} y2="392" stroke={INK_3} /><line x1={left} y1="387" x2={left} y2="397" stroke={INK_3} /><line x1={left + paperWidth} y1="387" x2={left + paperWidth} y2="397" stroke={INK_3} /><text x={left + paperWidth / 2} y="408" textAnchor="middle" {...SMALL}>{overlap > 0 ? t('wallpaperUi.finishedWidthWrap', { width: Math.round(faceWidth), wrap: Math.round(overlap) }) : t('wallpaperUi.finishedWidth', { mm: Math.round(width) })}</text>
    <text x="28" y="428" {...SMALL}>{repeat ? t('wallpaperUi.phaseRepeat', { phase: Math.round(piece.phase), repeat: Math.round(repeat) }) : t('wallpaperUi.phaseOnly', { phase: Math.round(piece.phase) })}</text><text x="28" y="444" {...SMALL} fill={INK_3}>{t('wallpaperUi.diagramLegend')}</text><text x="28" y="458" {...SMALL} fill={INK_3}>{t('wallpaperUi.hatchLegend')}</text>
  </svg>;
};

export default WallpaperPieceDiagram;
