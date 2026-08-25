# Sheet cutting

For plywood, MDF, metal, glass, acrylic — rectangular parts nested onto sheet
stock. Route: `/sheet-cutting`.

## Inputs

| Field | What it means |
| --- | --- |
| **Parts to cut** | Every rectangle you need, its width × height in millimetres, and how many. Name each one if it helps you tell them apart later. |
| **Saw blade (kerf)** | Subtracted between every part, the same as board cutting. |
| **The sheet you're cutting from** | Width, height, and material — what you're cutting *out of*, not what you need. Standard plywood is 1220 × 2440 mm or 1200 × 2500 mm; measure yours. |
| **Packing strategy** | Auto-selected by default, with 90° rotation allowed. You can pick a specific strategy (Bottom-Left Fill, Best Fit, Genetic, Guillotine) if you want to compare. |

## Running the plan

Click **Pack the sheets**. Planqer nests your parts onto as few sheets as it
can and returns:

- The number of sheets required, and material used / waste per sheet.
- A layout diagram per sheet, each part drawn at its real proportions and
  position.
- Exact placements — where every part sits, in millimetres from the sheet's
  top-left corner.

![Sheet cutting result](../assets/screenshots/sheet-cutting-result.png)

Hatching in the diagram is waste; a dashed outline is a part turned 90° to
fit.

## Saving a plan

**Name and save** keeps the layout on your instance under your account, the
same as a board-cutting plan.

## Limits

- Same part/length limits as board cutting apply to sheet dimensions.
- Rotation is 90° only; there is no arbitrary-angle nesting.
- Optimization is heuristic — a good layout, not a guaranteed minimum.
