// Мир «трасса»: неоновая сетка, синтвейв-солнце у горизонта, дорога и арки-ворота у каждого проекта.
import * as THREE from '../three.js';
import { synthSunMaterial, skyMaterial, vortexMaterial, glow } from '../core/gfx.js';
import { makeTarget, PALETTES } from './common.js';
import { rnd, TAU } from '../core/util.js';

const ROAD_HALF = 7;
const GATE_R = 12;
const STEP = 210;
const GRID_CELL = 16;

// Неоновая сетка: одна клетка на канвасе, повторяется по всей земле
function neonGridTexture(lineColor, bg) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#' + lineColor.toString(16).padStart(6, '0');
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6000 / GRID_CELL, 6000 / GRID_CELL);
  tex.anisotropy = 8;
  return tex;
}

// Лента дороги между двумя боковыми смещениями x0 и x1 от оси пути
function ribbon(curve, x0, x1, y, mat, samples = 420) {
  const positions = [];
  const index = [];
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3();
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(Math.min(u, 0.9999));
    side.crossVectors(tan, up).normalize();
    positions.push(p.x + side.x * x0, y, p.z + side.z * x0, p.x + side.x * x1, y, p.z + side.z * x1);
  }
  for (let i = 0; i < samples; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

// Табличка с названием: текст рисуем на канвасе, после загрузки шрифтов перерисовываем
function signTexture(title, sub, color) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 320;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = 'rgba(8,6,20,0.82)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, cv.width - 24, cv.height - 24);
    ctx.fillStyle = color;
    ctx.font = '600 34px Manrope, system-ui, sans-serif';
    ctx.fillText(sub.toUpperCase().slice(0, 40), 56, 96);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 76px Unbounded, Manrope, system-ui, sans-serif';
    ctx.fillText(title.slice(0, 26), 56, 210);
    tex.needsUpdate = true;
  };
  draw();
  if (document.fonts?.load) {
    Promise.all([document.fonts.load('800 76px Unbounded'), document.fonts.load('600 34px Manrope')]).then(draw, () => {});
  }
  return tex;
}

// Ворота: полуарка поперёк дороги и табличка сверху
function gate({ title, sub, color, mat }) {
  const g = new THREE.Group();
  const arch = new THREE.Mesh(new THREE.TorusGeometry(GATE_R, 0.6, 12, 56, Math.PI), mat);
  g.add(arch);
  [GATE_R, -GATE_R].forEach((x) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2, 10), mat);
    post.position.set(x, 1, 0);
    g.add(post);
  });
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(GATE_R * 1.6, GATE_R * 0.5),
    new THREE.MeshBasicMaterial({ map: signTexture(title, sub, color), side: THREE.DoubleSide, transparent: true })
  );
  sign.position.set(0, GATE_R + 3.5, 0.8);
  g.add(sign);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color }));
  beacon.position.set(0, GATE_R + 0.5, 0);
  g.add(beacon);
  return { group: g, arch, sign };
}

export function buildRoad(scene, { content, pixelRatio, accent }) {
  const updaters = [];
  const targets = [];
  const n = content.projects.length;

  // Станции: 0 — «Обо мне», 1..n — проекты, n+1 — контакты. Ось трассы — вдоль -Z.
  const stations = [];
  for (let k = 0; k <= n + 1; k++) {
    const z = -60 - k * STEP;
    const x = k === 0 || k === n + 1 ? 0 : 16 * Math.sin(k * 1.1 + 0.6);
    stations.push(new THREE.Vector3(x, 0, z));
  }

  // Небо, солнце, сетка
  const SUN_DIR = new THREE.Vector3(0, 0.12, -1);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), skyMaterial('#06011a', '#1a0a3a', '#ff3d9a', SUN_DIR, '#ffb36b')));
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), synthSunMaterial('#ffd166', '#ff3d9a'));
  sun.position.set(0, 160, -2800);
  scene.add(sun);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xff5fa2, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  sunGlow.position.set(0, 160, -2790);
  sunGlow.scale.set(1400, 1400, 1);
  scene.add(sunGlow);

  // Земля: текстура с неоновой сеткой, едет к зрителю; туман сам растворяет её у горизонта
  const gridTex = neonGridTexture(0xff5fd2, '#0a0320');
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshBasicMaterial({ map: gridTex }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  updaters.push((dt, t) => { gridTex.offset.y = (t * 0.6 / GRID_CELL) % 1; });

  // Горы по кругу — силуэты на горизонте, далеко от трассы
  const mountainMat = new THREE.MeshStandardMaterial({ color: 0x1a0b33, roughness: 1, flatShading: true });
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * TAU + rnd(-0.04, 0.04);
    const r = rnd(2800, 3600);
    const h = rnd(220, 420);
    const m = new THREE.Mesh(new THREE.ConeGeometry(rnd(180, 300), h, 4), mountainMat);
    m.position.set(Math.cos(a) * r, h / 2 - 4, -1500 + Math.sin(a) * r);
    m.rotation.y = rnd(0, TAU);
    scene.add(m);
  }

  // Дорога: лента + неоновые кромки + осевая линия
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 60), ...stations], false, 'centripetal');
  // Лента приподнята и получает смещение глубины, иначе на дальности она тонет в земле (z-fighting)
  const lift = (m) => Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const asphalt = lift(new THREE.MeshStandardMaterial({ color: 0x08040f, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide }));
  scene.add(ribbon(curve, -ROAD_HALF, ROAD_HALF, 0.12, asphalt));
  const edgeMat = lift(new THREE.MeshBasicMaterial({ color: accent, side: THREE.DoubleSide }));
  scene.add(ribbon(curve, ROAD_HALF - 0.5, ROAD_HALF, 0.16, edgeMat));
  scene.add(ribbon(curve, -ROAD_HALF, -ROAD_HALF + 0.5, 0.16, edgeMat));
  scene.add(ribbon(curve, -0.14, 0.14, 0.18, lift(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }))));

  // Станции: ворота с табличкой, направлены поперёк дороги
  // Ворота стоят поперёк пути, лицевой стороной к подъезжающему (то есть против направления трассы)
  const alignTo = (g, k) => {
    const prev = stations[Math.max(k - 1, 0)], next = stations[Math.min(k + 1, stations.length - 1)];
    const d = next.clone().sub(prev);
    g.rotation.y = Math.atan2(-d.x, -d.z);
  };

  const aboutMat = new THREE.MeshStandardMaterial({ color: 0xffb36b, emissive: 0xffb36b, emissiveIntensity: 1.2 });
  const about = gate({ title: content.person.name || 'Обо мне', sub: 'Обо мне', color: '#ffb36b', mat: aboutMat });
  about.group.position.copy(stations[0]);
  alignTo(about.group, 0);
  scene.add(about.group);
  targets.push(makeTarget({
    id: 'about', kind: 'about', name: 'Обо мне', when: 'сейчас', obj: about.group, radius: GATE_R, dockDist: 26,
    accent: '#ffb36b', data: null, labelRange: 600
  }));

  content.projects.forEach((p, i) => {
    const pal = PALETTES[['magenta', 'teal', 'ice', 'gold', 'violet', 'ocean', 'lava'][i % 7]];
    const col = pal[2];
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.0 });
    const gt = gate({ title: p.name, sub: p.when || 'проект', color: col, mat });
    gt.group.position.copy(stations[i + 1]);
    alignTo(gt.group, i + 1);
    scene.add(gt.group);
    targets.push(makeTarget({
      id: p.id, kind: 'project', name: p.name, when: p.when, obj: gt.group, radius: GATE_R, dockDist: 26,
      accent: col, data: p, labelRange: 600
    }));
  });

  // Ворота контактов: портал с вихрем
  const cIdx = n + 1;
  const portalMat = new THREE.MeshStandardMaterial({ color: 0xb59bff, emissive: 0xb59bff, emissiveIntensity: 1.1 });
  const contact = gate({ title: 'Контакты', sub: 'связь', color: '#b59bff', mat: portalMat });
  const vortexMat = vortexMaterial(0, GATE_R - 1, [0.55, 0.4, 1.0], [0.95, 0.85, 1.0]);
  const vortex = new THREE.Mesh(new THREE.CircleGeometry(GATE_R - 1, 64), vortexMat);
  contact.group.add(vortex);
  contact.group.position.copy(stations[cIdx]);
  alignTo(contact.group, cIdx);
  scene.add(contact.group);
  updaters.push((dt, t) => { vortexMat.uniforms.uTime.value = t; });
  targets.push(makeTarget({
    id: 'contact', kind: 'contact', name: 'Контакты', when: 'связь', obj: contact.group, radius: GATE_R, dockDist: 26,
    accent: '#b59bff', data: null, labelRange: 600
  }));

  return {
    name: 'road',
    targets,
    groundY: 0,
    spawn: { pos: new THREE.Vector3(0, 0, 60), yaw: 0, arriveFrom: new THREE.Vector3(0, 60, 520) },
    lights: [
      new THREE.AmbientLight(0x6a4aa0, 0.6),
      new THREE.DirectionalLight(0xffc2e0, 1.0),
      new THREE.PointLight(0xff5fa2, 1.6, 0, 0)
    ],
    background: 0x0a0320,
    fog: { color: 0x1a0630, density: 0.0011 },
    update(dt, t) { for (let i = 0; i < updaters.length; i++) updaters[i](dt, t); }
  };
}
