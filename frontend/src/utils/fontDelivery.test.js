import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss from 'postcss';
import config from '../../vite.config.mjs';

it.each([
  ['archivo', 400], ['archivo', 500], ['archivo', 600], ['archivo', 700], ['archivo', 800],
  ['archivo-narrow', 600], ['archivo-narrow', 700],
])('retains the exact %s %i WOFF2 faces, weights and glyph ranges', async (family, weight) => {
  const source = readFileSync(resolve('node_modules', '@fontsource', family, `${weight}.css`), 'utf8');
  const original = postcss.parse(source);
  const plugin = config({ mode: 'test' }).css.postcss.plugins.at(-1);
  const output = (await postcss([plugin]).process(source, { from: undefined })).root;
  expect(output.nodes).toHaveLength(original.nodes.length);
  output.walkDecls((declaration) => {
    const expected = original.nodes[output.nodes.indexOf(declaration.parent)].nodes.find((node) => node.prop === declaration.prop);
    if (declaration.prop === 'src') {
      expect(declaration.value).toBe(expected.value.split(',')[0]);
      expect(declaration.value).toContain(".woff2) format('woff2')");
    } else expect(declaration.value).toBe(expected.value);
  });
});
