export const boardStockLabel = (material, thickness, width, fallback = '') => {
  const name = material?.trim() || fallback;
  const t = Number(thickness);
  const w = Number(width);
  if (!(t > 0 && w > 0)) return name;
  const matches = [...name.matchAll(/(?:^|[^\d.,])(\d+(?:[.,]\d+)?)\s*[×xX]\s*(\d+(?:[.,]\d+)?)(?![\d.,])/g)];
  if (matches.some((match) => Number(match[1].replace(',', '.')) === t && Number(match[2].replace(',', '.')) === w)) return name;
  return [name, `${t} × ${w} mm`].filter(Boolean).join(' · ');
};
