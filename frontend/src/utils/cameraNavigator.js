import {
  fromSpherical,
  rotateSpherical,
  shortestAngle,
  sphericalForView,
  toSpherical,
} from './viewNavigation';

const DURATION_MS = 300;

const easeInOut = (progress) => (
  progress < 0.5 ? 2 * progress * progress : 1 - ((-2 * progress + 2) ** 2) / 2
);

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

/*
  Drives an orbit camera from the view cube. It only needs the camera's
  position and quaternion and the controls' target, update and change event,
  so it works with Three.js's OrbitControls and with a plain fake in tests.

  Create it once the camera is in its starting position: that position is what
  `home` returns to.
*/
export const createCameraNavigator = ({
  camera, controls, animate = true, panBindings = null,
}) => {
  let frame = null;

  const readTarget = () => [controls.target.x, controls.target.y, controls.target.z];

  const read = () => toSpherical([
    camera.position.x - controls.target.x,
    camera.position.y - controls.target.y,
    camera.position.z - controls.target.z,
  ]);

  const apply = (spherical, point = readTarget()) => {
    const [x, y, z] = fromSpherical(spherical);
    [controls.target.x, controls.target.y, controls.target.z] = point;
    camera.position.set(point[0] + x, point[1] + y, point[2] + z);
    controls.update();
  };

  const stop = () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };

  const goTo = (target, point = readTarget()) => {
    stop();
    if (!animate || prefersReducedMotion()) {
      apply(target, point);
      return;
    }
    const from = read();
    const fromPoint = readTarget();
    const turn = shortestAngle(from.theta, target.theta);
    const started = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - started) / DURATION_MS);
      const eased = easeInOut(progress);
      apply({
        radius: from.radius + (target.radius - from.radius) * eased,
        phi: from.phi + (target.phi - from.phi) * eased,
        theta: from.theta + turn * eased,
      }, fromPoint.map((value, axis) => value + (point[axis] - value) * eased));
      frame = progress < 1 ? requestAnimationFrame(step) : null;
    };
    frame = requestAnimationFrame(step);
  };

  const home = read();
  const homePoint = readTarget();
  const dragBindings = { mouse: controls.mouseButtons?.LEFT, touch: controls.touches?.ONE };

  return {
    viewFrom: (direction) => goTo(sphericalForView(read(), direction)),
    rotate: (deltaTheta, deltaPhi) => goTo(rotateSpherical(read(), deltaTheta, deltaPhi)),
    /* Back to the starting angle, distance and centre, undoing any panning. */
    home: () => goTo({ ...home }, homePoint),
    /* While on, a plain drag pans instead of rotating. Panning otherwise
       needs a right-button or shift drag, which a trackpad or touch screen
       makes hard to find. */
    setPanning: (on) => {
      if (!panBindings) return;
      if (controls.mouseButtons) controls.mouseButtons.LEFT = on ? panBindings.mouse : dragBindings.mouse;
      if (controls.touches) controls.touches.ONE = on ? panBindings.touch : dragBindings.touch;
      if (controls.domElement) controls.domElement.style.cursor = on ? 'move' : '';
    },
    /* Calls `listener` with the camera's orientation now and whenever it
       changes, however it changed: dragging, zooming, or this navigator. */
    subscribe: (listener) => {
      const notify = () => listener(camera.quaternion);
      controls.addEventListener('change', notify);
      notify();
      return () => controls.removeEventListener('change', notify);
    },
    dispose: stop,
  };
};
