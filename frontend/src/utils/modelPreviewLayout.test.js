import {
  colourForModelGroup,
  layoutModelParts,
  MODEL_PREVIEW_INSTANCE_LIMIT,
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
