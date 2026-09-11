/*
  One printable document for a whole project, built in the browser.

  The document reads top to bottom in the order a workshop actually needs it:
  what to buy, what to cut, which order to cut it in, then the diagram as
  visual confirmation — see the header comment on each plan section below.

  For one plan, the plan itself is page one — there is nothing above it worth
  a page of its own. For more than one, an overview page comes first (title,
  totals, a table of what's inside) so opening the file tells you what you're
  holding before you reach the first saw-ready page. A previous version put a
  project header in the page flow ahead of the first plan unconditionally; a
  landscape first plan then forced a page break before it even started (named
  pages force a break when they change), leaving the header alone on a nearly
  blank page one. Giving the overview its own explicit page removes that:
  there is always real content before the break, and the plans start clean
  after it regardless of their own orientation.

  Every plan in a project gets its own page, so each cutlist can go to the
  saw as a single sheet. The diagrams the server stores are SVGs of wildly
  different shapes — board cutlists are very wide and short, sheet layouts
  roughly portrait — so each diagram is measured first and its page picks
  the orientation that renders it largest. Browsers that don't support named
  pages simply keep portrait; the diagram still fits, just smaller.

  Printing happens through a hidden same-origin iframe rather than a popup:
  no popup blockers, no flash of a new window, and the browser's own print
  dialog supplies both paper, "save as PDF", and physical printing from the
  same place.

  A plan can optionally carry:
  - `legend`   a short line of what the diagram's marks mean (kept plan-type
               specific — a board's kerf line isn't a sheet's rotated part)
  - `extra`    `{ summaryHtml, pieceBlocks }` from utils/tileCutList.js — a
               cut-size summary placed right under the diagram, and full-page
               cut templates for diagonal pieces placed after it. Board and
               sheet plans set neither and print exactly as before.
*/

const PAPERS = {
  a4: { css: 'A4', width: 210, height: 297 },
  letter: { css: 'letter', width: 215.9, height: 279.4 },
};

const MARGIN_MM = 12;
// Vertical room reserved on a plan's page for its own header block.
const PLAN_HEAD_MM = 28;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// An SVG blob's intrinsic size, read by letting the browser load it once.
const measureSvg = (blob) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.onload = () => resolve({ url, width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
  image.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('a saved diagram could not be read'));
  };
  image.src = url;
});

// The fitted area of an image inside a box, for comparing orientations.
const fittedArea = (imgW, imgH, boxW, boxH) => {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  return imgW * scale * imgH * scale;
};

const buildOverview = (title, meta, plans) => `
  <section class="overview">
    <header class="doc-head">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(meta)}</p>
    </header>
    <table class="overview-table">
      <thead><tr><th>Plan</th><th>Kind</th><th>Quantity</th><th>Stock</th></tr></thead>
      <tbody>
        ${plans.map((p) => `
          <tr>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.kind)}</td>
            <td>${escapeHtml(p.qty)}</td>
            <td>${escapeHtml(p.stock)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  </section>`;

const buildHtml = ({ title, meta, paper, plans }) => {
  const spec = PAPERS[paper] ?? PAPERS.a4;
  const innerW = spec.width - 2 * MARGIN_MM;
  const innerH = spec.height - 2 * MARGIN_MM;
  const showOverview = plans.length > 1;

  const sections = plans.map((plan, i) => {
    const availPortraitH = innerH - PLAN_HEAD_MM;
    const availLandscapeH = innerW - PLAN_HEAD_MM;
    const landscape = fittedArea(plan.width, plan.height, innerH, availLandscapeH)
      > fittedArea(plan.width, plan.height, innerW, availPortraitH);
    const maxH = landscape ? availLandscapeH : availPortraitH;
    const facts = [plan.kind, plan.qty, plan.stock, `saved ${plan.savedDate}`].filter(Boolean);

    return `
      <section class="plan${landscape ? ' plan--landscape' : ''}">
        <header class="plan-head">
          <p class="plan-kicker">${escapeHtml(title)} &nbsp;\u00b7&nbsp; Plan ${i + 1} of ${plans.length}</p>
          <h2>${escapeHtml(plan.name)}</h2>
          <p class="plan-facts">${facts.map(escapeHtml).join(' &nbsp;\u00b7&nbsp; ')}</p>
        </header>
        <img src="${plan.url}" alt="" style="max-height:${maxH}mm" />
        ${plan.legend ? `<p class="plan-legend">${escapeHtml(plan.legend)}</p>` : ''}
        ${plan.extra?.summaryHtml || ''}
      </section>
      ${(plan.extra?.pieceBlocks || []).join('\n')}`;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: ${spec.css} portrait; margin: ${MARGIN_MM}mm; }
  @page landscape { size: ${spec.css} landscape; margin: ${MARGIN_MM}mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1c1b16; }

  /* ── the overview page: only printed for more than one plan ──────────── */
  .overview { break-after: page; page-break-after: always; }
  .doc-head { padding-bottom: 4mm; margin-bottom: 6mm; border-bottom: 0.6mm solid #1c1b16; }
  .doc-head h1 { font-size: 20pt; font-weight: 800; letter-spacing: -0.02em; }
  .doc-head p { font-size: 9pt; color: #6b6a60; margin-top: 1.5mm; }
  .overview-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .overview-table th, .overview-table td { text-align: left; padding: 2.5mm 4mm 2.5mm 0; }
  .overview-table th {
    font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; color: #6b6a60;
    border-bottom: 0.4mm solid #1c1b16; font-weight: 700;
  }
  .overview-table td { border-bottom: 0.2mm solid #e3e1d6; }

  /* ── each plan: header, then the diagram — the thing decided already ── */
  .plan { break-after: page; page-break-after: always; }
  .plan:last-child { break-after: auto; page-break-after: auto; }
  .plan--landscape { page: landscape; }
  .plan-head { padding-bottom: 2.5mm; margin-bottom: 4mm; border-bottom: 0.25mm solid #c9c7ba; }
  .plan-kicker {
    font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
    color: #6b6a60; margin-bottom: 1.5mm;
  }
  .plan-head h2 { font-size: 15pt; font-weight: 700; }
  .plan-facts { font-size: 9pt; color: #6b6a60; margin-top: 1mm; }
  .plan img { display: block; max-width: 100%; width: auto; height: auto; margin: 0 auto; }
  .plan-legend { font-size: 8.5pt; color: #6b6a60; text-align: center; margin-top: 3mm; }

  /* ── what to cut: the summary table right under its diagram ─────────── */
  .cut-list { width: 100%; border-collapse: collapse; margin-top: 6mm; font-size: 9pt; }
  .cut-list th, .cut-list td { text-align: left; padding: 1.5mm 3mm 1.5mm 0; }
  .cut-list th {
    font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.04em; color: #6b6a60;
    border-bottom: 0.3mm solid #c9c7ba; font-weight: 700;
  }
  .cut-list td { border-bottom: 0.2mm solid #e3e1d6; }
  .cut-list tr { break-inside: avoid; page-break-inside: avoid; }
  .cut-list thead { display: table-header-group; } /* repeats on each printed page if the list spans more than one */
  .cut-list-ref { color: #6b6a60; font-style: italic; }

  /* ── a diagonal piece's own cut template: one full page, not a table cell ── */
  .piece-page { break-before: page; page-break-before: always; break-inside: avoid; }
  .piece-head { border-bottom: 0.25mm solid #c9c7ba; padding-bottom: 2.5mm; margin-bottom: 6mm; }
  .piece-head h3 { font-size: 13pt; font-weight: 700; }
  .piece-head p { font-size: 9pt; color: #6b6a60; margin-top: 1mm; }
  .piece-template { display: block; width: 100%; max-height: 200mm; object-fit: contain; margin: 0 auto; }
  .piece-legend { font-size: 8.5pt; color: #6b6a60; text-align: center; margin-top: 4mm; }
</style>
</head>
<body>
${showOverview ? buildOverview(title, meta, plans) : ''}
${sections}
</body>
</html>`;
};

const whenImagesLoaded = (doc) => Promise.all(
  Array.from(doc.images).map((img) => (img.complete ? Promise.resolve() : new Promise((resolve) => {
    img.onload = resolve;
    img.onerror = resolve;
  }))),
);

/**
 * Compose one or more plans of a project into one document and open the
 * browser's print dialog — the same dialog that offers "save as PDF" and
 * physical printing, so this one function serves both.
 *
 * @param {object} args
 * @param {string} args.title  project name, printed on the overview page
 *                             (or the plan's own kicker, for a single plan)
 * @param {string} args.paper  'a4' | 'letter'
 * @param {Array<{
 *   name: string, kind: string, qty: string, stock: string, savedDate: string,
 *   svgBlob: Blob, legend?: string,
 *   extra?: { summaryHtml: string, pieceBlocks: string[] },
 * }>} args.plans
 */
export const printProjectPlans = async ({ title, paper, plans }) => {
  const measured = await Promise.all(
    plans.map(async (plan) => ({ ...plan, ...(await measureSvg(plan.svgBlob)) })),
  );

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0; visibility:hidden;';
  document.body.appendChild(iframe);

  const cleanup = () => {
    measured.forEach((plan) => URL.revokeObjectURL(plan.url));
    iframe.remove();
  };

  try {
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(buildHtml({
      title,
      meta: `${plural(plans.length, 'plan')} \u00b7 printed ${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())}`,
      paper,
      plans: measured,
    }));
    doc.close();
    await whenImagesLoaded(doc);

    // Clean up once the dialog closes; the timeout covers browsers where
    // afterprint never fires from an iframe.
    iframe.contentWindow.addEventListener('afterprint', () => setTimeout(cleanup, 500), { once: true });
    setTimeout(cleanup, 60_000);

    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  } catch (err) {
    cleanup();
    throw err;
  }
};
