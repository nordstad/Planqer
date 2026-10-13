import { createCameraNavigator } from './cameraNavigator';

const makeRig = ([x, y, z] = [0, 0, 10]) => {
  const listeners = new Set();
  const camera = {
    position: {
      x, y, z,
      set(nx, ny, nz) {
        this.x = nx;
        this.y = ny;
        this.z = nz;
      },
    },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
  };
  const controls = {
    target: { x: 0, y: 0, z: 0 },
    update: vi.fn(() => listeners.forEach((listener) => listener())),
    addEventListener: (_event, listener) => listeners.add(listener),
    removeEventListener: (_event, listener) => listeners.delete(listener),
  };
  return { camera, controls, listeners };
};

const at = ({ camera }) => [camera.position.x, camera.position.y, camera.position.z];
const expectNear = (actual, expected) => expected.forEach((value, axis) => (
  expect(actual[axis]).toBeCloseTo(value, 3)
));

describe('createCameraNavigator', () => {
  it('flies to a side view at the same distance', () => {
    const rig = makeRig();
    const navigator = createCameraNavigator({ ...rig, animate: false });
    navigator.viewFrom([1, 0, 0]);
    expectNear(at(rig), [10, 0, 0]);
    expect(rig.controls.update).toHaveBeenCalled();
  });

  it('keeps the azimuth when snapping to the top', () => {
    const rig = makeRig([10, 0, 0]);
    const navigator = createCameraNavigator({ ...rig, animate: false });
    navigator.viewFrom([0, 1, 0]);
    expect(rig.camera.position.y).toBeCloseTo(10, 3);
    expect(rig.camera.position.x).toBeGreaterThan(0);
    expect(rig.camera.position.z).toBeCloseTo(0, 3);
  });

  it('turns the model left by moving the camera round to its right', () => {
    const rig = makeRig();
    const navigator = createCameraNavigator({ ...rig, animate: false });
    navigator.rotate(Math.PI / 2, 0);
    expectNear(at(rig), [10, 0, 0]);
  });

  it('orbits around the controls target, not the origin', () => {
    const rig = makeRig([5, 0, 12]);
    rig.controls.target = { x: 5, y: 0, z: 2 };
    const navigator = createCameraNavigator({ ...rig, animate: false });
    navigator.viewFrom([-1, 0, 0]);
    expectNear(at(rig), [-5, 0, 2]);
  });

  it('returns home, undoing both the turn and the zoom', () => {
    const rig = makeRig([6, 4, 8]);
    const start = at(rig);
    const navigator = createCameraNavigator({ ...rig, animate: false });
    navigator.viewFrom([0, 1, 0]);
    rig.camera.position.set(1, 1, 1);
    navigator.home();
    expectNear(at(rig), start);
  });

  it('returns home to the original centre too, undoing any panning', () => {
    const rig = makeRig([0, 0, 10]);
    const navigator = createCameraNavigator({ ...rig, animate: false });
    // Panning moves the camera and its target together.
    rig.controls.target.x = 4;
    rig.controls.target.y = -2;
    rig.camera.position.set(4, -2, 10);
    navigator.home();
    expect([rig.controls.target.x, rig.controls.target.y, rig.controls.target.z]).toEqual([0, 0, 0]);
    expectNear(at(rig), [0, 0, 10]);
  });

  describe('panning', () => {
    const PAN = { mouse: 2, touch: 1 };
    const withDrag = (rig) => {
      rig.controls.mouseButtons = { LEFT: 0, RIGHT: 2 };
      rig.controls.touches = { ONE: 0, TWO: 2 };
      rig.controls.domElement = { style: { cursor: '' } };
      return rig;
    };

    it('makes a plain drag pan while on, and rotate again when off', () => {
      const rig = withDrag(makeRig());
      const navigator = createCameraNavigator({ ...rig, animate: false, panBindings: PAN });

      navigator.setPanning(true);
      expect(rig.controls.mouseButtons.LEFT).toBe(2);
      expect(rig.controls.touches.ONE).toBe(1);
      expect(rig.controls.domElement.style.cursor).toBe('move');

      navigator.setPanning(false);
      expect(rig.controls.mouseButtons.LEFT).toBe(0);
      expect(rig.controls.touches.ONE).toBe(0);
      expect(rig.controls.domElement.style.cursor).toBe('');
    });

    it('does nothing when it has not been told how to pan', () => {
      const rig = withDrag(makeRig());
      const navigator = createCameraNavigator({ ...rig, animate: false });
      navigator.setPanning(true);
      expect(rig.controls.mouseButtons.LEFT).toBe(0);
    });
  });

  it('tells subscribers the orientation now and on every change, until unsubscribed', () => {
    const rig = makeRig();
    const navigator = createCameraNavigator({ ...rig, animate: false });
    const listener = vi.fn();
    const unsubscribe = navigator.subscribe(listener);
    expect(listener).toHaveBeenCalledWith(rig.camera.quaternion);

    navigator.viewFrom([1, 0, 0]);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    navigator.viewFrom([0, 0, 1]);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(rig.listeners.size).toBe(0);
  });

  describe('animated', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    });
    afterEach(() => vi.useRealTimers());

    it('eases to the view rather than jumping, and arrives', () => {
      const rig = makeRig();
      const navigator = createCameraNavigator({ ...rig });
      navigator.viewFrom([1, 0, 0]);
      expectNear(at(rig), [0, 0, 10]);

      vi.advanceTimersByTime(150);
      const [x, , z] = at(rig);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(10);
      expect(z).toBeGreaterThan(0);

      vi.advanceTimersByTime(400);
      expectNear(at(rig), [10, 0, 0]);
    });

    it('stops a flight in progress when disposed', () => {
      const rig = makeRig();
      const navigator = createCameraNavigator({ ...rig });
      navigator.viewFrom([1, 0, 0]);
      vi.advanceTimersByTime(100);
      const midway = at(rig);
      navigator.dispose();
      vi.advanceTimersByTime(500);
      expectNear(at(rig), midway);
    });
  });
});
