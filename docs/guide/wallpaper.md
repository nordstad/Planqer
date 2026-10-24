# Wallpaper planning

The wallpaper planner turns measured elevations into a roll count, a pattern-aware
cut order and a hanging checklist. It is a measurement aid, not manufacturer
installation guidance.

## Measure the room

Stand in the doorway and look into the room. Start with the wall on your left
and work clockwise, one wall at a time. Walls are lettered like a drawing
(Wall A, B, C…); rename them by what is on them, such as "Window wall". A live
top view of the room beside the form updates as you type, marks the start and
highlights the wall you are editing. Use the **bottom-left corner** as the
origin for every wall: record widths at the top, middle and bottom, then the left,
middle and right heights. Include the finished casing where paper will meet it.

Add doors, windows and fixed obstacles by their left and bottom offsets and
their bounding rectangle. For a heat pump or radiator, choose the fixed-obstacle
option so the plan can split the strip above and below it and leave the selected
tuck allowance. Confirm the elevation before planning.

If a wall needs no paper, such as an open passage, tick **No wallpaper on this
wall**. Enter only its width so the room still closes; it is drawn dashed on the
top view and no strips are planned for it.

## Pattern and allowances

Plain wallpaper has a repeat of zero. For patterned wallpaper, enter the repeat
printed on the roll and choose straight or half-drop matching. Planqer reports a
phase for each cut, but always visually match the motif to the previous strip
before cutting.

The plan adds top, bottom, opening and corner allowances. They are deliberate
extra material for final trimming, not finished dimensions. Keep all bought
rolls from the same batch/run.

## Corners

Choose a treatment for every corner before planning. Inside corners default to
a **15 mm overlap**: the final strip on a wall wraps 15 mm round the corner and
the next wall starts a fresh strip over it, which keeps the corner crisp even
when the wall is not plumb. The overlap is the corner allowance, so it can be
changed in the **Corner overlap (mm)** field above the corners (0–50 mm, for
example 10–20 mm for a corner that is not plumb). The cut sheet lists it as
extra width on that strip.

The other choices are a butt joint (a fresh strip with no overlap) and carrying
the final strip's leftover width round the corner. Outside corners always wrap.
If the final strip already uses the full roll width there is no room to wrap,
so the planner prefers a layout that leaves room.

## Read the cut plan

The Plan step shows rolls needed, the safety-margin purchase count and the
roll length lost to pattern matching, roll ends and top/bottom allowance.
Pattern loss is net of offcuts: a gap that a later piece fills counts as reused,
not lost, and the summary names the largest leftover piece. Enter an optional
price per roll on the Wallpaper step to see an estimated cost on the Plan step,
the Save step and the saved project card. Strips are labelled S1, S2 and so on
in hanging order across the whole room, and a wall marked as having no wallpaper
is shown as such and uses no material. The Cut step lists
pieces in chronological roll order. Mark a piece cut only after table cutting;
then mark it hung once it is on the wall.

For paste, trimming technique, electrical safety and product-specific handling,
follow the manufacturer guide saved with the wallpaper. Do not rely on Planqer
for those instructions.
