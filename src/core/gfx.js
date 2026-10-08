// Процедурная графика: поверхности, кольца, свечение, небо и неоновые шейдеры. Без внешних ассетов.
import * as THREE from '../three.js';
import { TAU, clamp, lerp, smooth } from './util.js';

// ---------- Шум ----------
// Value noise: целочисленная решётка + хеш. Семплируем по поверхности сферы → бесшовная текстура.
function hash(x, y, z, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1442695041) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
export function vnoise(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const n = (a, b, c) => hash(a, b, c, s);
  const x00 = lerp(n(xi, yi, zi), n(xi + 1, yi, zi), u);
  const x10 = lerp(n(xi, yi + 1, zi), n(xi + 1, yi + 1, zi), u);
  const x01 = lerp(n(xi, yi, zi + 1), n(xi + 1, yi, zi + 1), u);
  const x11 = lerp(n(xi, yi + 1, zi + 1), n(xi + 1, yi + 1, zi + 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w);
}
export function fbm(x, y, z, oct, s) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x, y, z, s + i * 17);
    norm += amp;
    x *= 2.03; y *= 2.03; z *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

// ---------- Цвет ----------
export const hexRGB = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
// Палитра: опорные цвета, t ∈ [0,1] интерполируется между ними
function ramp(pal, t) {
  const f = clamp(t, 0, 0.9999) * (pal.length - 1);
  const i = Math.floor(f), k = f - i;
  const a = pal[i], b = pal[i + 1];
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}

// ---------- Поверхности ----------
// kind: bands (газовый гигант) | terrain (суша/океан/пустыня) | ice | lava
export function planetTexture(look, seed) {
  const W = 512, H = 256;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const pal = look.palette.map(hexRGB);

  for (let y = 0; y < H; y++) {
    const lat = (y / (H - 1) - 0.5) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = (x / W) * TAU;
      const px = cl * Math.cos(lon), py = sl, pz = cl * Math.sin(lon);
      let c;
      if (look.kind === 'bands') {
        const w = fbm(px * 2, py * 2, pz * 2, 4, seed);
        const band = 0.5 + 0.5 * Math.sin(lat * 8 + w * 5);
        c = ramp(pal, clamp(band * 0.75 + w * 0.45, 0, 1));
      } else if (look.kind === 'lava') {
        const w = fbm(px * 3.2, py * 3.2, pz * 3.2, 5, seed);
        const crack = 1 - smooth(0.0, 0.07, Math.abs(w - 0.5));
        c = ramp(pal, clamp(crack * 0.95 + w * 0.12, 0, 1));
      } else if (look.kind === 'ice') {
        const w = fbm(px * 2.6, py * 2.6, pz * 2.6, 5, seed);
        const crack = 1 - smooth(0.0, 0.03, Math.abs(w - 0.5));
        c = ramp(pal, clamp(0.5 + (w - 0.5) * 0.9 - crack * 0.55, 0, 1));
      } else {
        const h = fbm(px * 2, py * 2, pz * 2, 6, seed);
        if (look.ocean) {
          const landMix = smooth(0.49, 0.53, h);
          const sea = ramp(pal, clamp(0.08 + h * 0.5, 0, 0.42));
          const land = ramp(pal, clamp(0.58 + (h - 0.5) * 1.6, 0.58, 1));
          const cloud = smooth(0.54, 0.72, fbm(px * 3 + 9, py * 3, pz * 3, 4, seed + 5)) * 0.85;
          const base = [lerp(sea[0], land[0], landMix), lerp(sea[1], land[1], landMix), lerp(sea[2], land[2], landMix)];
          c = [lerp(base[0], 240, cloud), lerp(base[1], 246, cloud), lerp(base[2], 255, cloud)];
        } else {
          const ridge = 1 - Math.abs(fbm(px * 4, py * 4, pz * 4, 4, seed + 3) - 0.5) * 2;
          c = ramp(pal, clamp(0.15 + h * 0.9 + ridge * 0.15, 0, 1));
        }
      }
      const i = (y * W + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return srgbTexture(cv, 4);
}

// Кольца: радиальная текстура. RingGeometry даёт планарные UV, поэтому круг рисуем сами;
// внутренний край кольца соответствует радиусу 0.617 от внешнего.
export function ringTexture(palette, seed) {
  const S = 512, R = S / 2;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const pal = palette.map(hexRGB);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - R) / R, dy = (y - R) / R;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const f = (dist - 0.617) / 0.383;
      const i = (y * S + x) * 4;
      if (f < 0 || f > 1) { d[i + 3] = 0; continue; }
      const n = vnoise(f * 60, 0.5, 0.5, seed);
      const a = (0.15 + 0.55 * n) * smooth(0.0, 0.06, f) * (1 - smooth(0.86, 1.0, f));
      const c = ramp(pal, n);
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return srgbTexture(cv, 1);
}

// Облако: мягкое пятно с шумом, для небесных спрайтов
export function cloudTexture(seed) {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x / S - 0.5) * 2, dy = (y / S - 0.5) * 2;
      const r = Math.sqrt(dx * dx + dy * dy);
      const n = fbm(x / 40, y / 40, 0.3, 4, seed);
      const a = clamp((1 - r) * 1.6 + (n - 0.5) * 1.1, 0, 1) * (1 - smooth(0.8, 1, r));
      const i = (y * S + x) * 4;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return srgbTexture(cv, 1);
}

// Радиальный градиент: спрайты свечения, туманности, блики
export function radialTexture(stops, size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return srgbTexture(cv, 1);
}

let glowTex = null;
export function glow() {
  if (!glowTex) {
    glowTex = radialTexture([
      [0, 'rgba(255,255,255,1)'],
      [0.2, 'rgba(255,255,255,0.45)'],
      [0.5, 'rgba(255,255,255,0.08)'],
      [1, 'rgba(255,255,255,0)']
    ]);
  }
  return glowTex;
}

function srgbTexture(canvas, anisotropy) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

// ---------- Атмосфера и свечение ----------
const ATMO_VS = `
  varying vec3 vN;
  void main() {
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const ATMO_FS = `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vN;
  void main() {
    float i = pow(0.72 - dot(vN, vec3(0.0, 0.0, 1.0)), 2.6) * uStrength;
    gl_FragColor = vec4(uColor, clamp(i, 0.0, 1.0));
  }`;
// Атмосфера: сфера чуть больше тела, видна только по краю
export function atmosphere(radius, color, strength = 1.0) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    vertexShader: ATMO_VS,
    fragmentShader: ATMO_FS,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), mat);
}

// ---------- GLSL ----------
const GLSL_NOISE = `
  float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float n3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm3(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * n3(p); p *= 2.03; a *= 0.5; }
    return v;
  }`;

// Солнце: поверхность с ползущим шумом
export function sunMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vP;
      void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: GLSL_NOISE + `
      uniform float uTime;
      varying vec3 vP;
      void main() {
        vec3 p = normalize(vP) * 2.4;
        float g = fbm3(p * 1.4 + fbm3(p * 2.2 + uTime * 0.12));
        vec3 c = mix(vec3(1.0, 0.32, 0.08), vec3(1.0, 0.86, 0.5), smoothstep(0.25, 0.85, g));
        gl_FragColor = vec4(c * 1.5, 1.0);
      }`
  });
}

// Диск вокруг чёрной дыры или портал: вращающийся шум по радиусу и углу
export function vortexMaterial(inner, outer, colorA = [0.95, 0.38, 0.1], colorB = [1.0, 0.92, 0.7]) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uInner: { value: inner }, uOuter: { value: outer },
      uA: { value: new THREE.Vector3(...colorA) }, uB: { value: new THREE.Vector3(...colorB) }
    },
    vertexShader: `
      varying vec2 vP;
      void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: GLSL_NOISE + `
      uniform float uTime, uInner, uOuter;
      uniform vec3 uA, uB;
      varying vec2 vP;
      void main() {
        float r = length(vP);
        float a = atan(vP.y, vP.x);
        float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
        float swirl = fbm3(vec3(a * 1.6 + uTime * 0.9 - log(r) * 4.0, r * 0.05, uTime * 0.2));
        float band = smoothstep(0.0, 0.25, t) * (1.0 - smoothstep(0.7, 1.0, t));
        vec3 c = mix(uA, uB, swirl) * (0.2 + 0.85 * (1.0 - t)) * (0.6 + 0.6 * swirl);
        gl_FragColor = vec4(c * band, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
}

// Небесный купол: вертикальный градиент и мягкое солнце в направлении uSun
export function skyMaterial(top, mid, horizon, sunDir, sunColor) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(top) }, uMid: { value: new THREE.Color(mid) },
      uHorizon: { value: new THREE.Color(horizon) }, uSun: { value: sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color(sunColor) }
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uTop, uMid, uHorizon, uSun, uSunColor;
      varying vec3 vDir;
      void main() {
        float y = vDir.y;
        vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.25, y));
        c = mix(c, uTop, smoothstep(0.25, 0.8, y));
        float s = max(dot(vDir, normalize(uSun)), 0.0);
        c += uSunColor * (pow(s, 6.0) * 0.5 + pow(s, 80.0) * 1.2);
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  });
}

// Синтвейв-солнце: полоски в нижней половине
export function synthSunMaterial(top, bottom) {
  return new THREE.ShaderMaterial({
    uniforms: { uTop: { value: new THREE.Color(top) }, uBottom: { value: new THREE.Color(bottom) }, uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uTop, uBottom;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        // Нижняя половина солнца «режется» горизонтальными полосами, как на классических синтвейв-постерах
        if (p.y < -0.25 && mod(floor((p.y + 1.0) * 14.0), 2.0) < 1.0) discard;
        vec3 c = mix(uBottom, uTop, smoothstep(-1.0, 1.0, p.y));
        gl_FragColor = vec4(c, 1.0 - smoothstep(0.92, 1.0, r));
      }`,
    transparent: true,
    depthWrite: false,
    fog: false
  });
}

// Вода: тёмная поверхность с бегущими бликами
export function waterMaterial(deep, glint) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uDeep: { value: new THREE.Color(deep) }, uGlint: { value: new THREE.Color(glint) } },
    vertexShader: `
      varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: GLSL_NOISE + `
      uniform float uTime;
      uniform vec3 uDeep, uGlint;
      varying vec3 vW;
      void main() {
        float w = fbm3(vec3(vW.x * 0.02, vW.z * 0.02, uTime * 0.25));
        float glint = smoothstep(0.64, 0.74, w) * 0.3;
        vec3 c = uDeep + uGlint * glint;
        float fade = 1.0 - smoothstep(400.0, 2600.0, length(vW - cameraPosition));
        gl_FragColor = vec4(mix(uDeep * 0.6, c, fade), 1.0);
      }`
  });
}
