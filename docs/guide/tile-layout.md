# Tile layout

For laying rectangular tiles on a wall, floor, roof, or other rectangular
surface. Route: `/tile-layout`.

Tile layout starts with a repeating laying pattern and chooses a good grid
offset, rather than nesting unrelated rectangles. It returns several ranked
candidates so you can choose between edge cuts, symmetry, and fewer distinct
cuts.

## Inputs

### Surface

Enter the surface width and height in millimetres. Add openings for windows,
doors, sockets, extractor hoods, or other areas that must remain uncovered.
Each opening has an x/y position, width, height, and optional label.

### Tile

Enter the tile's width and height. Enable **Allow the whole layout to run
turned 90°** when the tile has no directional grain or face and either
orientation is acceptable.

### Joint and bond

- **Joint** is the grout gap between tiles, in millimetres.
- **Perimeter gap** is expansion room at the surface edge, not grout.
- **Stack** places tiles in a straight grid.
- **Running** offsets each row, like brickwork. The row offset can be set as a
  percentage of tile width.
- **Diagonal** rotates the straight grid 45 degrees.
- **Herringbone** alternates tile direction by 90 degrees.
- **Diagonal herringbone** rotates the herringbone weave 45 degrees.
- **Double herringbone** uses paired planks in each arm of the weave.
- **Diagonal double herringbone** rotates the paired-plank weave 45 degrees.

The offset percentage applies to running bond. Herringbone-family patterns do
not use it.

### Sliver guard and breakage

- **Sliver threshold** flags cut pieces narrower than the supplied width. Leave
  it empty to disable the guard.
- **Breakage allowance** adds a percentage to the number of tiles to purchase.
- **Candidates to show** controls how many ranked layout options are returned.
- **Reuse offcuts** allows suitable leftover pieces to fill later cut positions.

## Running the plan

Click **Find the layout** to generate candidates. Each result includes tile
purchase counts, full/cut/notched/reused-offcut/sliver counts, edge-cut sizes,
symmetry, distinct cut sizes, coverage, waste, efficiency, and a scaled layout
diagram.

The recommended candidate is only a starting point. Compare the alternatives
when a slightly less efficient layout gives safer edge cuts or fewer saw
setups.

## Saving a plan

Name and save a selected layout to keep its inputs, chosen candidate, and
diagram on your instance. Saving requires a signed-in local account. Running
the optimizer itself does not require an account.

## API

Use `POST /api/tile-layout`. The main request fields are:

```json
{
  "surface_width": 2400,
  "surface_height": 1200,
  "cutouts": [{"x": 1000, "y": 400, "width": 300, "height": 300, "label": "window"}],
  "tile": {"width": 300, "height": 600, "allow_rotation": false},
  "joint": {"joint_width": 3, "perimeter_gap": 0},
  "bond": {"pattern": "running", "offset_fraction": 0.5},
  "min_edge_cut": 100,
  "reuse_offcuts": true,
  "waste_percent": 10,
  "candidate_count": 5,
  "project_name": "Kitchen splashback"
}
```

Surface dimensions must be between 100 and 20,000 mm. Up to 20 cutouts are
accepted, and `candidate_count` may be between 1 and 20.
