import { test, expect } from '@playwright/test';

/*
  The project print is one browser-built document with every plan on its own
  page. Unit tests stub printing out, so this renders the real document to PDF
  in Chromium and counts the pages: a heading stranded on one page and its
  diagram pushed to the next shows up here as extra pages.

  It needs only the frontend (no backend). The diagrams have the shapes the
  server draws for a bench: wide board cutlists and a landscape sheet.
*/

const svg = (width, height) => `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  + `<rect width="${width}" height="${height}" fill="#e8e6dc"/><rect x="20" y="20" width="${width / 2}" height="${height / 2}" fill="#b8d4b0"/></svg>`,
).toString('base64')}`;

const facts = ['Board cutting', '18 parts · 18 410 mm · 3 mm kerf', 'Framing timber 45 × 95 mm', 'Saved 26-10-11'];
const diagram = (name, width, height) => ({ name, facts, url: svg(width, height), width, height });

const bench = (prefix) => [
  diagram(`${prefix} · Plywood 15 mm — Sheet 1`, 1100, 765),
  diagram(`${prefix} · Planed timber 95 × 95 mm`, 1000, 202),
  diagram(`${prefix} · Framing timber / studs 45 × 95 mm`, 1000, 654),
];

const shoppingListHtml = `<section class="shopping-list"><h2>What to buy</h2><table class="shopping-table"><tbody>${
  Array.from({ length: 8 }, () => '<tr><td>bench · Framing timber 45 × 95 mm</td><td>45 × 95 × 4 200</td><td>4</td><td>5</td></tr>').join('')
}</tbody></table></section>`;

// Page sizes in PDF points, portrait.
const PAPER_PT = { a4: [595.92, 841.92], letter: [612, 792] };

const renderPdf = async (page, args) => {
  await page.goto('/');
  const html = await page.evaluate(async (input) => {
    const { buildHtml } = await import('/src/utils/printProject.js');
    return buildHtml(input);
  }, args);
  await page.setContent(html);
  await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0));
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
  const boxes = [...pdf.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)]
    .map(([, w, h]) => [Number(w), Number(h)]);
  return { pages: (pdf.match(/\/Type\s*\/Page(?!s)/g) || []).length, boxes };
};

const isPaper = ([w, h], paper) => {
  const [pw, ph] = PAPER_PT[paper];
  const near = (a, b) => Math.abs(a - b) < 1;
  return (near(w, pw) && near(h, ph)) || (near(w, ph) && near(h, pw));
};

test.describe('Project print', () => {
  for (const paper of ['a4', 'letter']) {
    test(`prints the shopping list and one page per plan on ${paper}`, async ({ page }) => {
      const plans = [...bench('bench'), ...bench('bench')];
      const { pages, boxes } = await renderPdf(page, {
        title: 'Bench', meta: '6 plans · printed 26-10-11', paper, plans, shoppingListHtml,
      });

      expect(pages).toBe(1 + plans.length);
      expect(boxes).toHaveLength(pages);
      boxes.forEach((box) => expect(isPaper(box, paper)).toBe(true));
      // The shopping list keeps portrait; the wide diagrams turn the page.
      expect(boxes[0][0]).toBeLessThan(boxes[0][1]);
      expect(boxes.slice(1).some(([w, h]) => w > h)).toBe(true);
    });
  }

  test('prints diagrams only, with long names, one page per plan', async ({ page }) => {
    const longName = 'Garden bench with storage box and backrest, revised after the second fitting';
    const plans = bench(longName);
    const { pages } = await renderPdf(page, {
      title: `${longName} — the whole project`, meta: '3 plans · printed 26-10-11', paper: 'a4', plans,
    });

    expect(pages).toBe(plans.length);
  });
});
