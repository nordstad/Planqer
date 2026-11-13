import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tileSummaryRows } from '../components/TilePlanDocument';
import { buildCutListHtml } from './tileCutList';
import { printProjectPlans } from './printProject';

const h = createElement;

const TilePlanPrint = ({ project, t, language }) => h('div', { className: 'tile-plan-print' }, [
  h('style', { key: 'style' }, `.tile-plan-print section { margin:0 0 9mm; } .tile-plan-print h2 { margin:0 0 4mm; font-size:14pt; } .tile-plan-print .plan-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:3mm 6mm; margin:0; } .tile-plan-print dt { color:#6b6a60; font-size:8pt; } .tile-plan-print dd { margin:1mm 0 0; font-size:10pt; font-weight:700; } .tile-plan-print > img { display:block; max-width:100%; max-height:180mm; margin:0 auto 8mm; }`),
  h('section', { key: 'summary' }, [h('h2', { key: 'title' }, t('wallpaperUi.summaryTitle')), h('dl', { key: 'rows', className: 'plan-summary' }, tileSummaryRows(project, t, language).map(([term, value]) => h('div', { key: term }, [h('dt', { key: 'term' }, term), h('dd', { key: 'value' }, value)])))]),
  project.layout_result.visualization && h('img', { key: 'diagram', src: project.layout_result.visualization, alt: '' }),
  h('section', { key: 'cuts' }, [h('h2', { key: 'title' }, t('ui.cutList')), h('div', { key: 'content', dangerouslySetInnerHTML: { __html: buildCutListHtml(project.layout_result, t) } })]),
]);

export const buildTilePlanHtml = (project, t, language) => renderToStaticMarkup(h(TilePlanPrint, { project, t, language }));
export const printTilePlan = (project, t, language) => printProjectPlans({ title: project.name, meta: '', paper: 'a4', plans: [{ name: project.name, facts: [], bodyHtml: buildTilePlanHtml(project, t, language) }] });
