// Мир «небо»: физическое небо с закатом, океан с настоящими волнами и отражением неба,
// плавающие острова с деревьями и объёмными облаками, портал контактов.
import * as THREE from '../three.js';
import { Sky } from '../vendor/jsm/objects/Sky.js';
import { Water } from '../vendor/jsm/objects/Water.js';
import { waterNormals, vortexMaterial, radialTexture, cloudSpriteTexture } from '../core/gfx.js';
import { buildEnvironment } from '../core/render.js';
import { makeTarget } from './common.js';
import { lerp } from './common.js';

const SEA_Y = -200;
const ISLAND_ACCENTS = ['#ffb36b', '#ff7ad9', '#7fe7ff', '#c9a7ff', '#8ff5b0', '#ffd27a', '#ff9f7a'];
const slot = (i) => new THREE.Vector3(Math.sin(i * 1.4) * 240, 70 + (i % 3) * 45, -380 - i * 300);

// Дешёвый процедурный шум на CPU для формы островов и облаков (синусы + хеш по направлению)
const hash = (x) => { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const h = (a, b, c) => hash(a * 157.3 + b * 113.7 + c * 74.1);
  const x0 = lerp(h(xi, yi, zi), h(xi + 1, yi, zi), u), x1 = lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u);
  const x2 = lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), x3 = lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u);
  return lerp(lerp(x0, x1, v), lerp(x2, x3, v), w);
}
const fbm3 = (x, y, z) => 0.55 * noise3(x, y, z) + 0.3 * noise3(x * 2.1, y * 2.1, z * 2.1) + 0.15 * noise3(x * 4.3, y * 4.3, z * 4.3);

// Остров: шар с рельефом, плоской вершиной, сужающимся низом и цветом по наклону (трава, камень, песок)
function islandGeometry(R, seed) {
  const geo = new THREE.SphereGeometry(1, 128, 96);
  const pos = geo.attributes.position;
  const colors = [];
  const grass = new THREE.Color('#4f9e5a'), grassDark = new THREE.Color('#2f6b3d');
  const rock = new THREE.Color('#6d5d74'), sand = new THREE.Color('#c9b48a'), under = new THREE.Color('#2a2238');
  const v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const n = fbm3(v.x * 2.4 + seed, v.y * 2.4, v.z * 2.4 + seed);
    let r = R * (0.82 + 0.3 * n);
    if (v.y < 0) r *= Math.max(0.12, 0.6 + 0.6 * v.y); // низ сужается в «корень»
    const top = Math.max(0, v.y);
    pos.setXYZ(i, v.x * r, v.y * r * 0.62 + (v.y > 0.7 ? (v.y - 0.7) * R * 0.2 : 0), v.z * r);
    const band = fbm3(v.x * 6 + seed, v.y * 6, v.z * 6);
    if (v.y > 0.45) c.copy(grass).lerp(grassDark, band);
    else if (v.y > -0.05) c.copy(rock).lerp(sand, Math.max(0, 0.3 - Math.abs(v.y)) * 2.5 * band);
    else c.copy(under).lerp(rock, 0.2 + top * 0.2);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

export function buildSky(scene, { content, renderer, quality, pixelRatio, accent }) {
  const q = quality;
  const updaters = [];
  const targets = [];
  const n = content.projects.length;
  const CONTACT_POS = new THREE.Vector3(0, 120, -380 - n * 300 - 140);

  // Солнце низко над морем: закат с оранжевым ореолом
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(84), THREE.MathUtils.degToRad(-125));
  const sky = new Sky();
  sky.scale.setScalar(6000);
  sky.material.uniforms.turbidity.value = 2;
  sky.material.uniforms.rayleigh.value = 1.1;
  sky.material.uniforms.mieCoefficient.value = 0.006;
  sky.material.uniforms.mieDirectionalG.value = 0.82;
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  scene.add(sky);

  // Окружение: само небо сворачивается в карту отражений (океан, металл, острова отражают закат)
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(6000);
  envSky.material.uniforms.turbidity.value = 2;
  envSky.material.uniforms.rayleigh.value = 1.1;
  envSky.material.uniforms.mieCoefficient.value = 0.006;
  envSky.material.uniforms.mieDirectionalG.value = 0.82;
  envSky.material.uniforms.sunPosition.value.copy(sunDir);
  envScene.add(envSky);
  const envTex = buildEnvironment(renderer, envScene, 0.02);

  // Океан
  const seaNormals = waterNormals(renderer, q === 'low' ? 256 : 512);
  const sea = new Water(new THREE.PlaneGeometry(12000, 12000), {
    textureWidth: q === 'low' ? 256 : 512,
    textureHeight: q === 'low' ? 256 : 512,
    waterNormals: seaNormals,
    sunDirection: sunDir.clone(),
    sunColor: 0xffd7a0,
    waterColor: 0x031c31,
    alpha: 0.9,
    distortionScale: 0.6,
    fog: true
  });
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_Y;
  scene.add(sea);
  updaters.push((dt) => { sea.material.uniforms.time.value += dt * 0.6; });

  // Облака: мягкие спрайты с процедурной текстурой, подсвеченные закатом
  const cloudTex = [cloudSpriteTexture(renderer, 1.3), cloudSpriteTexture(renderer, 4.7), cloudSpriteTexture(renderer, 8.1)];
  const cloudMats = cloudTex.map((tex) => new THREE.SpriteMaterial({
    map: tex, color: 0xffe2cc, transparent: true, opacity: 0.8, depthWrite: false, fog: true
  }));
  for (let i = 0; i < (q === 'low' ? 26 : 44); i++) {
    const sp = new THREE.Sprite(cloudMats[i % cloudMats.length]);
    const s = 260 + noise3(i * 0.7, 2.2, 0.4) * 420;
    sp.scale.set(s, s * 0.45, 1);
    sp.position.set((noise3(i * 1.7, 0.5, 2.2) * 2 - 1) * 1300, 60 + noise3(i, 9.1, 4.4) * 240, lerp(260, CONTACT_POS.z - 300, noise3(i * 0.9, 7.1, 1.7)));
    scene.add(sp);
  }

  // Главный остров: «Обо мне» с башней и кольцом
  const hub = new THREE.Group();
  hub.position.set(0, 50, -160);
  scene.add(hub);
  const hubIsland = new THREE.Mesh(islandGeometry(46, 3), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMap: envTex, envMapIntensity: 0.3 }));
  hub.add(hubIsland);
  const hubTower = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 4.5, 30, 24), new THREE.MeshStandardMaterial({ color: 0xf3e6d6, roughness: 0.35, metalness: 0.2, emissive: 0xffb36b, emissiveIntensity: 0.12 }));
  hubTower.position.set(0, 52, 0);
  hub.add(hubTower);
  const hubRing = new THREE.Mesh(new THREE.TorusGeometry(58, 0.55, 12, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb36b').multiplyScalar(2.5) }));
  hubRing.rotation.x = Math.PI / 2;
  hub.add(hubRing);
  targets.push(makeTarget({
    id: 'about', kind: 'about', name: 'Обо мне', when: 'сейчас', obj: hub, radius: 46, dockDist: 120,
    accent: '#ffb36b', data: null, labelRange: 1800
  }));

  // Острова-проекты с деревьями
  const treeGeo = new THREE.ConeGeometry(1.2, 4.2, 6);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x2c5a32, roughness: 0.8, flatShading: true });
  content.projects.forEach((p, i) => {
    const R = 26 + ((i * 17) % 9);
    const g = new THREE.Group();
    g.position.copy(slot(i));
    scene.add(g);
    const geo = islandGeometry(R, 11 + i * 5);
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, envMap: envTex, envMapIntensity: 0.3 })));

    // Деревья: на вершинах, где поверхность смотрит вверх
    const pos = geo.attributes.position, nrm = geo.attributes.normal;
    const tops = [];
    for (let k = 0; k < pos.count; k++) if (nrm.getY(k) > 0.8 && pos.getY(k) > R * 0.2) tops.push(k);
    const trees = new THREE.InstancedMesh(treeGeo, treeMat, Math.min(36, tops.length));
    const dummy = new THREE.Object3D();
    for (let k = 0; k < trees.count; k++) {
      const vi = tops[Math.floor(Math.random() * tops.length)];
      dummy.position.set(pos.getX(vi), pos.getY(vi) + 1.8, pos.getZ(vi));
      const s = 0.7 + Math.random() * 0.9;
      dummy.scale.set(s, s * (0.8 + Math.random() * 0.6), s);
      dummy.rotation.y = Math.random() * 6;
      dummy.updateMatrix();
      trees.setMatrixAt(k, dummy.matrix);
    }
    g.add(trees);

    const acc = ISLAND_ACCENTS[i % ISLAND_ACCENTS.length];
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: acc, emissiveIntensity: 2.0 }));
    beacon.position.set(0, R * 0.95, 0);
    g.add(beacon);
    const neon = new THREE.Mesh(new THREE.TorusGeometry(R * 1.25, 0.26, 10, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(acc).multiplyScalar(2.2) }));
    neon.rotation.x = Math.PI / 2;
    const spinRing = new THREE.Group();
    spinRing.position.y = -R * 0.1;
    spinRing.add(neon);
    g.add(spinRing);
    updaters.push((dt, t) => { spinRing.rotation.y = t * 0.2 * (i % 2 ? 1 : -1); });
    targets.push(makeTarget({
      id: p.id, kind: 'project', name: p.name, when: p.when, obj: g, radius: R, dockDist: R * 2.2 + 16,
      accent: acc, data: p, labelRange: 1800
    }));
  });

  // Портал контактов: диск с вихрем и светящаяся рама
  const portal = new THREE.Group();
  portal.position.copy(CONTACT_POS);
  scene.add(portal);
  const vortexMat = vortexMaterial(20, 58, [0.55, 0.4, 1.0], [0.95, 0.85, 1.0]);
  portal.add(new THREE.Mesh(new THREE.RingGeometry(20, 58, 192, 1), vortexMat));
  portal.add(new THREE.Mesh(new THREE.TorusGeometry(60, 1.2, 14, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color('#b59bff').multiplyScalar(2) })));
  const portalHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture([[0, 'rgba(181,155,255,0.9)'], [1, 'rgba(181,155,255,0)']]), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  portalHalo.scale.set(320, 320, 1);
  portal.add(portalHalo);
  updaters.push((dt, t) => { vortexMat.uniforms.uTime.value = t; });
  targets.push(makeTarget({
    id: 'contact', kind: 'contact', name: 'Контакты', when: 'связь', obj: portal, radius: 60, dockDist: 120,
    accent: '#b59bff', data: null, labelRange: 1800
  }));

  // Свет: низкое солнце, тёплая заливка от неба и воды
  const sunLight = new THREE.DirectionalLight(0xffd3a0, 3.4);
  sunLight.position.copy(sunDir).multiplyScalar(1000);
  sunLight.target.position.set(0, 0, -300);
  scene.add(sunLight, sunLight.target);
  const fill = new THREE.HemisphereLight(0xffd2b8, 0x203a55, 0.55);

  return {
    name: 'sky',
    targets,
    groundY: SEA_Y,
    spawn: { pos: new THREE.Vector3(0, 46, 60), yaw: 0, arriveFrom: new THREE.Vector3(0, 180, 1000) },
    lights: [sunLight, fill],
    environment: envTex,
    background: null,
    fog: { color: 0xe2a57e, density: 0.00032 },
    shadows: null,
    grade: { vignette: 0.45, warm: 0.3, bloom: 0.14, threshold: 2.4 },
    update(dt, t) { for (let i = 0; i < updaters.length; i++) updaters[i](dt, t); }
  };
}
