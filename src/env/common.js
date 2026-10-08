// Общее для всех миров: цели (проекты, «обо мне», контакты), палитры и звёздное поле.
import * as THREE from '../three.js';
import { rnd, TAU } from '../core/util.js';

// Цель — то, к чему можно лететь: проект, «обо мне» или контакты. Сцена задаёт ей объект и радиус.
export function makeTarget({ id, kind, name, when, obj, radius, dockDist, accent, data, labelRange }) {
  return { id, kind, name, when, obj, radius, dockDist, accent, data, labelRange };
}

// Палитры для планет и островов. Сцена выбирает по порядку проектов.
export const PALETTES = {
  magenta: ['#1a0633', '#6a2bd9', '#ff4fa3', '#ffe3f3'],
  violet: ['#120a2a', '#3b2a8f', '#7ab8ff', '#e6f3ff'],
  ocean: ['#04203f', '#0b5aa8', '#38b6ff', '#e8f7ff'],
  gold: ['#2b1a05', '#8a5a12', '#f0b429', '#fff1b8'],
  teal: ['#03261f', '#0e7c66', '#4ff0c6', '#e6fff8'],
  ice: ['#0a1b2e', '#3d6b9e', '#a7d8ff', '#f2fbff'],
  lava: ['#0c0202', '#3a0d05', '#e0461b', '#ffc35a']
};
export const PLANET_ORDER = [
  { kind: 'bands', pal: 'magenta', ring: false },
  { kind: 'terrain', pal: 'violet', ring: true },
  { kind: 'terrain', pal: 'ocean', ring: false, ocean: true },
  { kind: 'terrain', pal: 'gold', ring: false },
  { kind: 'bands', pal: 'teal', ring: false },
  { kind: 'ice', pal: 'ice', ring: false },
  { kind: 'lava', pal: 'lava', ring: false }
];

// Звёзды: точки с мерцанием. Размер и фаза задаются на вершину, поэтому каждая звезда живёт своей жизнью.
export function starfield(scene, { count, box, pixelRatio, uTime }) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const size = new Float32Array(count), phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * box.x;
    pos[i * 3 + 1] = (Math.random() * 2 - 1) * box.y;
    pos[i * 3 + 2] = lerp(box.zMax, box.zMin, Math.random());
    const k = Math.random();
    const b = 0.45 + Math.random() * 0.55;
    const c = k < 0.7 ? [0.8, 0.87, 1] : k < 0.9 ? [1, 0.9, 0.75] : [0.85, 0.72, 1];
    col[i * 3] = c[0] * b; col[i * 3 + 1] = c[1] * b; col[i * 3 + 2] = c[2] * b;
    size[i] = 0.7 + Math.pow(Math.random(), 7) * 3.4;
    phase[i] = Math.random() * 10;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: pixelRatio } },
    vertexShader: `
      attribute float aSize; attribute float aPhase; attribute vec3 aColor;
      uniform float uTime; uniform float uPx;
      varying vec3 vC; varying float vTw;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vTw = 0.6 + 0.4 * sin(uTime * (1.0 + aPhase * 0.3) * 2.0 + aPhase * 40.0);
        gl_PointSize = min(aSize * uPx * (320.0 / -mv.z), 16.0 * uPx);
        gl_Position = projectionMatrix * mv;
        vC = aColor;
      }`,
    fragmentShader: `
      varying vec3 vC; varying float vTw;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vC * vTw, smoothstep(0.5, 0.0, d));
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  scene.add(new THREE.Points(geo, mat));
  return (dt, t) => { mat.uniforms.uTime.value = t; };
}

export function lerp(a, b, t) { return a + (b - a) * t; }
export { rnd, TAU };
