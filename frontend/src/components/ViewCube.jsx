import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CUBE_FACES, cubeMatrix3d, faceCells } from '../utils/viewNavigation';

const HALF_EDGE = 31; // px, half the cube's edge. Keep in step with .view-nav-scene.
const QUARTER_TURN = Math.PI / 2;

const FACE_PLACEMENT = {
  front: `translateZ(${HALF_EDGE}px)`,
  back: `rotateY(180deg) translateZ(${HALF_EDGE}px)`,
  right: `rotateY(90deg) translateZ(${HALF_EDGE}px)`,
  left: `rotateY(-90deg) translateZ(${HALF_EDGE}px)`,
  top: `rotateX(90deg) translateZ(${HALF_EDGE}px)`,
  bottom: `rotateX(-90deg) translateZ(${HALF_EDGE}px)`,
};

const ARROWS = [
  { id: 'up', key: 'navRotateUp', turn: [0, QUARTER_TURN], points: '4,10 9,5 14,10' },
  { id: 'down', key: 'navRotateDown', turn: [0, -QUARTER_TURN], points: '4,8 9,13 14,8' },
  { id: 'left', key: 'navRotateLeft', turn: [QUARTER_TURN, 0], points: '10,4 5,9 10,14' },
  { id: 'right', key: 'navRotateRight', turn: [-QUARTER_TURN, 0], points: '8,4 13,9 8,14' },
];

const Glyph = ({ children }) => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>
);

/*
  A FreeCAD-style navigation cube. It mirrors the camera's orientation, so it
  always shows which way the model is turned, and clicking a face, edge or
  corner flies the camera to look from there. The arrows turn the view a
  quarter turn the way the model moves, like dragging it; home returns to the
  starting view; pan makes a plain drag move the model instead of turning it.

  `navigator` comes from createCameraNavigator and is null until the viewer
  has a camera, so the cube only appears once it has something to steer.
*/
const ViewCube = ({ navigator }) => {
  const { t } = useTranslation();
  const cubeRef = useRef(null);
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    if (!navigator) return undefined;
    setPanning(false); // a fresh viewer always starts out rotating
    return navigator.subscribe((orientation) => {
      if (cubeRef.current) cubeRef.current.style.transform = cubeMatrix3d(orientation);
    });
  }, [navigator]);

  if (!navigator) return null;

  const togglePanning = () => {
    navigator.setPanning(!panning);
    setPanning(!panning);
  };

  return (
    <div className="view-nav" role="group" aria-label={t('modelUi.navGroup')}>
      <div className="view-nav-scene">
        <div className="view-nav-cube" ref={cubeRef}>
          {CUBE_FACES.map((face) => {
            const side = t(`modelUi.nav_${face.id}`);
            return (
              <div key={face.id} className="view-nav-face" style={{ transform: FACE_PLACEMENT[face.id] }}>
                {faceCells(face).map((cell) => (cell.kind === 'face' ? (
                  <button
                    key={cell.key}
                    type="button"
                    className="view-nav-cell is-face"
                    aria-label={t('modelUi.navSnapTo', { side })}
                    onClick={() => navigator.viewFrom(cell.direction)}
                  >
                    {side}
                  </button>
                ) : (
                  <span
                    key={cell.key}
                    aria-hidden="true"
                    className={`view-nav-cell is-${cell.kind}`}
                    onClick={() => navigator.viewFrom(cell.direction)}
                  />
                )))}
              </div>
            );
          })}
        </div>
      </div>

      {ARROWS.map((arrow) => (
        <button
          key={arrow.id}
          type="button"
          className={`view-nav-btn is-${arrow.id}`}
          aria-label={t(`modelUi.${arrow.key}`)}
          onClick={() => navigator.rotate(...arrow.turn)}
        >
          <Glyph><polyline points={arrow.points} /></Glyph>
        </button>
      ))}
      <button
        type="button"
        className="view-nav-btn is-home"
        aria-label={t('modelUi.navHome')}
        onClick={() => navigator.home()}
      >
        <Glyph>
          <path d="M3 9l6-5.5L15 9" />
          <path d="M5 8v6h8V8" />
        </Glyph>
      </button>
      <button
        type="button"
        className="view-nav-btn is-pan"
        aria-label={t('modelUi.navPan')}
        title={t('modelUi.navPan')}
        aria-pressed={panning}
        onClick={togglePanning}
      >
        <Glyph>
          <path d="M9 2v14M2 9h14" />
          <polyline points="7,4 9,2 11,4" />
          <polyline points="7,14 9,16 11,14" />
          <polyline points="4,7 2,9 4,11" />
          <polyline points="14,7 16,9 14,11" />
        </Glyph>
      </button>
    </div>
  );
};

export default ViewCube;
