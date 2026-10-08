// Мир «небо»: закат над морем, плавающие острова-проекты, облака и портал контактов.
import * as THREE from '../three.js';
import { cloudTexture, glow, radialTexture, skyMaterial, vortexMaterial, waterMaterial, vnoise } from '../core/gfx.js';
import { makeTarget, PALETTES, starfield, lerp } from './common.js';

const SEA_Y = -200;
const ISLAND_ACCENTS = ['#ffb36b', '#ff7ad9', '#7fe7ff', '#c9a7ff', '#8ff5b0', '#ffd27a', '#ff9f7a'];
const slot = (i) => new THREE.Vector3(Math.sin(i * 1.4) * 240, 60 + (i % 3) * 45, -380 - i * 300);

// Остров: шар с шумом сверху, сплюснутый снизу; сверху трава, с боков камень
function islandMesh(R, seed) {
  // Сфера с индексом: нормали получаются сглаженными, без граней
  const geo = new THREE.SphereGeometry(1, 72, 48);
  const pos = geo.attributes.position;
  const colors = [];
  const top = new THREE.Color('#4fbf7a'), rock = new THREE.Color('#6b5a86'), under = new THREE.Color('#2a2440');
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const n = vnoise(v.x * 2.2 + seed, v.y * 2.2, v.z * 2.2, 7) * 0.35;
    let r = R * (0.85 + n);
    if (v.y < 0) r *= 0.55 + 0.45 * (1 + v.y); // сплющиваем низ
    pos.setXYZ(i, v.x * r, v.y * r * 0.6, v.z * r);
    const c = v.y > 0.35 ? top : v.y > -0.2 ? rock : under;
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: false }));
}

export function buildSky(scene, { content, pixelRatio, accent }) {
  const updaters = [];
  const targets = [];
  const n = content.projects.length;
  const HORIZON = '#ff9a6b';
  const SUN_DIR = new THREE.Vector3(-0.45, 0.22, -1);
  const CONTACT_POS = new THREE.Vector3(0, 110, -380 - n * 300 - 140);

  // Небо и солнце
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 32), skyMaterial('#1b0b3a', '#5a2a7a', HORIZON, SUN_DIR, '#ffd28a'));
  scene.add(dome);
  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xffd9a0, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sunDisc.position.copy(SUN_DIR).normalize().multiplyScalar(3200);
  sunDisc.scale.set(900, 900, 1);
  scene.add(sunDisc);

  // Море
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1), waterMaterial('#0b2a4a', '#ffd9a0'));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_Y;
  scene.add(sea);
  updaters.push((dt, t) => { sea.material.uniforms.uTime.value = t; });

  // Облака: мягкие спрайты вокруг маршрута
  const cloudTex = cloudTexture(9);
  for (let i = 0; i < 70; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, color: Math.random() < 0.7 ? 0xffffff : 0xffc2dc,
      transparent: true, opacity: 0.35 + Math.random() * 0.3, depthWrite: false, fog: true
    }));
    const s = 160 + Math.random() * 260;
    sp.scale.set(s, s * 0.55, 1);
    sp.position.set((Math.random() * 2 - 1) * 1100, -20 + Math.random() * 260, lerp(300, CONTACT_POS.z - 200, Math.random()));
    scene.add(sp);
  }

  // Звёзды над закатом: видны только высоко вверху
  updaters.push(starfield(scene, { count: 2500, pixelRatio, box: { x: 1400, y: 900, zMax: 300, zMin: CONTACT_POS.z - 600 } }));

  // Главный остров: «Обо мне»
  const hub = new THREE.Group();
  hub.position.set(0, 50, -160);
  scene.add(hub);
  hub.add(islandMesh(46, 3));
  const hubTower = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 26, 16), new THREE.MeshStandardMaterial({ color: 0xf3e6d6, emissive: 0xffb36b, emissiveIntensity: 0.25 }));
  hubTower.position.set(0, 46, 0);
  hub.add(hubTower);
  const hubRing = new THREE.Mesh(new THREE.TorusGeometry(58, 0.6, 10, 96), new THREE.MeshBasicMaterial({ color: 0xffb36b }));
  hubRing.rotation.x = Math.PI / 2;
  hub.add(hubRing);
  targets.push(makeTarget({
    id: 'about', kind: 'about', name: 'Обо мне', when: 'сейчас', obj: hub, radius: 46, dockDist: 120,
    accent: '#ffb36b', data: null, labelRange: 1800
  }));

  // Острова-проекты: у каждого своя палитра акцента
  content.projects.forEach((p, i) => {
    const R = 26 + ((i * 17) % 9);
    const pos = slot(i);
    const g = new THREE.Group();
    g.position.copy(pos);
    scene.add(g);
    g.add(islandMesh(R, 11 + i * 5));
    const acc = ISLAND_ACCENTS[i % ISLAND_ACCENTS.length];
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 14, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: acc, emissiveIntensity: 1.1 }));
    beacon.position.set(0, R * 0.9, 0);
    g.add(beacon);
    const neon = new THREE.Mesh(new THREE.TorusGeometry(R * 1.25, 0.28, 8, 80), new THREE.MeshBasicMaterial({ color: acc }));
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

  // Портал контактов: диск с вихрем внутри светящегося кольца
  const portal = new THREE.Group();
  portal.position.copy(CONTACT_POS);
  scene.add(portal);
  const vortexMat = vortexMaterial(20, 58, [0.55, 0.4, 1.0], [0.95, 0.85, 1.0]);
  const vortex = new THREE.Mesh(new THREE.RingGeometry(20, 58, 160, 1), vortexMat);
  portal.add(vortex);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(60, 1.2, 12, 120), new THREE.MeshBasicMaterial({ color: 0xb59bff }));
  portal.add(frame);
  const portalHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture([[0, 'rgba(181,155,255,0.9)'], [1, 'rgba(181,155,255,0)']]), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  portalHalo.scale.set(320, 320, 1);
  portal.add(portalHalo);
  updaters.push((dt, t) => { vortexMat.uniforms.uTime.value = t; });
  targets.push(makeTarget({
    id: 'contact', kind: 'contact', name: 'Контакты', when: 'связь', obj: portal, radius: 60, dockDist: 120,
    accent: '#b59bff', data: null, labelRange: 1800
  }));

  const palette = PALETTES.ocean;
  return {
    name: 'sky',
    targets,
    groundY: SEA_Y,
    spawn: { pos: new THREE.Vector3(0, 46, 60), yaw: 0, arriveFrom: new THREE.Vector3(0, 180, 1000) },
    lights: [new THREE.AmbientLight(0xffd0b0, 0.55), new THREE.HemisphereLight(0xffe2c0, 0x2a1a40, 0.7),
      new THREE.DirectionalLight(0xffd9a0, 1.2)],
    background: 0x3a1a4a,
    fog: { color: 0x3a1a4a, density: 0.00042 },
    update(dt, t) { for (let i = 0; i < updaters.length; i++) updaters[i](dt, t); },
    palette
  };
}
