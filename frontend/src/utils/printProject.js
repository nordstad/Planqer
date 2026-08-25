/*
  One printable document for a whole project, built in the browser.

  Every plan in a project gets its own page, so each cutlist can go to the
  saw as a single sheet. The diagrams the server stores are SVGs of wildly
  different shapes — board cutlists are very wide and short, sheet layouts
  roughly portrait — so each diagram is measured first and its page picks
  the orientation that renders it largest. Browsers that don't support named
  pages simply keep portrait; the diagram still fits, just smaller.

  Printing happens through a hidden same-origin iframe rather than a popup:
  no popup blockers, no flash of a new window, and the browser's own print
  dialog supplies both paper and save-as-PDF.
*/

const PAPERS = {
  a4: { css: 'A4', width: 210, height: 297 },
  letter: { css: 'letter', width: 215.9, height: 279.4 },
};

const MARGIN_MM = 12;
// Vertical room reserved on each page for the plan's own title block, plus
// the project header that shares the first page.
const PLAN_HEAD_MM = 26;
const DOC_HEAD_MM = 22;

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

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

const buildHtml = ({ title, meta, paper, plans }) => {
  const spec = PAPERS[paper] ?? PAPERS.a4;
  const innerW = spec.width - 2 * MARGIN_MM;
  const innerH = spec.height - 2 * MARGIN_MM;

  const sections = plans.map((plan, i) => {
    const availPortraitH = innerH - PLAN_HEAD_MM - (i === 0 ? DOC_HEAD_MM : 0);
    const availLandscapeH = innerW - PLAN_HEAD_MM - (i === 0 ? DOC_HEAD_MM : 0);
    const landscape = fittedArea(plan.width, plan.height, innerH, availLandscapeH)
      > fittedArea(plan.width, plan.height, innerW, availPortraitH);
    const maxH = landscape ? availLandscapeH : availPortraitH;

    return `
      <section class="plan${landscape ? ' plan--landscape' : ''}">
        <header class="plan-head">
          <h2>${escapeHtml(plan.name)}</h2>
          <p>${plan.facts.map(escapeHtml).join(' &nbsp;·&nbsp; ')}</p>
        </header>
        <img src="${plan.url}" alt="" style="max-height:${maxH}mm" />
      </section>`;
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
  .doc-head { padding-bottom: 4mm; margin-bottom: 5mm; border-bottom: 0.6mm solid #1c1b16; }
  .doc-head h1 { font-size: 20pt; font-weight: 800; letter-spacing: -0.02em; }
  .doc-head p { font-size: 9pt; color: #6b6a60; margin-top: 1.5mm; }
  .plan { break-after: page; page-break-after: always; }
  .plan:last-child { break-after: auto; page-break-after: auto; }
  .plan--landscape { page: landscape; }
  .plan-head { padding-bottom: 2.5mm; margin-bottom: 4mm; border-bottom: 0.25mm solid #c9c7ba; }
  .plan-head h2 { font-size: 13pt; font-weight: 700; }
  .plan-head p { font-size: 9pt; color: #6b6a60; margin-top: 1mm; }
  .plan img { display: block; max-width: 100%; width: auto; height: auto; margin: 0 auto; }
</style>
</head>
<body>
<header class="doc-head">
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(meta)}</p>
</header>
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
 * Compose every plan of a project into one document and open the browser's
 * print dialog (paper or save-as-PDF).
 *
 * @param {object} args
 * @param {string} args.title  project name, printed on the first page
 * @param {string} args.meta   one line under the title (plan count, date)
 * @param {string} args.paper  'a4' | 'letter'
 * @param {Array<{name: string, facts: string[], svgBlob: Blob}>} args.plans
 */
export const printProjectPlans = async ({ title, meta, paper, plans }) => {
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
    doc.write(buildHtml({ title, meta, paper, plans: measured }));
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
