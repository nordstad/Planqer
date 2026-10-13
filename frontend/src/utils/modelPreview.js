export const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;
export const MAX_ASCII_PREVIEW_BYTES = 10 * 1024 * 1024;
export const MAX_PREVIEW_TRIANGLES = 300_000;
export const MODEL_PREVIEW_INSTANCE_LIMIT = 500;
export const MODEL_GROUP_COLOURS = ['#a34f18', '#3d6a2c', '#276678', '#7b4b94', '#b56b1f', '#8c3d3d'];

const ASCII_HEADER_BYTES = 512;
const BINARY_HEADER_BYTES = 84;
const BINARY_TRIANGLE_BYTES = 50;

const startsLikeAsciiStl = (buffer) => {
  const header = new TextDecoder().decode(
    new Uint8Array(buffer, 0, Math.min(buffer.byteLength, ASCII_HEADER_BYTES)),
  );
  return /^\s*solid\b/i.test(header);
};

const binaryTriangleCount = (buffer) => {
  if (buffer.byteLength < BINARY_HEADER_BYTES) return null;
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  const expectedBytes = BINARY_HEADER_BYTES + (count * BINARY_TRIANGLE_BYTES);
  const ascii = startsLikeAsciiStl(buffer);

  // An exact binary length is a strong signal even when the 80-byte binary
  // header happens to begin with "solid". Non-ASCII files may contain a small
  // trailing block, which is also harmless to STLLoader.
  if (expectedBytes === buffer.byteLength || (!ascii && expectedBytes <= buffer.byteLength)) {
    return { count, expectedBytes };
  }
  if (!ascii && expectedBytes > buffer.byteLength) {
    return { count, expectedBytes };
  }
  return null;
};

export const inspectStlBuffer = (buffer) => {
  if (!buffer || typeof buffer.byteLength !== 'number' || buffer.byteLength === 0) {
    return { ok: false, reason: 'malformed' };
  }
  if (buffer.byteLength > MAX_PREVIEW_BYTES) {
    return { ok: false, reason: 'too-large' };
  }

  const binary = binaryTriangleCount(buffer);
  if (binary) {
    if (binary.expectedBytes > buffer.byteLength) {
      return { ok: false, reason: 'malformed' };
    }
    if (binary.count > MAX_PREVIEW_TRIANGLES) {
      return { ok: false, reason: 'too-complex' };
    }
    return { ok: true, format: 'binary', triangleCount: binary.count };
  }

  if (!startsLikeAsciiStl(buffer)) {
    return { ok: false, reason: 'unsupported' };
  }
  if (buffer.byteLength > MAX_ASCII_PREVIEW_BYTES) {
    return { ok: false, reason: 'too-large' };
  }

  return { ok: true, format: 'ascii', triangleCount: null };
};

export const formatModelDimensions = (size) => (
  [size.x, size.y, size.z].map((value) => Math.round(value).toLocaleString('sv-SE')).join(' × ')
);

export const colourForModelGroup = (groupId) => {
  let hash = 0;
  for (const character of String(groupId)) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return MODEL_GROUP_COLOURS[hash % MODEL_GROUP_COLOURS.length];
};

const dimensionsOf = (group, entry) => ({
  length: Number(entry.length),
  width: Number(group.kind === 'board' ? group.width : entry.width),
  thickness: Number(group.thickness),
});

const entriesOf = (group) => (group.kind === 'board' ? group.lengths : group.sizes)
  .map((entry) => ({
    ...dimensionsOf(group, entry),
    quantity: Math.max(0, Math.floor(Number(entry.qty) || 0)),
  }))
  .filter((entry) => entry.length > 0 && entry.width > 0 && entry.thickness > 0 && entry.quantity > 0);

export const layoutModelParts = (
  groups,
  selectedIds = new Set(),
  maxInstances = MODEL_PREVIEW_INSTANCE_LIMIT,
) => {
  const sources = groups.flatMap((group) => entriesOf(group).map((entry) => ({
    ...entry,
    groupId: group.id,
    selected: selectedIds.size === 0 || selectedIds.has(group.id),
  })));
  const totalQuantity = sources.reduce((total, source) => total + source.quantity, 0);
  const aggregated = totalQuantity > maxInstances;
  const items = [];

  sources.forEach((source) => {
    const count = aggregated ? 1 : source.quantity;
    for (let index = 0; index < count; index += 1) {
      items.push({
        ...source,
        instance: index,
        displayedQuantity: source.quantity,
        aggregated,
      });
    }
  });

  const maxLength = Math.max(...items.map((item) => item.length), 1);
  const gap = Math.max(40, Math.min(160, maxLength * 0.08));
  const laneWidth = Math.max(4000, maxLength + gap);
  let x = 0;
  let z = 0;
  let rowDepth = 0;
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  let previousGroupId = null;

  items.forEach((item) => {
    if (item.groupId !== previousGroupId) {
      if (previousGroupId !== null) z += rowDepth + gap;
      x = 0;
      rowDepth = 0;
      previousGroupId = item.groupId;
    }
    if (x > 0 && x + item.length > laneWidth) {
      x = 0;
      z += rowDepth + gap;
      rowDepth = 0;
    }
    item.position = {
      x: x + (item.length / 2),
      y: item.thickness / 2,
      z: z + (item.width / 2),
    };
    x += item.length + gap;
    rowDepth = Math.max(rowDepth, item.width);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, item.thickness);
    maxZ = Math.max(maxZ, z + item.width);
  });

  return {
    items,
    totalQuantity,
    displayedQuantity: items.length,
    aggregated,
    size: { x: maxX, y: maxY, z: maxZ },
  };
};
