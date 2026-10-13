import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import {
  formatModelDimensions,
  inspectStlBuffer,
  MAX_PREVIEW_TRIANGLES,
} from '../utils/modelPreview';

const PREVIEW_HEIGHT = 360;

const disposeScene = (scene) => {
  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose();
  });
};

const ModelPreview = ({ file }) => {
  const { t } = useTranslation();
  const hostRef = useRef(null);
  const [status, setStatus] = useState({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    let renderer;
    let scene;
    let controls;
    let geometry;
    let animationFrame;
    let resizeObserver;
    let resizeHandler;

    const cleanup = () => {
      cancelled = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      if (resizeHandler) window.removeEventListener('resize', resizeHandler);
      controls?.dispose();
      if (scene) disposeScene(scene);
      geometry?.dispose();
      renderer?.dispose();
      if (renderer?.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };

    const load = async () => {
      setStatus({ kind: 'loading' });
      try {
        const buffer = await file.arrayBuffer();
        if (cancelled) return;

        const inspection = inspectStlBuffer(buffer);
        if (!inspection.ok) {
          setStatus({ kind: inspection.reason });
          return;
        }

        geometry = new STLLoader().parse(buffer);
        const triangleCount = geometry.getAttribute('position')?.count / 3;
        if (!Number.isFinite(triangleCount) || triangleCount === 0) {
          throw new Error('empty');
        }
        if (triangleCount > MAX_PREVIEW_TRIANGLES) {
          setStatus({ kind: 'too-complex' });
          geometry.dispose();
          return;
        }

        geometry.computeBoundingBox();
        const bounds = geometry.boundingBox;
        if (!bounds) throw new Error('no-bounds');
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        geometry.translate(-center.x, -center.y, -center.z);

        const host = hostRef.current;
        if (!host || cancelled) {
          geometry.dispose();
          return;
        }

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf2efe6);
        const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000000);
        const maxDimension = Math.max(size.x, size.y, size.z, 1);
        camera.position.set(maxDimension * 1.6, maxDimension * 1.1, maxDimension * 1.6);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        renderer.domElement.tabIndex = 0;
        renderer.domElement.setAttribute('aria-label', t('modelUi.previewCanvasAria'));
        host.replaceChildren(renderer.domElement);

        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ color: 0xa34f18, roughness: 0.72, metalness: 0.04 }),
        );
        scene.add(mesh);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8878, 2.4));
        const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
        keyLight.position.set(maxDimension, maxDimension * 2, maxDimension);
        scene.add(keyLight);

        const gridSize = Math.max(maxDimension * 2.4, 100);
        const grid = new THREE.GridHelper(gridSize, 12, 0xb1aa99, 0xd6d2c2);
        grid.position.y = -size.y / 2;
        scene.add(grid);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = Math.max(maxDimension * 0.2, 0.1);
        controls.maxDistance = maxDimension * 10;
        controls.target.set(0, 0, 0);
        controls.listenToKeyEvents(renderer.domElement);
        controls.update();

        const resize = () => {
          if (!renderer || !host) return;
          const width = Math.max(host.clientWidth, 1);
          const height = Math.max(host.clientHeight, 1);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        };
        resize();
        if (typeof ResizeObserver === 'function') {
          resizeObserver = new ResizeObserver(resize);
          resizeObserver.observe(host);
        } else {
          resizeHandler = resize;
          window.addEventListener('resize', resizeHandler);
        }

        const render = () => {
          if (cancelled) return;
          controls.update();
          renderer.render(scene, camera);
          animationFrame = requestAnimationFrame(render);
        };
        render();
        setStatus({ kind: 'ready', dimensions: formatModelDimensions(size) });
      } catch {
        if (!cancelled) {
          cleanup();
          setStatus({ kind: 'unavailable' });
        }
      }
    };

    load();
    return cleanup;
  }, [file, t]);

  const statusMessage = {
    loading: t('modelUi.previewLoading'),
    'too-large': t('modelUi.previewTooLarge'),
    'too-complex': t('modelUi.previewTooComplex'),
    malformed: t('modelUi.previewUnavailable'),
    unsupported: t('modelUi.previewUnavailable'),
    unavailable: t('modelUi.previewUnavailable'),
  }[status.kind];

  return (
    <section aria-label={t('modelUi.previewTitle')} style={{ marginTop: '20px' }}>
      <div
        ref={hostRef}
        role="img"
        aria-label={status.kind === 'ready'
          ? t('modelUi.previewCanvasWithDimensions', { dimensions: status.dimensions })
          : t('modelUi.previewCanvasAria')}
        style={{
          height: `${PREVIEW_HEIGHT}px`,
          border: '1px solid var(--ink-4)',
          borderRadius: '14px',
          overflow: 'hidden',
          background: 'var(--ground-2)',
          position: 'relative',
        }}
      />
      <p className="synthetic" role="status" style={{ margin: '8px 0 0' }}>
        {status.kind === 'ready'
          ? t('modelUi.previewDimensions', { dimensions: status.dimensions })
          : statusMessage}
      </p>
    </section>
  );
};

export default ModelPreview;
