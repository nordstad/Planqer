import {
  MAX_PREVIEW_TRIANGLES,
  inspectStlBuffer,
} from './modelPreview';

const binaryStl = (triangles, extraBytes = 0) => {
  const buffer = new ArrayBuffer(84 + (triangles * 50) + extraBytes);
  new DataView(buffer).setUint32(80, triangles, true);
  return buffer;
};

describe('inspectStlBuffer', () => {
  it('accepts a valid binary STL', () => {
    expect(inspectStlBuffer(binaryStl(2))).toMatchObject({
      ok: true,
      format: 'binary',
      triangleCount: 2,
    });
  });

  it('accepts a binary STL with a trailing block', () => {
    expect(inspectStlBuffer(binaryStl(1, 12))).toMatchObject({ ok: true, format: 'binary' });
  });

  it('rejects a truncated binary STL', () => {
    const buffer = binaryStl(2);
    expect(inspectStlBuffer(buffer.slice(0, buffer.byteLength - 1))).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('rejects binary files above the triangle limit', () => {
    expect(inspectStlBuffer(binaryStl(MAX_PREVIEW_TRIANGLES + 1))).toEqual({
      ok: false,
      reason: 'too-complex',
    });
  });

  it('accepts a small ASCII STL', () => {
    const buffer = new TextEncoder().encode('solid cube\nendsolid cube').buffer;
    expect(inspectStlBuffer(buffer)).toMatchObject({ ok: true, format: 'ascii' });
  });

  it('rejects empty and unsupported data', () => {
    expect(inspectStlBuffer(new ArrayBuffer(0))).toEqual({ ok: false, reason: 'malformed' });
    expect(inspectStlBuffer(new TextEncoder().encode('not an stl').buffer)).toEqual({
      ok: false,
      reason: 'unsupported',
    });
  });
});
