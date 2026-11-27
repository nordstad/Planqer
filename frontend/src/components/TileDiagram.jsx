import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildCutList } from '../utils/tileCutList';

// The API stores a complete SVG image. Match its top-level tile shapes in
// drawing order; never guess positions when an older diagram differs.
const diagramShapes = (candidate) => {
  try {
    const url = candidate.visualization;
    if (!url?.startsWith('data:image/svg+xml;base64,') || !candidate.tiles?.length) return null;
    const source = new TextDecoder().decode(Uint8Array.from(atob(url.split(',')[1]), (char) => char.charCodeAt(0)));
    const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
    let viewBox = svg.getAttribute('viewBox');
    if (svg.localName !== 'svg' || !viewBox) return null;
    const surface = Array.from(svg.children).find((element) =>
      element.localName === 'rect' && (element.getAttribute('data-tile-surface') === 'true'
        || (element.getAttribute('x') === '40' && element.getAttribute('y') === '40')));
    let displayUrl = url;
    if (surface) {
      const width = Number(surface.getAttribute('width'));
      const height = Number(surface.getAttribute('height'));
      if (width > 0 && height > 0) {
        const x = Number(surface.getAttribute('x'));
        const y = Number(surface.getAttribute('y'));
        viewBox = `${x - 1} ${y - 1} ${width + 2} ${height + 2}`;
        svg.setAttribute('viewBox', viewBox);
        svg.setAttribute('width', width + 2);
        svg.setAttribute('height', height + 2);
        const bytes = new TextEncoder().encode(new XMLSerializer().serializeToString(svg));
        displayUrl = `data:image/svg+xml;base64,${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))}`;
      }
    }
    const colors = new Set(candidate.tiles.map((tile) => tile.fill_color?.toLowerCase()).filter(Boolean));
    const elements = Array.from(svg.children).filter((element) =>
      ['rect', 'polygon'].includes(element.localName) && colors.has(element.getAttribute('fill')?.toLowerCase()));
    const shapes = candidate.tiles.map((tile, index) => {
      const color = tile.fill_color?.toLowerCase();
      if (!color) return null;
      const element = elements[index];
      if (!element || element.getAttribute('fill')?.toLowerCase() !== color) return null;
      const attributes = element.localName === 'rect'
        ? Object.fromEntries(['x', 'y', 'width', 'height'].map((name) => [name, element.getAttribute(name)]))
        : { points: element.getAttribute('points') };
      return { tag: element.localName, attributes, full: tile.kind === 'full', label: tile.kind !== 'full' && candidate.piece_diagrams?.[tile.size_label] ? tile.size_label : null };
    });
    return shapes.every(Boolean) ? { viewBox, shapes, displayUrl, cropped: !!surface } : null;
  } catch {
    return null;
  }
};

const TileDiagram = ({ candidate, onSelect, onHighlight, highlightedLabel, alt, className }) => {
  const { t } = useTranslation();
  const diagram = useMemo(() => diagramShapes(candidate), [candidate]);
  const [preview, setPreview] = useState(null);
  const tooltipId = useId();
  const cutList = useMemo(() => buildCutList(candidate.tiles || []), [candidate.tiles]);
  const showPreview = (event, label) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX || rect.left + rect.width / 2;
    const y = event.clientY || rect.top + rect.height / 2;
    setPreview({ label, x, y });
    onHighlight?.(label);
  };
  const hidePreview = () => { setPreview(null); onHighlight?.(null); };
  const group = preview && cutList.cutGroups.find((item) => item.label === preview.label);
  return (
    <>
    <div className={`tile-diagram ${className || ''}`}>
      <img src={diagram?.displayUrl || candidate.visualization} alt={alt} />
      {diagram && (
        <svg className="tile-diagram-targets" viewBox={diagram.viewBox} aria-label={t('ui.tileDiagramAlt')}>
          {diagram.shapes.map((shape, index) => shape.full ? (
            <shape.tag key={index} {...shape.attributes} className={`tile-diagram-full${highlightedLabel === '__full__' ? ' is-list-highlighted' : ''}`} onPointerEnter={(event) => showPreview(event, '__full__')} onPointerMove={(event) => showPreview(event, '__full__')} onPointerLeave={hidePreview}>
              <title>{t('ui.fullTile')} — {t('ui.noCutNeeded')}</title>
            </shape.tag>
          ) : shape.label && (
            <shape.tag
              key={index}
              {...shape.attributes}
              className={highlightedLabel === shape.label ? 'is-list-highlighted' : undefined}
              role="button"
              tabIndex="0"
              aria-label={t('ui.viewCut', { label: shape.label })}
              aria-describedby={preview?.label === shape.label ? tooltipId : undefined}
              onPointerEnter={(event) => showPreview(event, shape.label)}
              onPointerMove={(event) => showPreview(event, shape.label)}
              onPointerLeave={hidePreview}
              onFocus={(event) => showPreview(event, shape.label)}
              onBlur={hidePreview}
              onClick={() => { hidePreview(); onSelect(shape.label); }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  hidePreview();
                  onSelect(shape.label);
                }
              }}
            />
          ))}
        </svg>
      )}
    </div>
    {diagram?.cropped && (
      <div className="tile-diagram-legend">
        <span><i className="tile-legend-full" />{t('ui.fullTile')}</span>
        <span><i className="tile-legend-notched" />{t('ui.diagramNotched')}</span>
        <span><i className="tile-legend-sliver" />{t('ui.sliver')}</span>
      </div>
    )}
    {diagram?.shapes.some((shape) => shape.label) && <p className="tile-diagram-hint">{t('ui.tileDiagramHint')}</p>}
    {preview && (group || preview.label === '__full__') && (
      <div id={tooltipId} className="tile-diagram-preview" role="tooltip" style={{ left: `clamp(8px, ${preview.x + 14}px, calc(100vw - 230px))`, top: `clamp(8px, ${preview.y + 14}px, calc(100vh - 100px))` }}>
        {group ? (
          <>
            <strong>{t('ui.cutPreviewLabel', { label: group.label })}</strong>
            <span>{t('workflow.sizeMm')}: {group.width} × {group.height} · {t('workflow.qty')}: {group.count}</span>
          </>
        ) : (
          <><strong>{t('ui.fullTile')}</strong><span>{t('ui.noCutNeeded')} · {t('workflow.qty')}: {cutList.fullCount}</span></>
        )}
      </div>
    )}
    </>
  );
};

export default TileDiagram;
