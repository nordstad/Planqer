/*
  A tiny swatch of what each bond pattern actually looks like, so picking one
  from the Bond select doesn't require running the solver first to find out.
  The cell math here is a direct, deliberately simplified port of the real
  generators in backend/planqer/tile_layout/bonds.py (HerringboneBond,
  DoubleHerringboneBond, etc.) — same translation vectors, same motif — just
  evaluated over a small fixed margin instead of clipped to a real surface.
  Diagonal variants reuse the axis-aligned cells and rotate the whole group
  45 degrees, exactly as the backend rotates each placed tile's center rather
  than re-deriving the lattice (see DiagonalHerringboneBond's docstring).
*/
import { useMemo } from 'react';

const N = 40;         // svg viewBox side, in local units
const CELL = 5.4;      // px-equivalent per tile unit
const L = 2, S = 1;    // long/short side of the swatch's "tile", short:long = 1:2
const G = 0.14;        // joint gap, in tile units

const CENTER = `translate(${N / 2} ${N / 2})`;
const DIAGONAL = `translate(${N / 2} ${N / 2}) rotate(45) scale(0.72)`;

const stackCells = (margin) => {
  const pitch = L + G;
  const cells = [];
  for (let i = -margin; i <= margin; i++) {
    for (let j = -margin; j <= margin; j++) cells.push([i * pitch, j * pitch, L, L]);
  }
  return cells;
};

const runningCells = (margin) => {
  const pitch = L + G;
  const cells = [];
  for (let j = -margin; j <= margin; j++) {
    const rowOffset = (((j % 2) + 2) % 2) * (pitch / 2);
    for (let i = -margin; i <= margin; i++) cells.push([i * pitch + rowOffset, j * pitch, L, L]);
  }
  return cells;
};

// Port of HerringboneBond.raw_positions: one (L x S) "H" tile + one (S x L)
// "V" tile per lattice point, repeated via translation vectors t1/t2.
const herringboneCells = (margin) => {
  const t1x = L + S + 2 * G, t1y = L - S - G;
  const t2x = -(S + G), t2y = S + G;
  const cells = [];
  for (let i = -margin; i <= margin; i++) {
    for (let j = -margin; j <= margin; j++) {
      const ox = i * t1x + j * t2x, oy = i * t1y + j * t2y;
      cells.push([ox, oy, L, S]);
      cells.push([ox + L + G, oy, S, L]);
    }
  }
  return cells;
};

// Port of DoubleHerringboneBond.raw_positions: each arm is two planks
// side by side instead of one, over the pair's combined footprint.
const doubleHerringboneCells = (margin) => {
  const sPair = 2 * S + G;
  const t1x = L + sPair + 2 * G, t1y = L - sPair - G;
  const t2x = -(sPair + G), t2y = sPair + G;
  const cells = [];
  for (let i = -margin; i <= margin; i++) {
    for (let j = -margin; j <= margin; j++) {
      const ox = i * t1x + j * t2x, oy = i * t1y + j * t2y;
      cells.push([ox, oy, L, S]);
      cells.push([ox, oy + S + G, L, S]);
      const vx = ox + L + G;
      cells.push([vx, oy, S, L]);
      cells.push([vx + S + G, oy, S, L]);
    }
  }
  return cells;
};

const PATTERNS = {
  stack: { cells: () => stackCells(3), transform: CENTER },
  running: { cells: () => runningCells(3), transform: CENTER },
  diagonal: { cells: () => stackCells(4), transform: DIAGONAL },
  herringbone: { cells: () => herringboneCells(4), transform: CENTER },
  diagonal_herringbone: { cells: () => herringboneCells(10), transform: DIAGONAL },
  double_herringbone: { cells: () => doubleHerringboneCells(3), transform: CENTER },
  diagonal_double_herringbone: { cells: () => doubleHerringboneCells(7), transform: DIAGONAL },
};

const BondPatternIcon = ({ pattern, size = 32 }) => {
  const config = PATTERNS[pattern] || PATTERNS.stack;
  const rects = useMemo(() => config.cells(), [pattern]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <svg width={size} height={size} viewBox={`0 0 ${N} ${N}`} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={`bond-clip-${pattern}`}><rect width={N} height={N} rx={8} /></clipPath>
      </defs>
      <g clipPath={`url(#bond-clip-${pattern})`}>
        <g transform={config.transform}>
          {rects.map(([x, y, w, h], i) => (
            <rect key={i} x={x * CELL} y={y * CELL} width={w * CELL} height={h * CELL} fill="currentColor" />
          ))}
        </g>
      </g>
    </svg>
  );
};

export default BondPatternIcon;
