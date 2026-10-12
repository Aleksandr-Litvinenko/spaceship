// Графика: поверхности планет, облака, вода, асфальт, краска, туманности, атмосфера, солнце, портал.
// Почти всё запекается на GPU (см. bake.js) — без внешних ассетов, но с физическими картами
// (альбедо, нормали, шероховатость), поэтому свет и отражения ведут себя как у настоящих материалов.
import * as THREE from '../three.js';
import { bake, normalFromHeight, GLSL_NOISE } from './bake.js';
import { clamp, smooth } from './util.js';

// ---------- Палитры ----------
// Цвета в линейном пространстве: THREE.Color сам переводит hex из sRGB
const lin = (hex) => new THREE.Color(hex);

// Внутренние помощники: общая функция ramp по четырём линейным цветам
const RAMP = `
  uniform vec3 uC0, uC1, uC2, uC3;
  vec3 ramp(float t) {
    t = clamp(t, 0.0, 0.9999) * 3.0;
    if (t < 1.0) return mix(uC0, uC1, t);
    if (t < 2.0) return mix(uC1, uC2, t - 1.0);
    return mix(uC2, uC3, t - 2.0);
  }`;

// Поверхность планеты: альбедо в rgb, рельеф в a. kind: 0 газовый гигант, 1 суша, 2 океан, 3 лёд, 4 лава, 5 камень
const SURFACE = `
  uniform float uKind, uSeed, uBands;
  ${RAMP}
  void main() {
    vec3 d = sphDir(vUv);
    vec3 sd = d + vec3(uSeed);
    vec3 col = vec3(0.5);
    float h = 0.5;
    if (uKind < 0.5) {
      // Газовый гигант: зональные полосы, закрученные турбулентностью
      float lat = (vUv.y - 0.5) * 3.14159;
      float w = warpFbm(sd * 1.6, 5);
      float bands = 0.5 + 0.5 * sin(lat * uBands + w * 5.0);
      float turb = fbm(sd * 7.0 + vec3(bands * 1.5, 0.0, 0.0), 5);
      // Тона ближе друг к другу и смешаны с турбулентностью: газ, а не полосатый арбуз
      float t = clamp(0.42 + (bands - 0.5) * 0.45 + (turb - 0.5) * 0.7, 0.0, 1.0);
      col = ramp(t) * (0.9 + 0.18 * turb);
      float storm = smoothstep(0.62, 0.75, fbm(sd * vec3(3.0, 9.0, 3.0), 4)) * smoothstep(0.7, 0.2, abs(lat));
      col = mix(col, uC3, storm * 0.35);
      h = 0.5 + 0.12 * (turb - 0.5) + 0.08 * (bands - 0.5);
    } else if (uKind < 1.5) {
      // Суша: горы — гребни, равнины — мягкие переходы, пыль поверх
      float base = warpFbm(sd * 2.1, 6);
      float ridge = 1.0 - abs(fbm(sd * 4.5, 5) * 2.0 - 1.0);
      h = clamp(base * 0.8 + ridge * ridge * 0.35, 0.0, 1.0);
      col = ramp(h * 1.05);
      col *= 0.82 + 0.36 * fbm(sd * 22.0, 3);
    } else if (uKind < 2.5) {
      // Океан: глубина по шуму, суша с горами, береговая линия
      float h0 = warpFbm(sd * 1.9, 6);
      float land = smoothstep(0.5, 0.515, h0);
      float depth = clamp((0.515 - h0) * 5.0, 0.0, 1.0);
      vec3 sea = mix(uC2, uC0, depth);
      float hl = clamp((h0 - 0.515) * 2.4, 0.0, 1.0);
      vec3 landC = mix(uC1, uC3, hl * hl);
      col = mix(sea, landC, land);
      col *= 0.9 + 0.2 * fbm(sd * 16.0, 3) * (1.0 - land * 0.5);
      h = mix(0.46, 0.52 + hl * 0.2, land);
    } else if (uKind < 3.5) {
      // Лёд: трещины по ячейкам Вороного, мутный голубой лёд
      vec2 w = worley(sd * 4.5);
      float crack = smoothstep(0.0, 0.07, w.y - w.x);
      float base = warpFbm(sd * 2.5, 5);
      col = mix(uC0, mix(uC1, uC2, base), crack);
      col = mix(col, uC3, smoothstep(0.55, 0.8, base) * 0.5);
      h = crack * 0.6 + base * 0.2;
    } else if (uKind < 4.5) {
      // Лава: тёмная порода и светящиеся трещины
      vec2 w = worley(sd * 5.0);
      float edge = 1.0 - smoothstep(0.0, 0.06, w.y - w.x);
      float n = fbm(sd * 5.0, 5);
      vec3 rock = mix(uC0, uC1, n);
      col = mix(rock, uC3, edge * (0.6 + 0.4 * n));
      col += uC2 * edge * 0.5;
      h = 0.5 - edge * 0.35 + n * 0.15;
    } else {
      // Камень: кратеры разной глубины на шероховатой поверхности
      vec2 w = worley(sd * 5.5);
      float bowl = 1.0 - smoothstep(0.0, 0.42, w.x);
      float rim = smoothstep(0.42, 0.5, w.x) * (1.0 - smoothstep(0.5, 0.7, w.x));
      float n = warpFbm(sd * 3.6, 6);
      h = clamp(0.5 + (n - 0.5) * 0.5 - bowl * 0.3 + rim * 0.12, 0.0, 1.0);
      col = ramp(n * 0.7 + 0.15) * (0.85 + 0.3 * h);
    }
    gl_FragColor = vec4(col, clamp(h, 0.0, 1.0));
  }`;

// Облака: плотность в зелёном канале (так читает alphaMap)
const CLOUDS = `
  uniform float uSeed, uCover;
  void main() {
    vec3 d = sphDir(vUv) + vec3(uSeed);
    float n = warpFbm(d * 2.6, 6);
    float dens = smoothstep(uCover, uCover + 0.22, n);
    gl_FragColor = vec4(vec3(dens), 1.0); // alphaMap читает зелёный канал
  }`;

// Волны на воде: карта нормалей в касательном пространстве
const WATER_NORMALS = `
  void main() {
    vec2 p = vUv * 9.0;
    float e = 0.004;
    float h0 = fbm(vec3(p, 0.0), 5) + 0.25 * sin(p.x * 3.1 + p.y * 1.7) + 0.15 * sin(p.x * -2.3 + p.y * 3.7);
    float hx = fbm(vec3(p + vec2(e * 9.0, 0.0), 0.0), 5) + 0.25 * sin((p.x + e * 9.0) * 3.1 + p.y * 1.7) + 0.15 * sin((p.x + e * 9.0) * -2.3 + p.y * 3.7);
    float hy = fbm(vec3(p + vec2(0.0, e * 9.0), 0.0), 5) + 0.25 * sin(p.x * 3.1 + (p.y + e * 9.0) * 1.7) + 0.15 * sin(p.x * -2.3 + (p.y + e * 9.0) * 3.7);
    vec3 n = normalize(vec3((h0 - hx) * 18.0, (h0 - hy) * 18.0, 1.0));
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  }`;

// Асфальт: мелкое зерно и микротрещины; высота уходит в альфу
const ASPHALT = `
  void main() {
    vec2 p = vUv * 48.0;
    float grain = vnoise(vec3(p, 0.0)) * 0.6 + vnoise(vec3(p * 3.7, 1.0)) * 0.3 + vnoise(vec3(p * 11.0, 2.0)) * 0.1;
    vec2 w = worley(vec3(p * 0.5, 0.0));
    float crack = 1.0 - smoothstep(0.0, 0.05, w.y - w.x);
    float h = grain - crack * 0.35;
    gl_FragColor = vec4(vec3(0.5 + 0.5 * (grain - 0.5)), clamp(h * 0.5 + 0.5, 0.0, 1.0));
  }`;

// Неоновая сетка: линии с мягким свечением, остальное — почти чёрное; идёт в emissiveMap
const NEON_GRID = `
  uniform vec3 uLine;
  void main() {
    vec2 g = vUv * 16.0;
    vec2 f = abs(fract(g) - 0.5);
    float edge = 0.5 - max(f.x, f.y);
    float line = 1.0 - smoothstep(0.0, 0.035, edge); // линия там, где край клетки
    float glowL = exp(-edge * 40.0) * 0.4;
    gl_FragColor = vec4(uLine * (line + glowL), 1.0);
  }`;

// Панели корпуса: швы, заклёпки, мелкие царапины — карта нормалей для металла
const PANELS = `
  uniform float uScale;
  void main() {
    vec2 p = vUv * uScale;
    vec2 f = abs(fract(p) - 0.5);
    float seam = 1.0 - smoothstep(0.0, 0.02, 0.5 - max(f.x, f.y));
    vec2 cell = floor(p);
    float rivet = smoothstep(0.08, 0.05, length(fract(p) - 0.5 - vec2(0.36, 0.36)));
    float scratch = vnoise(vec3(p * 9.0, 4.0)) * 0.15;
    float h = 0.5 - seam * 0.25 + rivet * 0.12 + scratch * 0.05;
    gl_FragColor = vec4(vec3(h), clamp(h, 0.0, 1.0));
  }`;

// Карбон/хекс для корабля
const HEX = `
  void main() {
    vec2 p = vUv * 60.0;
    vec2 r = vec2(1.0, 1.732);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    float edge = smoothstep(0.42, 0.5, max(abs(g.x), abs(g.y * 0.6 + abs(g.x) * 0.35)));
    float hgt = 0.5 + (1.0 - edge) * 0.12;
    gl_FragColor = vec4(vec3(hgt), clamp(hgt, 0.0, 1.0));
  }`;

// Чешуйки лака: блики от частиц металлика
const FLAKE = `
  void main() {
    vec3 p = vec3(vUv * 320.0, 0.0);
    float f = h31(floor(p));
    float s = step(0.965, f) * (0.5 + 0.5 * h31(floor(p) + 7.0));
    float h = 0.5 + (vnoise(p * 0.2) - 0.5) * 0.04 + s * 0.2;
    gl_FragColor = vec4(vec3(h), clamp(h, 0.0, 1.0));
  }`;

// Туманность: сплетения шума, цвет от двух тонов, плотность в альфе
const NEBULA = `
  uniform vec3 uA, uB, uC;
  uniform float uSeed;
  void main() {
    vec3 p = vec3((vUv - 0.5) * 3.2, uSeed);
    float n = warpFbm(p, 6);
    float m = warpFbm(p * 1.7 + 4.0, 5);
    float dens = smoothstep(0.35, 0.85, n) * (1.0 - smoothstep(0.55, 0.5 + 0.5, length(vUv - 0.5) * 2.0));
    vec3 col = mix(uA, uB, smoothstep(0.4, 0.8, m));
    col = mix(col, uC, smoothstep(0.6, 0.9, n) * 0.6);
    gl_FragColor = vec4(col, dens);
  }`;

// ---------- Публичные функции ----------

// Поверхность планеты: альбедо + рельеф (в альфе) и карта нормалей из рельефа
export function planetMaps(renderer, look, seed, size = 1024) {
  const kindIndex = { bands: 0, terrain: 1, ocean: 2, ice: 3, lava: 4, rock: 5 }[look.kind] ?? 1;
  const kind = look.ocean ? 2 : kindIndex;
  const pal = look.palette.map(lin);
  const albedo = bake(renderer, {
    width: size, height: size / 2, mipmaps: true,
    uniforms: {
      uKind: { value: kind }, uSeed: { value: seed * 0.37 }, uBands: { value: 15 + (seed % 5) },
      uC0: { value: pal[0] }, uC1: { value: pal[1] }, uC2: { value: pal[2] }, uC3: { value: pal[3] }
    },
    fragment: SURFACE
  });
  const normal = normalFromHeight(renderer, albedo, { strength: kind === 0 ? 1.2 : 3.2, width: size, height: size / 2 });
  return { map: albedo, normalMap: normal };
}

// Облачный слой: плотность облаков в альфе/зелёном канале
export function cloudMap(renderer, seed, cover = 0.48, size = 512) {
  return bake(renderer, {
    width: size, height: size / 2, mipmaps: true,
    uniforms: { uSeed: { value: seed }, uCover: { value: cover } },
    fragment: CLOUDS
  });
}

// Облако-спрайт: мягкий силуэт с шумом; цвет белый, плотность в альфе. Для неба на закате.
const CLOUD_SPRITE = `
  uniform float uSeed;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p * vec2(1.0, 1.6));
    float n = warpFbm(vec3(p * 2.2, uSeed), 5);
    float shape = (1.0 - smoothstep(0.35, 1.0, r)) * smoothstep(0.25, 0.7, n + 0.25 - r * 0.25);
    gl_FragColor = vec4(vec3(0.95 + 0.05 * n), clamp(shape, 0.0, 1.0));
  }`;
export function cloudSpriteTexture(renderer, seed, size = 256) {
  return bake(renderer, { width: size, height: size, mipmaps: true, uniforms: { uSeed: { value: seed } }, fragment: CLOUD_SPRITE });
}

// Карта нормалей для воды (Water addon)
export function waterNormals(renderer, size = 512) {
  return bake(renderer, { width: size, height: size, type: THREE.UnsignedByteType, mipmaps: true, fragment: WATER_NORMALS });
}

// Асфальт: альбедо и нормали (шероховатость задаётся константой материала)
export function asphaltMaps(renderer, size = 512) {
  const h = bake(renderer, { width: size, height: size, mipmaps: true, fragment: ASPHALT });
  const normal = normalFromHeight(renderer, h, { strength: 2.5, width: size, height: size });
  return { map: null, normalMap: normal };
}

// Неоновая сетка для земли: излучающая карта (emissive) и тусклый базовый цвет
export function neonGridMap(renderer, lineHex = 0xff5fd2, size = 512) {
  return bake(renderer, {
    width: size, height: size, mipmaps: true,
    uniforms: { uLine: { value: lin(lineHex) } },
    fragment: NEON_GRID
  });
}

// Панели корпуса: нормали для металла, масштаб — сколько панелей на единицу UV
export function panelNormal(renderer, scale = 8, size = 512) {
  const h = bake(renderer, { width: size, height: size, mipmaps: true, uniforms: { uScale: { value: scale } }, fragment: PANELS });
  return normalFromHeight(renderer, h, { strength: 3.0, width: size, height: size });
}

export function hexNormal(renderer, size = 512) {
  const h = bake(renderer, { width: size, height: size, mipmaps: true, fragment: HEX });
  return normalFromHeight(renderer, h, { strength: 2.0, width: size, height: size });
}

// Флейк-лак для автомобиля: мелкие блики по всей поверхности
export function flakeNormal(renderer, size = 512) {
  const h = bake(renderer, { width: size, height: size, mipmaps: true, fragment: FLAKE });
  return normalFromHeight(renderer, h, { strength: 1.5, width: size, height: size });
}

// Туманность: цветное облако с прозрачностью — для спрайтов
export function nebulaTexture(renderer, colors, seed, size = 512) {
  return bake(renderer, {
    width: size, height: size, mipmaps: true,
    uniforms: {
      uA: { value: lin(colors[0]) }, uB: { value: lin(colors[1]) }, uC: { value: lin(colors[2] ?? colors[0]) },
      uSeed: { value: seed }
    },
    fragment: NEBULA
  });
}

// Кольца: радиальная текстура (CPU, она маленькая). Внутренний край соответствует радиусу 0.617.
export function ringTexture(palette, seed) {
  const S = 512, R = S / 2;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const pal = palette.map((hex) => {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  });
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x - R) / R, dy = (y - R) / R;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const f = (dist - 0.617) / 0.383;
      const i = (y * S + x) * 4;
      if (f < 0 || f > 1) { d[i + 3] = 0; continue; }
      const n = 0.5 + 0.5 * Math.sin(f * 90 + seed) * Math.sin(f * 23 + seed * 0.7);
      const a = (0.2 + 0.6 * n) * smooth(0.0, 0.06, f) * (1 - smooth(0.86, 1.0, f));
      const k = clamp(n, 0, 0.999) * (pal.length - 1);
      const c0 = pal[Math.floor(k)], c1 = pal[Math.min(Math.floor(k) + 1, pal.length - 1)];
      const t = k - Math.floor(k);
      d[i] = c0[0] + (c1[0] - c0[0]) * t;
      d[i + 1] = c0[1] + (c1[1] - c0[1]) * t;
      d[i + 2] = c0[2] + (c1[2] - c0[2]) * t;
      d[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Радиальный градиент: спрайты свечения
export function radialTexture(stops, size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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

// Звезда с дифракционными лучами: яркие звёзды выглядят как у камеры, а не как точки
let starTex = null;
export function starSpikeTexture() {
  if (starTex) return starTex;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.08, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // Два луча: горизонтальный и вертикальный, затухают к краям
  ctx.globalCompositeOperation = 'lighter';
  const horizontal = ctx.createLinearGradient(0, S / 2, S, S / 2);
  horizontal.addColorStop(0, 'rgba(255,255,255,0)');
  horizontal.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  horizontal.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, S / 2 - 1, S, 3);
  const vertical = ctx.createLinearGradient(S / 2, 0, S / 2, S);
  vertical.addColorStop(0, 'rgba(255,255,255,0)');
  vertical.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  vertical.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = vertical;
  ctx.fillRect(S / 2 - 1, 0, 3, S);
  starTex = new THREE.CanvasTexture(cv);
  starTex.colorSpace = THREE.SRGBColorSpace;
  return starTex;
}

// Атмосфера: тонкий ореол по краю, окрашенный в сторону солнца
const ATMO_VS = `
  varying vec3 vN;
  varying vec3 vWN;
  void main() {
    vN = normalize(normalMatrix * normal);
    vWN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const ATMO_FS = `
  uniform vec3 uColor, uSunColor, uSunDir;
  uniform float uStrength;
  varying vec3 vN;
  varying vec3 vWN;
  void main() {
    float rim = pow(clamp(0.72 - dot(vN, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 2.6);
    float lit = clamp(dot(vWN, uSunDir) * 0.5 + 0.6, 0.0, 1.0);
    vec3 col = mix(uColor, uSunColor, pow(lit, 3.0) * 0.6);
    gl_FragColor = vec4(col * lit, clamp(rim * uStrength, 0.0, 1.0));
  }`;
export function atmosphere(radius, color, strength = 1.0, sunDir = new THREE.Vector3(0, 1, 0), sunColor = '#ffd7a0') {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: lin(color) }, uStrength: { value: strength },
      uSunDir: { value: sunDir.clone().normalize() }, uSunColor: { value: lin(sunColor) }
    },
    vertexShader: ATMO_VS,
    fragmentShader: ATMO_FS,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), mat);
}

// Солнце: поверхность с кипением в шуме и короной
export function sunMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vP;
      void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vP;
      ${GLSL_NOISE}
      void main() {
        vec3 p = normalize(vP) * 2.4;
        float g = warpFbm(p * 1.6 + uTime * 0.05, 5);
        float spot = smoothstep(0.6, 0.8, fbm(p * 5.0 + uTime * 0.1, 3));
        vec3 c = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.85, 0.5), smoothstep(0.3, 0.8, g));
        c = mix(c, vec3(1.0, 0.55, 0.2), spot * 0.3);
        gl_FragColor = vec4(c * 3.0, 1.0);
      }`
  });
}

// Вихрь: аккреционный диск и портал. colorA — края, colorB — горячее ядро (линейные цвета)
export function vortexMaterial(inner, outer, colorA = [0.95, 0.38, 0.1], colorB = [1.0, 0.92, 0.7]) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uInner: { value: inner }, uOuter: { value: outer },
      uA: { value: new THREE.Vector3(...colorA) }, uB: { value: new THREE.Vector3(...colorB) }
    },
    vertexShader: `
      varying vec2 vP;
      void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      ${GLSL_NOISE}
      uniform float uTime, uInner, uOuter;
      uniform vec3 uA, uB;
      varying vec2 vP;
      void main() {
        float r = length(vP);
        float a = atan(vP.y, vP.x);
        float t = clamp((r - uInner) / (uOuter - uInner), 0.0, 1.0);
        float swirl = warpFbm(vec3(a * 0.9 + uTime * 0.5 - log(r) * 2.0, r * 0.05, uTime * 0.2), 4);
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

// Синтвейв-солнце: полоски в нижней половине
export function synthSunMaterial(top, bottom) {
  return new THREE.ShaderMaterial({
    uniforms: { uTop: { value: lin(top) }, uBottom: { value: lin(bottom) } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uTop, uBottom;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        if (p.y < -0.25 && mod(floor((p.y + 1.0) * 14.0), 2.0) < 1.0) discard;
        vec3 c = mix(uBottom, uTop, smoothstep(-1.0, 1.0, p.y));
        gl_FragColor = vec4(c * 2.2, 1.0 - smoothstep(0.92, 1.0, r));
      }`,
    transparent: true,
    depthWrite: false,
    fog: false
  });
}
