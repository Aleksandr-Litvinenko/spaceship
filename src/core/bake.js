// Процедурные текстуры на GPU: шейдер рисует поверхность прямо в render target.
// На видеокарте это миллисекунды; на CPU те же текстуры заняли бы секунды.
// Все цвета — в линейном пространстве (THREE.Color уже переводит hex), сРГБ-кодирование делает вывод сцены.
import * as THREE from '../three.js';

// Библиотека шума: value/гradient-подобный шум с хешем Dave Hoskins (без sin, без артефактов на больших координатах),
// fbm с доменным варпом (Inigo Quilez), Worley-ячейки для трещин, кратеров и клеток льда.
export const GLSL_NOISE = `
  vec3 h33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
  }
  float h31(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float a = h31(i), b = h31(i + vec3(1, 0, 0)), c = h31(i + vec3(0, 1, 0)), d = h31(i + vec3(1, 1, 0));
    float e = h31(i + vec3(0, 0, 1)), g = h31(i + vec3(1, 0, 1)), k = h31(i + vec3(0, 1, 1)), m = h31(i + vec3(1, 1, 1));
    return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, g, u.x), mix(k, m, u.x), u.y), u.z);
  }
  float fbm(vec3 p, int oct) {
    float v = 0.0, a = 0.5, n = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= oct) break;
      v += a * vnoise(p); n += a;
      p = p * 2.03 + vec3(1.7, 9.2, 3.1);
      a *= 0.5;
    }
    return v / n;
  }
  float warpFbm(vec3 p, int oct) {
    vec3 q = vec3(fbm(p, oct), fbm(p + vec3(5.2, 1.3, 2.8), oct), fbm(p + vec3(9.1, 4.7, 1.9), oct));
    return fbm(p + 1.6 * q, oct);
  }
  vec2 worley(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(float(x), float(y), float(z));
      vec3 o = h33(i + g);
      vec3 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
    return vec2(sqrt(d1), sqrt(d2));
  }
  // Направление на сфере по UV равнопромежуточной карты: бесшовно по долготе
  vec3 sphDir(vec2 uv) {
    float lon = uv.x * 6.2831853;
    float lat = (uv.y - 0.5) * 3.1415926;
    float cl = cos(lat);
    return vec3(cl * cos(lon), sin(lat), cl * sin(lon));
  }
`;

const VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`;

const quad = new THREE.PlaneGeometry(2, 2);

// Какой тип данных брать для текстур: half float даёт гладкие градиенты без полосатости в тенях
export function floatType(renderer) {
  return renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType;
}

// Рисуем шейдер в текстуру. fragment — тело GLSL с функцией main(), использующей vUv.
export function bake(renderer, { width, height, fragment, uniforms = {}, type, mipmaps = false, wrap = true }) {
  const rt = new THREE.WebGLRenderTarget(width, height, {
    type: type ?? floatType(renderer),
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: mipmaps,
    minFilter: mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
    magFilter: THREE.LinearFilter
  });
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: `precision highp float;\nvarying vec2 vUv;\n${GLSL_NOISE}\n${fragment}`,
    uniforms,
    depthTest: false,
    depthWrite: false
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(quad, mat));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  const prevAuto = renderer.autoClear;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  renderer.autoClear = prevAuto;
  mat.dispose();
  const tex = rt.texture;
  tex.wrapS = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Карта нормалей из карты высот. Высота лежит в альфа-канале исходной текстуры (rgb — цвет, a — рельеф).
export function normalFromHeight(renderer, sourceTex, { strength = 2.0, width, height }) {
  return bake(renderer, {
    width, height,
    type: THREE.UnsignedByteType,
    uniforms: { uH: { value: sourceTex }, uStrength: { value: strength }, uTexel: { value: new THREE.Vector2(1 / width, 1 / height) } },
    fragment: `
      uniform sampler2D uH;
      uniform float uStrength;
      uniform vec2 uTexel;
      void main() {
        float l = texture2D(uH, vUv - vec2(uTexel.x, 0.0)).a;
        float r = texture2D(uH, vUv + vec2(uTexel.x, 0.0)).a;
        float d = texture2D(uH, vUv - vec2(0.0, uTexel.y)).a;
        float u = texture2D(uH, vUv + vec2(0.0, uTexel.y)).a;
        vec3 n = normalize(vec3((l - r) * uStrength, (d - u) * uStrength, 1.0));
        gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
      }`
  });
}
