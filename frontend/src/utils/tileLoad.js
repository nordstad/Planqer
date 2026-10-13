/* Diagonal layouts search many more positions than the others. Measured in the
   browser (a fast desktop), 7.5 m² took about 3 s and 27 m² about 10 s, and a
   phone is slower still. Ten square metres is where it starts to be worth a
   word. The full version runs on the server's own Python and is faster. */
const HEAVY_AREA_MM2 = 10_000_000;

export const isHeavyTileJob = (pattern, widthMm, heightMm) => {
  const area = Number.parseFloat(widthMm) * Number.parseFloat(heightMm);
  return pattern.startsWith('diagonal') && area >= HEAVY_AREA_MM2;
};
