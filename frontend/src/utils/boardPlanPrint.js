import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { boardSummaryRows } from '../components/BoardPlanDocument';
import { printProjectPlans } from './printProject';

const h = createElement;
const mm = (value) => `${Math.round(value)} mm`;

const BoardPlanPrint = ({ project, t, language }) => {
  const result = project.optimization_result;
  return h('div', { className: 'board-plan-print' }, [
    h('style', { key: 'style' }, `.board-plan-print section { margin: 0 0 9mm; } .board-plan-print h2 { margin: 0 0 4mm; font-size: 14pt; } .board-plan-print .plan-summary { display:grid; grid-template-columns:repeat(3,1fr); gap:3mm 6mm; margin:0; } .board-plan-print dt { color:#6b6a60; font-size:8pt; } .board-plan-print dd { margin:1mm 0 0; font-size:10pt; font-weight:700; } .board-plan-print img { display:block; max-width:100%; max-height:180mm; margin:0 auto; } .board-plan-print table { width:100%; border-collapse:collapse; margin-top:4mm; } .board-plan-print th,.board-plan-print td { padding:2mm; border-bottom:.2mm solid #e3e1d6; text-align:left; }`),
    h('section', { key: 'summary' }, [h('h2', { key: 'title' }, t('wallpaperUi.summaryTitle')), h('dl', { key: 'rows', className: 'plan-summary' }, boardSummaryRows(project, t, language).map(([term, value]) => h('div', { key: term }, [h('dt', { key: 'term' }, term), h('dd', { key: 'value' }, value)])))]),
    result.visualization && h('section', { key: 'diagram' }, [h('h2', { key: 'title' }, t('ui.cuttingPlan')), h('img', { key: 'image', src: result.visualization, alt: '' })]),
    ...(result.cut_list || []).map((board, index) => h('section', { key: index }, [
      h('h2', { key: 'title' }, t('workflow.boardNumber', { number: index + 1 })),
      h('table', { key: 'table' }, [
        h('thead', { key: 'head' }, h('tr', null, [
          h('th', { key: 'order' }, t('workflow.cutOrder')),
          h('th', { key: 'length' }, t('ui.lengthMm')),
        ])),
        h('tbody', { key: 'body' }, board.map((length, cutIndex) => h('tr', { key: cutIndex }, [
          h('th', { key: 'order' }, cutIndex + 1),
          h('td', { key: 'length' }, mm(Number(length))),
        ]))),
      ]),
    ])),
  ]);
};

export const buildBoardPlanHtml = (project, t, language) => renderToStaticMarkup(h(BoardPlanPrint, { project, t, language }));
export const printBoardPlan = (project, t, language) => printProjectPlans({ title: project.name, meta: '', paper: 'a4', plans: [{ name: project.name, facts: [], bodyHtml: buildBoardPlanHtml(project, t, language) }] });
