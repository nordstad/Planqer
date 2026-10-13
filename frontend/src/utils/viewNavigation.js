/*
  The maths behind the 3D view cube, kept free of Three.js so it can be tested
  without a WebGL context.

  Scene axes are Three.js's: +Y is up, and a camera on +Z looking at the origin
  is the FRONT view. STL and CAD files are Z-up, so the model preview rotates
  its geometry into this frame before anything here is used.
*/

export const MIN_PHI = 0.0001;
export const MAX_PHI = Math.PI - MIN_PHI;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/* Each face of the cube: the world direction it looks along, and the world
   directions its own right and down run in. The 3×3 cells of a face are the
   face itself (centre), the edges it shares with its neighbours, and the
   corners — every one is a view direction. */
export const CUBE_FACES = [
  { id: 'front', normal: [0, 0, 1], right: [1, 0, 0], down: [0, -1, 0] },
  { id: 'back', normal: [0, 0, -1], right: [-1, 0, 0], down: [0, -1, 0] },
  { id: 'right', normal: [1, 0, 0], right: [0, 0, -1], down: [0, -1, 0] },
  { id: 'left', normal: [-1, 0, 0], right: [0, 0, 1], down: [0, -1, 0] },
  { id: 'top', normal: [0, 1, 0], right: [1, 0, 0], down: [0, 0, 1] },
  { id: 'bottom', normal: [0, -1, 0], right: [1, 0, 0], down: [0, 0, -1] },
];

const KINDS = { 1: 'face', 2: 'edge', 3: 'corner' };

export const faceCells = (face) => {
  const cells = [];
  [-1, 0, 1].forEach((row) => {
    [-1, 0, 1].forEach((column) => {
      const direction = face.normal.map(
        (n, axis) => n + (column * face.right[axis]) + (row * face.down[axis]),
      );
      const axes = direction.filter((value) => value !== 0).length;
      cells.push({
        key: `${face.id}:${column}:${row}`,
        direction,
        kind: KINDS[axes],
      });
    });
  });
  return cells;
};

export const toSpherical = ([x, y, z]) => {
  const radius = Math.hypot(x, y, z);
  return {
    radius,
    phi: radius === 0 ? Math.PI / 2 : Math.acos(clamp(y / radius, -1, 1)),
    theta: Math.atan2(x, z),
  };
};

export const fromSpherical = ({ radius, phi, theta }) => {
  const flat = radius * Math.sin(phi);
  return [flat * Math.sin(theta), radius * Math.cos(phi), flat * Math.cos(theta)];
};

export const shortestAngle = (from, to) => {
  const turn = Math.PI * 2;
  return ((((to - from + Math.PI) % turn) + turn) % turn) - Math.PI;
};

/* Where the camera should be to look from `direction`, at the distance it is
   at now. Looking straight down or up has no azimuth of its own, so the
   current one is kept rather than spinning the model to an arbitrary side. */
export const sphericalForView = (current, direction) => {
  const target = toSpherical(direction);
  const vertical = Math.abs(direction[0]) < 1e-9 && Math.abs(direction[2]) < 1e-9;
  return {
    radius: current.radius,
    phi: clamp(target.phi, MIN_PHI, MAX_PHI),
    theta: vertical ? current.theta : target.theta,
  };
};

export const rotateSpherical = (current, deltaTheta, deltaPhi) => ({
  radius: current.radius,
  phi: clamp(current.phi + deltaPhi, MIN_PHI, MAX_PHI),
  theta: current.theta + deltaTheta,
});

const cssNumber = (value) => (Math.abs(value) < 1e-6 ? 0 : Number(value.toFixed(5)));

/* The CSS transform that turns the cube the way the camera is turned.

   The camera's quaternion rotates view space into the world, so the cube needs
   its inverse (the transpose). CSS has +Y pointing down where the scene has it
   pointing up, which flips the sign of the Y row and column. */
export const cubeMatrix3d = ({ x, y, z, w }) => {
  const rotation = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
  const entry = (row, column) => (
    rotation[column][row] * ((row === 1) !== (column === 1) ? -1 : 1)
  );
  const values = [
    entry(0, 0), entry(1, 0), entry(2, 0), 0,
    entry(0, 1), entry(1, 1), entry(2, 1), 0,
    entry(0, 2), entry(1, 2), entry(2, 2), 0,
    0, 0, 0, 1,
  ];
  return `matrix3d(${values.map(cssNumber).join(',')})`;
};
