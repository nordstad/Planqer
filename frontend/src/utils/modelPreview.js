export const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;
export const MAX_ASCII_PREVIEW_BYTES = 10 * 1024 * 1024;
export const MAX_PREVIEW_TRIANGLES = 300_000;

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
