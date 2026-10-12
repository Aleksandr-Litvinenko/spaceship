// Постобработка: HDR-рендер → блум → тонмаппинг ACES → цветокоррекция с зерном, виньеткой и аберрацией.
// Работает только на качестве high/ultra; на low сцена рисуется напрямую (см. render.js).
import * as THREE from '../three.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';

// Финальный проход: лёгкая хроматическая аберрация у краёв, виньетка, тёплый тон и зерно плёнки
const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.028 },
    uAberration: { value: 0.0013 },
    uWarm: { value: 0.35 },
    uRes: { value: new THREE.Vector2(1920, 1080) }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uAberration, uWarm;
    uniform vec2 uRes;
    varying vec2 vUv;
    float rnd(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * uAberration * (1.0 + r2 * 4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col *= 1.0 - uVignette * smoothstep(0.2, 0.95, r2 * 2.0);
      col = mix(col, col * vec3(1.05, 1.0, 0.92), uWarm);
      col += (rnd(vUv * uRes + fract(uTime) * 91.0) - 0.5) * uGrain;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`
};

export function createPost({ renderer, scene, camera, width, height, pixelRatio, samples = 4, bloom = 0.42, threshold = 1.1 }) {
  const rt = new THREE.WebGLRenderTarget(width * pixelRatio, height * pixelRatio, {
    type: THREE.HalfFloatType,
    samples
  });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);

  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), bloom, 0.5, threshold);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GRADE);
  composer.addPass(grade);

  return {
    composer,
    bloom: bloomPass,
    grade,
    render(t) {
      grade.uniforms.uTime.value = t;
      composer.render();
    },
    setSize(w, h) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
      grade.uniforms.uRes.value.set(w * pixelRatio, h * pixelRatio);
    }
  };
}
