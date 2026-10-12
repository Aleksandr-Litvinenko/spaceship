// Мир «трасса»: закатное небо, мокрый асфальт с неоновыми отражениями, синтвейв-солнце у горизонта,
// тени от машины и ворота-табло у каждого проекта.
import * as THREE from '../three.js';
import { Sky } from '../vendor/jsm/objects/Sky.js';
import { synthSunMaterial, vortexMaterial, glow, asphaltMaps } from '../core/gfx.js';
import { buildEnvironment } from '../core/render.js';
import { makeTarget } from './common.js';
import { rnd, TAU } from '../core/util.js';

const ROAD_HALF = 7;
const GATE_R = 12;
const STEP = 210;
const GRID_CELL = 16;

// Лента дороги между боковыми смещениями x0 и x1 от оси пути, с UV для текстуры асфальта
function ribbon(curve, x0, x1, y, mat, samples = 420) {
  const positions = [];
  const uvs = [];
  const index = [];
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3();
  const len = curve.getLength();
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(Math.min(u, 0.9999));
    side.crossVectors(tan, up).normalize();
    positions.push(p.x + side.x * x0, y, p.z + side.z * x0, p.x + side.x * x1, y, p.z + side.z * x1);
    const v = (u * len) / 40;
    uvs.push(0, v, 1, v);
  }
  for (let i = 0; i < samples; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

// Табличка с названием: текст на канвасе, подгоняется по ширине; перерисовываем после загрузки шрифтов
function signTexture(title, sub, color) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 320;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    const grad = ctx.createLinearGradient(0, 0, 0, cv.height);
    grad.addColorStop(0, 'rgba(14,8,28,0.92)');
    grad.addColorStop(1, 'rgba(6,3,14,0.96)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, cv.width - 28, cv.height - 28);
    ctx.fillStyle = color;
    ctx.font = '600 32px Manrope, system-ui, sans-serif';
    ctx.fillText(sub.toUpperCase().slice(0, 40), 56, 92);
    let size = 76;
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${size}px Unbounded, Manrope, system-ui, sans-serif`;
    while (ctx.measureText(title).width > 900 && size > 34) {
      size -= 3;
      ctx.font = `800 ${size}px Unbounded, Manrope, system-ui, sans-serif`;
    }
    ctx.fillText(title, 56, 210);
    tex.needsUpdate = true;
  };
  draw();
  if (document.fonts?.load) {
    Promise.all([document.fonts.load('800 76px Unbounded'), document.fonts.load('600 32px Manrope')]).then(draw, () => {});
  }
  return tex;
}

// Ворота: полуарка поперёк дороги, стойки и табло сверху
function gate({ title, sub, color, mat, frame }) {
  const g = new THREE.Group();
  const arch = new THREE.Mesh(new THREE.TorusGeometry(GATE_R, 0.7, 20, 96, Math.PI), frame);
  g.add(arch);
  [GATE_R, -GATE_R].forEach((x) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 2, 16), frame);
    post.position.set(x, 1, 0);
    g.add(post);
  });
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(GATE_R * 1.6, GATE_R * 0.5),
    new THREE.MeshBasicMaterial({ map: signTexture(title, sub, color), side: THREE.DoubleSide, transparent: true })
  );
  sign.position.set(0, GATE_R + 3.5, 0.8);
  g.add(sign);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(GATE_R * 2.1, 0.5, 0.5), mat);
  bar.position.set(0, GATE_R + 0.2, 0.5);
  g.add(bar);
  return { group: g, arch, sign };
}

export function buildRoad(scene, { content, renderer, quality, pixelRatio, accent }) {
  const q = quality;
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

  // Закатное небо: солнце у горизонта по оси трассы
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(87), Math.PI);
  const sky = new Sky();
  sky.scale.setScalar(6000);
  sky.material.uniforms.turbidity.value = 4;
  sky.material.uniforms.rayleigh.value = 2.6;
  sky.material.uniforms.mieCoefficient.value = 0.008;
  sky.material.uniforms.mieDirectionalG.value = 0.8;
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  scene.add(sky);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(6000);
  envSky.material.uniforms.turbidity.value = 4;
  envSky.material.uniforms.rayleigh.value = 2.6;
  envSky.material.uniforms.mieCoefficient.value = 0.008;
  envSky.material.uniforms.mieDirectionalG.value = 0.8;
  envSky.material.uniforms.sunPosition.value.copy(sunDir);
  envScene.add(envSky);
  const envTex = buildEnvironment(renderer, envScene, 0.02);

  // Синтвейв-солнце — стилизованный диск, как на обложке
  const synth = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), synthSunMaterial('#ffd166', '#ff3d9a'));
  synth.position.set(0, 160, -2800);
  scene.add(synth);
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xff5fa2, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
  sunGlow.position.set(0, 160, -2790);
  sunGlow.scale.set(900, 900, 1);
  scene.add(sunGlow);

  // Земля: тёмное мокрое зеркало; неоновая сетка — светящиеся линии, которые растворяются в тумане
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x05020a, roughness: 0.42, metalness: 0.05, envMap: envTex, envMapIntensity: 0.22
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const gridPts = [];
  const span = 3000, cell = GRID_CELL;
  for (let x = -span; x <= span; x += cell) gridPts.push(x, 0.05, -span, x, 0.05, span);
  for (let z = -span; z <= span; z += cell) gridPts.push(-span, 0.05, z, span, 0.05, z);
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3));
  const gridLines = new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({
    color: new THREE.Color(0xff5fd2).multiplyScalar(1.5), transparent: true, opacity: 0.8, fog: true
  }));
  scene.add(gridLines);

  // Горы: тёмные силуэты по кругу, далеко от трассы
  const mountainMat = new THREE.MeshStandardMaterial({ color: 0x1a0b33, roughness: 0.9, metalness: 0, flatShading: true, envMap: envTex, envMapIntensity: 0.25 });
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * TAU + rnd(-0.04, 0.04);
    const r = rnd(2800, 3600);
    const h = rnd(220, 420);
    const m = new THREE.Mesh(new THREE.ConeGeometry(rnd(180, 300), h, 5), mountainMat);
    m.position.set(Math.cos(a) * r, h / 2 - 4, -1500 + Math.sin(a) * r);
    m.rotation.y = rnd(0, TAU);
    scene.add(m);
  }

  // Дорога: асфальт с нормалями, неоновые кромки и осевая линия
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 60), ...stations], false, 'centripetal');
  const asphaltNormal = asphaltMaps(renderer, q === 'low' ? 256 : 512).normalMap;
  asphaltNormal.wrapS = asphaltNormal.wrapT = THREE.RepeatWrapping;
  const lift = (m) => Object.assign(m, { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const asphalt = lift(new THREE.MeshStandardMaterial({
    color: 0x0a0612, roughness: 0.5, metalness: 0.05, normalMap: asphaltNormal,
    normalScale: new THREE.Vector2(0.35, 0.35), side: THREE.DoubleSide, envMap: envTex, envMapIntensity: 0.3
  }));
  const road = ribbon(curve, -ROAD_HALF, ROAD_HALF, 0.12, asphalt);
  road.receiveShadow = true;
  scene.add(road);
  const edgeMat = lift(new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(3), side: THREE.DoubleSide }));
  scene.add(ribbon(curve, ROAD_HALF - 0.5, ROAD_HALF, 0.16, edgeMat));
  scene.add(ribbon(curve, -ROAD_HALF, -ROAD_HALF + 0.5, 0.16, edgeMat));
  scene.add(ribbon(curve, -0.14, 0.14, 0.18, lift(new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(2.2), side: THREE.DoubleSide }))));

  // Ворота: поперёк пути, лицевой стороной к подъезжающему
  const alignTo = (g, k) => {
    const prev = stations[Math.max(k - 1, 0)], next = stations[Math.min(k + 1, stations.length - 1)];
    const d = next.clone().sub(prev);
    g.rotation.y = Math.atan2(-d.x, -d.z);
  };
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1b1530, roughness: 0.3, metalness: 0.85, envMap: envTex, envMapIntensity: 1.1 });

  const aboutMat = new THREE.MeshStandardMaterial({ color: 0xffb36b, emissive: 0xffb36b, emissiveIntensity: 1.6, roughness: 0.4 });
  const about = gate({ title: content.person.name || 'Обо мне', sub: 'Обо мне', color: '#ffb36b', mat: aboutMat, frame: frameMat });
  about.group.position.copy(stations[0]);
  alignTo(about.group, 0);
  scene.add(about.group);
  targets.push(makeTarget({
    id: 'about', kind: 'about', name: 'Обо мне', when: 'сейчас', obj: about.group, radius: GATE_R, dockDist: 26,
    accent: '#ffb36b', data: null, labelRange: 600
  }));

  const gatePal = ['#ff5fd2', '#2de1c2', '#ffcf6b', '#7b5cff', '#ff9f7a', '#8ff5b0', '#7fe7ff'];
  content.projects.forEach((p, i) => {
    const col = gatePal[i % gatePal.length];
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.3, roughness: 0.4 });
    const gt = gate({ title: p.name, sub: p.when || 'проект', color: col, mat, frame: frameMat });
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
  const portalMat = new THREE.MeshStandardMaterial({ color: 0xb59bff, emissive: 0xb59bff, emissiveIntensity: 1.5, roughness: 0.4 });
  const contact = gate({ title: 'Контакты', sub: 'связь', color: '#b59bff', mat: portalMat, frame: frameMat });
  const vortexMat = vortexMaterial(0, GATE_R - 1, [0.55, 0.4, 1.0], [0.95, 0.85, 1.0]);
  contact.group.add(new THREE.Mesh(new THREE.CircleGeometry(GATE_R - 1, 72), vortexMat));
  contact.group.position.copy(stations[cIdx]);
  alignTo(contact.group, cIdx);
  scene.add(contact.group);
  updaters.push((dt, t) => { vortexMat.uniforms.uTime.value = t; });
  targets.push(makeTarget({
    id: 'contact', kind: 'contact', name: 'Контакты', when: 'связь', obj: contact.group, radius: GATE_R, dockDist: 26,
    accent: '#b59bff', data: null, labelRange: 600
  }));

  // Свет: низкое солнце с тенями и тёплая заливка неба
  const sunLight = new THREE.DirectionalLight(0xffc89a, 2.6);
  sunLight.position.copy(sunDir).multiplyScalar(300);
  sunLight.target.position.set(0, 0, 0);
  sunLight.castShadow = q !== 'low';
  if (sunLight.castShadow) {
    const extent = 36;
    const cam = sunLight.shadow.camera;
    cam.left = -extent; cam.right = extent; cam.top = extent; cam.bottom = -extent; cam.near = 10; cam.far = 900;
    sunLight.shadow.mapSize.set(q === 'ultra' ? 4096 : 2048, q === 'ultra' ? 4096 : 2048);
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.03;
    sunLight.shadow.radius = 4;
  }
  scene.add(sunLight, sunLight.target);
  const fill = new THREE.HemisphereLight(0xc7a2ff, 0x140820, 0.35);

  return {
    name: 'road',
    targets,
    groundY: 0,
    spawn: { pos: new THREE.Vector3(0, 0, 60), yaw: 0, arriveFrom: new THREE.Vector3(0, 60, 520) },
    lights: [sunLight, fill],
    environment: envTex,
    background: null,
    fog: { color: 0x2a0d3a, density: 0.0009 },
    shadows: sunLight.castShadow ? { light: sunLight, extent: 36, follow: true } : null,
    grade: { vignette: 0.5, warm: 0.3, bloom: 0.32, threshold: 1.5 },
    update(dt, t, focus) {
      for (let i = 0; i < updaters.length; i++) updaters[i](dt, t);
      if (sunLight.castShadow && focus) {
        sunLight.target.position.set(focus.x, 0, focus.z);
        sunLight.position.copy(sunDir).multiplyScalar(300).add(new THREE.Vector3(focus.x, 0, focus.z));
      }
    }
  };
}
