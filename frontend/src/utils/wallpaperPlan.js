import { pieceFaces } from '../components/WallpaperPieceDiagram';

// Plans saved before connected strips have no segments; treat them as one face.
export const segmentsOf = (item) => (item.segments?.length ? item.segments : [item]);

export const isOnWall = (item, wallIndex) => segmentsOf(item).some((segment) => segment.wall_index === wallIndex);

// Drawing-style letters: Wall A, B, … Z, AA. Walls are lettered clockwise from the first wall.
export const letterOf = (index) => {
  let letters = '';
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) letters = String.fromCharCode(65 + (n % 26)) + letters;
  return letters;
};

export const stripLabel = (t, number) => t('wallpaperUi.stripLabel', { number });

export const pieceLabels = (plan, t) => {
  const byStrip = new Map();
  (plan.pieces || []).forEach((piece) => {
    const pieces = byStrip.get(piece.strip_number) || [];
    pieces.push(piece);
    byStrip.set(piece.strip_number, pieces);
  });
  const labels = new Map();
  byStrip.forEach((pieces, number) => {
    if (pieces.length === 1) {
      labels.set(pieces[0].id, stripLabel(t, number));
      return;
    }
    [...pieces].sort((a, b) => b.y_end - a.y_end)
      .forEach((piece, index) => labels.set(piece.id, `${stripLabel(t, number)}${String.fromCharCode(97 + index)}`));
  });
  return labels;
};

export const coveredStrips = (plan, wallIndex) => {
  const withPieces = new Set((plan.pieces || []).map((piece) => piece.strip_number));
  return (plan.strips || [])
    .filter((strip) => isOnWall(strip, wallIndex) && !withPieces.has(strip.number))
    .map((strip) => strip.number);
};

export const toRanges = (numbers) => {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  return sorted.reduce((ranges, number) => {
    const current = ranges.at(-1);
    if (current && number === current[1] + 1) current[1] = number;
    else ranges.push([number, number]);
    return ranges;
  }, []);
};

export const pieceFlags = (piece, strip) => {
  const flags = [];
  const faces = pieceFaces(piece, strip);
  if (faces.some((face) => face.notches.length)) flags.push('opening');
  if (new Set(faces.map((face) => face.wall_index)).size > 1 || (strip.return_overlap || 0) > 0) flags.push('corner');
  const atCeiling = piece.y_end >= strip.top_height - 0.5;
  const atFloor = piece.y_start <= (strip.bottom_height ?? 0) + 0.5;
  if (!atCeiling || !atFloor) flags.push('partial');
  return flags;
};

export const needsDrawing = (piece, strip) => pieceFlags(piece, strip).length > 0;

export const stripOf = (plan, piece) => (plan.strips || []).find((strip) => strip.number === piece.strip_number);

export const wallPieces = (plan, wallIndex) => (plan.pieces || []).filter((piece) => isOnWall(piece, wallIndex));
