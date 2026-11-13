import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sheetSummaryRows } from '../components/SheetPlanDocument';
import { printProjectPlans } from './printProject';

const h = createElement;
const mm = (value) => `${Math.round(value)} mm`;

const printCss = `
  .sheet-plan-print { --ink: #16150f; --ink-3: #6f6a55; --rule-hair: #e9e6da; }
  .sheet-plan-print section { margin: 0 0 9mm; }
  .sheet-plan-print h2 { margin: 0 0 4mm; font-size: 14pt; }
  .sheet-plan-print h3 { margin: 0 0 3mm; font-size: 11pt; }
  .sheet-plan-print .plan-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm 6mm; margin: 0; }
  .sheet-plan-print .plan-summary div, .sheet-plan-print .sheet-plan-sheet { break-inside: avoid; page-break-inside: avoid; }
  .sheet-plan-print dt { color: #6b6a60; font-size: 8pt; }
  .sheet-plan-print dd { margin: 1mm 0 0; font-size: 10pt; font-weight: 700; }
  .sheet-plan-print .sheet-plan-sheet { break-before: page; page-break-before: always; }
  .sheet-plan-print .sheet-plan-diagram { display: block; width: 100%; max-height: 180mm; object-fit: contain; }
  .sheet-plan-print table { width: 100%; margin-top: 4mm; border-collapse: collapse; font-size: 9pt; }
  .sheet-plan-print th, .sheet-plan-print td { padding: 2mm 2.5mm 2mm 0; border-bottom: .2mm solid #e3e1d6; text-align: left; }
  .sheet-plan-print th { color: #6b6a60; font-size: 7.5pt; text-transform: uppercase; }
  .sheet-plan-print thead { display: table-header-group; }
`;

const SheetPrintSection = ({ sheet, diagram, index, t }) => h('section', { className: 'sheet-plan-sheet' }, [
  h('h2', { key: 'title' }, t('workflow.sheetNumber', { number: index + 1 })),
  diagram && h('img', { key: 'diagram', className: 'sheet-plan-diagram', src: diagram, alt: '' }),
  h('h3', { key: 'placements' }, t('workflow.exactPlacements')),
  h('table', { key: 'table' }, [
    h('thead', { key: 'head' }, h('tr', null, [t('ui.part'), t('workflow.sizeMm'), t('ui.atXY'), t('ui.turned')].map((title) => h('th', { key: title }, title)))),
    h('tbody', { key: 'body' }, sheet.parts.map((part, partIndex) => h('tr', { key: `${part.part_id}-${partIndex}` }, [
      h('th', { key: 'part' }, part.part_id),
      h('td', { key: 'size' }, `${mm(part.width)} × ${mm(part.height)}`),
      h('td', { key: 'position' }, `${Math.round(part.x)}, ${Math.round(part.y)}`),
      h('td', { key: 'turned' }, part.rotated ? '90°' : '—'),
    ]))),
  ]),
]);

const SheetPlanPrint = ({ project, t, language }) => {
  const result = project.optimization_result;
  return h('div', { className: 'sheet-plan-print' }, [
    h('style', { key: 'style' }, printCss),
    h('section', { key: 'summary' }, [
      h('h2', { key: 'title' }, t('wallpaperUi.summaryTitle')),
      h('dl', { className: 'plan-summary', key: 'rows' }, sheetSummaryRows(project, t, language).map(([term, value]) => h('div', { key: term }, [h('dt', { key: 'term' }, term), h('dd', { key: 'value' }, value)]))),
    ]),
    ...(result.sheets || []).map((sheet, index) => h(SheetPrintSection, { key: index, sheet, diagram: result.sheet_visualizations?.[index] || result.visualization, index, t })),
  ]);
};

export const buildSheetPlanHtml = (project, t, language) => renderToStaticMarkup(h(SheetPlanPrint, { project, t, language }));

export const printSheetPlan = (project, t, language) => printProjectPlans({
  title: project.name,
  meta: '',
  paper: 'a4',
  plans: [{ name: project.name, facts: [], bodyHtml: buildSheetPlanHtml(project, t, language) }],
});
