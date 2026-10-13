import {
  colourForModelGroup,
  colourForModelPart,
  layoutModelParts,
  MODEL_PREVIEW_INSTANCE_LIMIT,
  partKey,
} from './modelPreview';

const groups = [
  {
    id: 'board|spruce|45x95',
    kind: 'board',
    width: 95,
    thickness: 45,
    lengths: [{ length: 1800, qty: 2 }, { length: 500, qty: 1 }],
  },
  {
    id: 'sheet|plywood|15',
    kind: 'sheet',
    thickness: 15,
    sizes: [{ length: 800, width: 400, qty: 1 }],
  },
];

describe('layoutModelParts', () => {
  it('expands board and sheet quantities into positioned parts', () => {
    const layout = layoutModelParts(groups, new Set(groups.map((group) => group.id)));

    expect(layout).toMatchObject({
      totalQuantity: 4,
      displayedQuantity: 4,
      aggregated: false,
    });
    expect(layout.items[0]).toMatchObject({
      groupId: groups[0].id,
      length: 1800,
      width: 95,
      thickness: 45,
      selected: true,
    });
    expect(layout.items[3]).toMatchObject({ groupId: groups[1].id, width: 400, thickness: 15 });
    expect(layout.items.every((item) => item.position.x > 0 && item.position.z > 0)).toBe(true);
  });

  it('marks unselected groups without removing them', () => {
    const layout = layoutModelParts(groups, new Set([groups[0].id]));

    expect(layout.items.filter((item) => !item.selected)).toHaveLength(1);
  });

  it('aggregates repeated parts above the display cap', () => {
    const largeGroup = {
      ...groups[0],
      lengths: [{ length: 100, qty: MODEL_PREVIEW_INSTANCE_LIMIT + 1 }],
    };
    const layout = layoutModelParts([largeGroup]);

    expect(layout).toMatchObject({
      totalQuantity: MODEL_PREVIEW_INSTANCE_LIMIT + 1,
      displayedQuantity: 1,
      aggregated: true,
    });
    expect(layout.items[0].displayedQuantity).toBe(MODEL_PREVIEW_INSTANCE_LIMIT + 1);
  });
});

describe('colourForModelGroup', () => {
  it('is stable for a group id and uses the preview palette', () => {
    expect(colourForModelGroup('board|spruce|45x95')).toBe(colourForModelGroup('board|spruce|45x95'));
    expect(colourForModelGroup('board|spruce|45x95')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

const brightness = (hex) => {
  const value = parseInt(hex.slice(1), 16);
  return ((value >> 16) & 255) + ((value >> 8) & 255) + (value & 255);
};

describe('colourForModelPart', () => {
  it('keeps the cutlist colour when it has only one length', () => {
    expect(colourForModelPart('g', 0, 1)).toBe(colourForModelGroup('g'));
  });

  it('gives every length of a cutlist its own shade, longest darkest', () => {
    const shades = [0, 1, 2, 3].map((index) => colourForModelPart('g', index, 4));
    expect(new Set(shades).size).toBe(4);
    const levels = shades.map(brightness);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it('is the same for the same length every time', () => {
    expect(colourForModelPart('g', 1, 3)).toBe(colourForModelPart('g', 1, 3));
  });

  it('stays a valid colour at the extremes', () => {
    [colourForModelPart('g', 0, 9), colourForModelPart('g', 8, 9)].forEach((colour) => {
      expect(colour).toMatch(/^#[0-9a-f]{6}$/);
    });
  });
});

describe('part shades in the layout', () => {
  it('shades parts by length, so identical parts match and different lengths differ', () => {
    const { items } = layoutModelParts([groups[0]]);
    const long = items.filter((item) => item.length === 1800);
    const short = items.find((item) => item.length === 500);

    expect(long).toHaveLength(2);
    expect(long[0].colour).toBe(long[1].colour);
    expect(long[0].colour).not.toBe(short.colour);
    expect(brightness(long[0].colour)).toBeLessThan(brightness(short.colour));
  });

  it('keys a part by its length, and a sheet part by its size', () => {
    expect(partKey(groups[0], groups[0].lengths[0])).toBe('1800');
    expect(partKey(groups[1], groups[1].sizes[0])).toBe('800x400');
    expect(layoutModelParts([groups[0]]).items.map((item) => item.key)).toEqual(['1800', '1800', '500']);
  });

  it('lets a cutlist with a single length keep its plain colour', () => {
    const { items } = layoutModelParts([groups[1]]);
    expect(items[0].colour).toBe(colourForModelGroup(groups[1].id));
  });
});
