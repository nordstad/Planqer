import i18n from '../i18n';
import { localizeTileImage, tileCandidateLabel } from './tileLocalization';

const encode = (svg) => `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(svg)))}`;
const decode = (url) => new TextDecoder().decode(Uint8Array.from(atob(url.split(',')[1]), (char) => char.charCodeAt(0)));
const source = encode('<svg xmlns="http://www.w3.org/2000/svg"><text class="surface-title">Tile layout</text><text class="surface-info">Surface: 1200 × 2400 mm</text><text class="tile-label">Full tile — Ägare</text><text class="legend-text">Full tile</text><text class="legend-text">Notched</text><text class="legend-text">Sliver</text><text class="legend-text">3 cut sizes — see cut list</text><rect width="30" height="60"/></svg>');

it.each(['en-GB', 'sv-SE', 'nb-NO'])('localizes fresh annotations without changing names or geometry: %s', (language) => {
  const t = i18n.getFixedT(language);
  const localized = decode(localizeTileImage(source, t, false));
  const svg = new DOMParser().parseFromString(localized, 'image/svg+xml');
  expect([...svg.querySelectorAll('.legend-text')].map((text) => text.textContent)).toEqual([
    t('ui.fullTile'), t('ui.diagramNotched'), t('ui.sliver'), t('documentUi.cutSizesLegend', { count: 3 }),
  ]);
  expect(svg.querySelector('.surface-title').textContent).toBe(t('ui.tileLayout'));
  expect(svg.querySelector('.tile-label').textContent).toBe('Full tile — Ägare');
  expect(svg.querySelector('rect').getAttribute('width')).toBe('30');
  expect(decode(source)).toContain('>Full tile</text>');
  expect(tileCandidateLabel('Best sliver avoidance (rotated)', t)).toBe(t('ui.candidateRotated', { label: t('ui.candidateBestSliverAvoidance') }));
  expect(tileCandidateLabel('Alternative 2', t)).toBe(t('ui.candidateAlternative', { number: 2 }));
});

it('keeps supplied plan titles and unsupported images unchanged', () => {
  const t = i18n.getFixedT('sv-SE');
  expect(decode(localizeTileImage(source, t, true))).toContain('>Tile layout</text>');
  expect(localizeTileImage('data:image/png;base64,aW1hZ2U=', t, false)).toBe('data:image/png;base64,aW1hZ2U=');
  expect(tileCandidateLabel('Custom source label', t)).toBe('Custom source label');
});
