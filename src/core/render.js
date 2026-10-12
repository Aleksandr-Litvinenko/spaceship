// Рендерер и пресеты качества. Качество выбирается автоматически по устройству, его можно задать ?q=low|high|ultra.
import * as THREE from '../three.js';

export const QUALITY = {
  low: { pixelRatio: 1, post: false, shadows: false, shadowSize: 512, planetSize: 512, samples: 0, bloom: 0, stars: 0.5 },
  high: { pixelRatio: 1.5, post: true, shadows: true, shadowSize: 2048, planetSize: 1024, samples: 4, bloom: 0.42, stars: 1 },
  ultra: { pixelRatio: 2, post: true, shadows: true, shadowSize: 4096, planetSize: 2048, samples: 4, bloom: 0.5, stars: 1.4 }
};

export function chooseQuality(param) {
  if (param && QUALITY[param]) return param;
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || innerWidth < 720;
  const weak = (navigator.deviceMemory || 8) <= 4;
  return mobile || weak ? 'low' : 'high';
}

export function createRenderer(canvas, quality) {
  const q = QUALITY[quality];
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !q.post,           // при постобработке сглаживание делает сам композер
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.pixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

// Карта окружения для отражений: сцену-небо (или космос) один раз сворачиваем в PMREM.
// Металл, лак и вода после этого отражают настоящее небо, а не серый фон.
export function buildEnvironment(renderer, envScene, sigma = 0.02) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, sigma, 0.1, 10000);
  pmrem.dispose();
  return rt.texture;
}
