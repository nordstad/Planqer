import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  colourForModelGroup,
  formatModelDimensions,
  layoutModelParts,
} from '../utils/modelPreview';

const PREVIEW_HEIGHT = 360;

const opacityFor = (groupId, selectedIds, highlightedGroupId) => {
  if (!selectedIds.has(groupId)) return 0.12;
  if (highlightedGroupId && highlightedGroupId !== groupId) return 0.24;
  return 1;
};

const disposeScene = (scene) => {
  scene.traverse((object) => {
    if (!object.geometry) return;
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose();
  });
};

const ModelPartsPreview = ({ groups, selectedIds, highlightedGroupId }) => {
  const { t } = useTranslation();
  const hostRef = useRef(null);
  const meshesRef = useRef([]);
  const [open, setOpen] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const layout = useMemo(() => layoutModelParts(groups), [groups]);

  useEffect(() => {
    let scene;
    let renderer;
    let controls;
    let animationFrame;
    let resizeObserver;
    let resizeHandler;
    let cancelled = false;
    const meshes = [];
    const host = hostRef.current;

    const cleanup = () => {
      cancelled = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      if (resizeHandler) window.removeEventListener('resize', resizeHandler);
      controls?.dispose();
      if (scene) disposeScene(scene);
      renderer?.dispose();
      if (renderer?.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      meshesRef.current = [];
    };

    if (!open || !host || layout.items.length === 0) return cleanup;

    try {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf2efe6);
      const size = layout.size;
      const center = new THREE.Vector3(size.x / 2, size.y / 2, size.z / 2);
      const maxDimension = Math.max(size.x, size.y, size.z, 1);
      const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000000);
      camera.position.set(maxDimension * 1.6, maxDimension * 1.1, maxDimension * 1.6);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.tabIndex = 0;
      renderer.domElement.setAttribute('aria-label', t('modelUi.partsPreviewCanvasAria'));
      host.replaceChildren(renderer.domElement);

      layout.items.forEach((item) => {
        const geometry = new THREE.BoxGeometry(item.length, item.thickness, item.width);
        const material = new THREE.MeshStandardMaterial({
          color: colourForModelGroup(item.groupId),
          roughness: 0.72,
          metalness: 0.04,
          transparent: true,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
          item.position.x - center.x,
          item.position.y - center.y,
          item.position.z - center.z,
        );
        scene.add(mesh);
        meshes.push({ mesh, groupId: item.groupId });
      });
      meshesRef.current = meshes;

      scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8878, 2.4));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
      keyLight.position.set(maxDimension, maxDimension * 2, maxDimension);
      scene.add(keyLight);
      const grid = new THREE.GridHelper(
        Math.max(size.x, size.z, 100) * 1.2,
        12,
        0xb1aa99,
        0xd6d2c2,
      );
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
      setUnavailable(false);
    } catch {
      cleanup();
      setUnavailable(true);
    }

    return cleanup;
  }, [groups, layout, open, t]);

  useEffect(() => {
    meshesRef.current.forEach(({ mesh, groupId }) => {
      mesh.material.opacity = opacityFor(groupId, selectedIds, highlightedGroupId);
    });
  }, [highlightedGroupId, selectedIds]);

  return (
    <section aria-label={t('modelUi.partsPreviewTitle')} style={{ marginBottom: '24px' }}>
      <div className="section-rule" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
        <h2 className="section-title">{t('modelUi.partsPreviewTitle')}</h2>
        <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {t(open ? 'modelUi.hidePartsPreview' : 'modelUi.showPartsPreview')}
        </button>
      </div>
      {open && (
        <>
          <p className="step-lede" style={{ marginBottom: '12px' }}>
            {t('modelUi.partsPreviewDescription')}
          </p>
          <div
            ref={hostRef}
            role="img"
            aria-label={t('modelUi.partsPreviewCanvasAria')}
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
            {unavailable
              ? t('modelUi.partsPreviewUnavailable')
              : t('modelUi.partsPreviewSummary', {
                shown: layout.displayedQuantity,
                total: layout.totalQuantity,
              })}
          </p>
          {layout.aggregated && (
            <p className="synthetic" style={{ margin: '4px 0 0' }}>
              {t('modelUi.partsPreviewAggregated')}
            </p>
          )}
          <p className="synthetic" style={{ margin: '4px 0 0' }}>
            {t('modelUi.partsPreviewDimensions', { dimensions: formatModelDimensions(layout.size) })}
          </p>
        </>
      )}
    </section>
  );
};

export default ModelPartsPreview;
