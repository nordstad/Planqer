import { describe, expect, it } from 'vitest';
import { buildHtml } from './printProject';

describe('buildHtml', () => {
  it('renders a flowing plan body without an image', () => {
    const html = buildHtml({ title: 'Kitchen', meta: '', paper: 'a4', plans: [{ name: 'Wallpaper', facts: [], bodyHtml: '<p>Cut plan</p>' }] });

    expect(html).toContain('class="plan plan--flow"');
    expect(html).toContain('<p>Cut plan</p>');
    expect(html).not.toContain('<img');
  });

  it('keeps SVG plans as images', () => {
    const html = buildHtml({ title: 'Chair', meta: '', paper: 'a4', plans: [{ name: 'Legs', facts: [], url: 'blob:diagram', width: 100, height: 200 }] });

    expect(html).toContain('<img src="blob:diagram"');
  });
});
