const labelKeys = {
  'Full tile at bottom-left corner': 'ui.candidateBottomLeft',
  'Full tile at bottom-right corner': 'ui.candidateBottomRight',
  'Full tile at top-left corner': 'ui.candidateTopLeft',
  'Full tile at top-right corner': 'ui.candidateTopRight',
  'Best sliver avoidance': 'ui.candidateBestSliverAvoidance',
  'Fewest tiles to buy': 'ui.candidateFewestTiles',
  'Most symmetric': 'ui.candidateMostSymmetric',
  'Fewest cuts': 'ui.candidateFewestCuts',
};

export const tileDiagramLabels = (count, t) => ({
  title: t('ui.tileLayout'), surface: t('workflow.surface'),
  full: t('ui.fullTile'), notched: t('ui.diagramNotched'), sliver: t('ui.sliver'),
  cuts: t('documentUi.cutSizesLegend', { count }),
});

export const tileCandidateLabel = (label, t) => {
  const rotated = label.endsWith(' (rotated)');
  const labels = (rotated ? label.slice(0, -10) : label).split(' & ');
  if (labels.every((part) => Object.hasOwn(labelKeys, part))) {
    const translated = labels.map((part) => t(labelKeys[part])).join(' & ');
    return rotated ? t('ui.candidateRotated', { label: translated }) : translated;
  }
  const alternative = /^Alternative (\d+)$/.exec(label);
  return alternative ? t('ui.candidateAlternative', { number: alternative[1] }) : label;
};

// Only fresh solver output goes through this adapter. Saved diagrams remain
// snapshots in their recorded language; user names and geometry are never edited.
export const localizeTileImage = (url, t, hasName) => {
  if (!url?.startsWith('data:image/svg+xml;base64,')) return url;
  const source = new TextDecoder().decode(Uint8Array.from(atob(url.split(',')[1]), (char) => char.charCodeAt(0)));
  const svg = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (svg.documentElement.localName !== 'svg') return url;
  const terms = { 'Full tile': 'ui.fullTile', Notched: 'ui.diagramNotched', Sliver: 'ui.sliver' };
  svg.querySelectorAll('.legend-text').forEach((text) => {
    const key = terms[text.textContent];
    const sizes = /^(\d+) cut sizes? — see cut list$/.exec(text.textContent);
    if (key) text.textContent = t(key);
    else if (sizes) text.textContent = t('documentUi.cutSizesLegend', { count: Number(sizes[1]) });
  });
  const info = svg.querySelector('.surface-info');
  const dimensions = /^Surface: (.+) × (.+) mm$/.exec(info?.textContent || '');
  if (dimensions) info.textContent = t('ui.tileSurfaceSize', { width: dimensions[1], height: dimensions[2] });
  if (!hasName) svg.querySelectorAll('.surface-title').forEach((text) => { text.textContent = t('ui.tileLayout'); });
  const bytes = new TextEncoder().encode(new XMLSerializer().serializeToString(svg));
  return `data:image/svg+xml;base64,${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))}`;
};
