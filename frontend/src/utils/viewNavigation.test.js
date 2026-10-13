import {
  CUBE_FACES,
  cubeMatrix3d,
  faceCells,
  fromSpherical,
  MAX_PHI,
  MIN_PHI,
  rotateSpherical,
  shortestAngle,
  sphericalForView,
  toSpherical,
} from './viewNavigation';

const cross = ([ax, ay, az], [bx, by, bz]) => [
  ay * bz - az * by,
  az * bx - ax * bz,
  ax * by - ay * bx,
].map((value) => value + 0); // normalises -0

describe('CUBE_FACES', () => {
  it('looks outwards: right × down points into the face, so nothing is mirrored', () => {
    CUBE_FACES.forEach((face) => {
      expect(cross(face.right, face.down)).toEqual(face.normal.map((n) => (n === 0 ? 0 : -n)));
    });
  });
});

describe('faceCells', () => {
  it('gives each face a centre, four edges and four corners', () => {
    CUBE_FACES.forEach((face) => {
      const kinds = faceCells(face).map((cell) => cell.kind);
      expect(kinds.filter((k) => k === 'face')).toHaveLength(1);
      expect(kinds.filter((k) => k === 'edge')).toHaveLength(4);
      expect(kinds.filter((k) => k === 'corner')).toHaveLength(4);
    });
  });

  it('makes the centre of a face look along its normal', () => {
    CUBE_FACES.forEach((face) => {
      const centre = faceCells(face).find((cell) => cell.kind === 'face');
      expect(centre.direction).toEqual(face.normal);
    });
  });

  it('reaches exactly the 26 directions around a cube, edges agreeing from both sides', () => {
    const directions = new Set(
      CUBE_FACES.flatMap(faceCells).map((cell) => cell.direction.join(',')),
    );
    expect(directions.size).toBe(26);
  });

  it('puts the right-top-front corner at the top right of the front face', () => {
    const front = CUBE_FACES.find((face) => face.id === 'front');
    const [topRight] = faceCells(front).filter((cell) => cell.key === 'front:1:-1');
    expect(topRight.direction).toEqual([1, 1, 1]);
  });
});

describe('spherical coordinates', () => {
  it('round-trips a direction', () => {
    const point = [3, 4, -5];
    const back = fromSpherical(toSpherical(point));
    point.forEach((value, axis) => expect(back[axis]).toBeCloseTo(value));
  });

  it('treats +Z as the front view', () => {
    const { phi, theta } = toSpherical([0, 0, 10]);
    expect(phi).toBeCloseTo(Math.PI / 2);
    expect(theta).toBeCloseTo(0);
  });

  it('takes the short way round', () => {
    expect(shortestAngle(0, (3 * Math.PI) / 2)).toBeCloseTo(-Math.PI / 2);
    expect(shortestAngle(3, -3)).toBeCloseTo((2 * Math.PI) - 6);
  });

  it('keeps the current azimuth when looking straight down or up', () => {
    const current = { radius: 10, phi: 1, theta: 0.7 };
    expect(sphericalForView(current, [0, 1, 0])).toMatchObject({ radius: 10, theta: 0.7, phi: MIN_PHI });
    expect(sphericalForView(current, [0, -1, 0]).phi).toBe(MAX_PHI);
  });

  it('takes the azimuth of a side view, at the current distance', () => {
    const view = sphericalForView({ radius: 7, phi: 1, theta: 0.7 }, [1, 0, 0]);
    expect(view.radius).toBe(7);
    expect(view.theta).toBeCloseTo(Math.PI / 2);
    expect(view.phi).toBeCloseTo(Math.PI / 2);
  });

  it('never rotates past the poles', () => {
    const start = { radius: 5, phi: 1, theta: 0 };
    expect(rotateSpherical(start, 0, 10).phi).toBe(MAX_PHI);
    expect(rotateSpherical(start, 0, -10).phi).toBe(MIN_PHI);
    expect(rotateSpherical(start, 0.5, 0).theta).toBe(0.5);
  });
});

describe('cubeMatrix3d', () => {
  it('leaves the cube square-on for an untouched camera', () => {
    expect(cubeMatrix3d({ x: 0, y: 0, z: 0, w: 1 })).toBe(
      'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)',
    );
  });

  it('brings the right face to the front when the camera looks from +X', () => {
    const half = Math.SQRT1_2;
    // A camera turned 90° about Y looks along -X, from the right of the model.
    const matrix = cubeMatrix3d({ x: 0, y: half, z: 0, w: half });
    expect(matrix).toBe('matrix3d(0,0,1,0,0,1,0,0,-1,0,0,0,0,0,0,1)');
  });
});
