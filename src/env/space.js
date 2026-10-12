// Мир «космос»: солнце — «Обо мне», планеты-проекты с облаками и атмосферой, туманности, пояс астероидов,
// чёрная дыра — контакты. Свет от солнца физический, отражения — из карты окружения космоса.
import * as THREE from '../three.js';
import { atmosphere, planetMaps, cloudMap, ringTexture, glow, radialTexture, sunMaterial, vortexMaterial, nebulaTexture, starSpikeTexture } from '../core/gfx.js';
import { buildEnvironment } from '../core/render.js';
import { TAU } from '../core/util.js';
import { makeTarget, PALETTES, PLANET_ORDER, starfield, lerp } from './common.js';

const SUN_POS = new THREE.Vector3(-200, 70, -460);
// Слот проекта: маршрут уходит вглубь по оси -Z, планеты чуть покачиваются по сторонам
const slot = (i) => new THREE.Vector3(Math.sin(i * 1.73 + 0.4) * 200, Math.cos(i * 1.19) * 70 + (i % 2 ? 40 : -26), -560 - i * 340);

export function buildSpace(scene, { content, renderer, quality, pixelRatio, accent }) {
  const q = quality;
  const updaters = [];
  const targets = [];
  const n = content.projects.length;
  const CONTACT_POS = new THREE.Vector3(0, -10, -560 - n * 340 - 150);
  const sunDir = SUN_POS.clone().sub(new THREE.Vector3(0, 0, -1200)).normalize();

  // Окружение космоса: тёмный фон, звёзды и солнце — для отражений на металле и лаке
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x02030a);
  const envSun = new THREE.Mesh(new THREE.SphereGeometry(40, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.6).multiplyScalar(40) }));
  envSun.position.copy(sunDir).multiplyScalar(900);
  envScene.add(envSun);
  const envTex = buildEnvironment(renderer, envScene, 0.04);

  // Звёзды: мерцающие точки и яркие звёзды с лучами
  updaters.push(starfield(scene, {
    count: Math.round(9000 * (q === 'low' ? 0.5 : 1)), pixelRatio,
    box: { x: 1000, y: 650, zMax: 320, zMin: CONTACT_POS.z - 700 }
  }));
  const spikeTex = starSpikeTexture();
  for (let i = 0; i < 46; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: spikeTex, color: new THREE.Color().setHSL(0.55 + Math.random() * 0.1, 0.5, 0.85),
      transparent: true, opacity: 0.4 + Math.random() * 0.5, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    const s = 18 + Math.pow(Math.random(), 3) * 90;
    sp.scale.set(s, s, 1);
    sp.position.set((Math.random() * 2 - 1) * 900, (Math.random() * 2 - 1) * 480, lerp(260, CONTACT_POS.z - 300, Math.random()));
    scene.add(sp);
  }

  // Туманности: настоящие облака шума вместо радиальных пятен
  const nebColors = [['#7b3cff', '#ff4fa3'], ['#1fb5c9', '#3a5bff'], ['#ff7a3d', '#ff3d9a'], ['#3a5bff', '#9b6bff']];
  for (let i = 0; i < 7; i++) {
    const tex = nebulaTexture(renderer, nebColors[i % nebColors.length], 3.1 + i * 1.7, 384);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.36, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    const s = 900 + Math.random() * 900;
    sp.scale.set(s, s, 1);
    sp.position.set((Math.random() * 2 - 1) * 1100, (Math.random() * 2 - 1) * 500, lerp(200, CONTACT_POS.z - 400, Math.random()));
    scene.add(sp);
  }

  // Солнце: «Обо мне»
  const sun = new THREE.Group();
  sun.position.copy(SUN_POS);
  scene.add(sun);
  const sunMat = sunMaterial();
  const sunBody = new THREE.Mesh(new THREE.SphereGeometry(34, 96, 72), sunMat);
  sun.add(sunBody);
  sun.add(atmosphere(46, '#ffa64d', 1.6, sunDir, '#ffe2b0'));
  [[190, 0xffb06a, 0.5], [420, 0xff7a3d, 0.18]].forEach(([s, c, o]) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.scale.set(s, s, 1);
    sun.add(sp);
  });
  updaters.push((dt, t) => { sunMat.uniforms.uTime.value = t; sunBody.rotation.y += dt * 0.05; });
  targets.push(makeTarget({
    id: 'about', kind: 'about', name: 'Обо мне', when: 'сейчас', obj: sun, radius: 34, dockDist: 130,
    accent: '#ffb36b', data: null, labelRange: 2100
  }));

  // Планеты-проекты
  const planets = [];
  content.projects.forEach((p, i) => {
    const spec = PLANET_ORDER[i % PLANET_ORDER.length];
    const pal = PALETTES[spec.pal];
    const R = 22 + ((i * 37) % 13);
    const g = new THREE.Group();
    g.position.copy(slot(i));
    scene.add(g);
    const tilt = new THREE.Group();
    tilt.rotation.z = 0.18 + (i % 3) * 0.12;
    tilt.rotation.x = 0.1 * (i % 2 ? 1 : -1);
    g.add(tilt);

    const spin = 0.035 + ((i * 0.37) % 0.04);
    const maps = planetMaps(renderer, { kind: spec.kind, palette: pal, ocean: spec.ocean }, 11 + i * 31, q === 'low' ? 512 : q === 'ultra' ? 2048 : 1024);
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(R, 128, 96),
      new THREE.MeshStandardMaterial({
        map: maps.map, normalMap: maps.normalMap, normalScale: new THREE.Vector2(0.9, 0.9),
        roughness: spec.ocean ? 0.55 : 0.82, metalness: 0, envMap: envTex, envMapIntensity: 0.5
      })
    );
    tilt.add(body);

    // Облака над океаническими и газовыми мирами: отдельная оболочка с собственной тенью
    if (spec.ocean || spec.kind === 'bands') {
      const clouds = new THREE.Mesh(
        new THREE.SphereGeometry(R * 1.012, 96, 72),
        new THREE.MeshStandardMaterial({
          color: 0xffffff, alphaMap: cloudMap(renderer, 5 + i, spec.ocean ? 0.5 : 0.42, 512),
          transparent: true, opacity: 0.92, depthWrite: false, roughness: 1, metalness: 0,
          envMap: envTex, envMapIntensity: 0.25
        })
      );
      tilt.add(clouds);
      updaters.push((dt) => { clouds.rotation.y += dt * spin * 1.6; });
    }

    tilt.add(atmosphere(R * 1.09, pal[3], 1.2, sunDir, '#ffe6c0'));

    if (spec.ring) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(R * 1.45, R * 2.35, 192),
        new THREE.MeshStandardMaterial({
          map: ringTexture(pal, 40 + i * 9), transparent: true, side: THREE.DoubleSide, depthWrite: false,
          roughness: 1, envMap: envTex, envMapIntensity: 0.3
        })
      );
      ring.rotation.x = -Math.PI / 2;
      tilt.add(ring);
    }

    updaters.push((dt) => { body.rotation.y += dt * spin; });
    planets.push({ g, R, pts: slot(i) });
    targets.push(makeTarget({
      id: p.id, kind: 'project', name: p.name, when: p.when, obj: g, radius: R, dockDist: R * 2.7 + 18,
      accent: pal[3], data: p, labelRange: 2100
    }));
  });

  // Чёрная дыра: контакты
  const hole = new THREE.Group();
  hole.position.copy(CONTACT_POS);
  scene.add(hole);
  hole.add(new THREE.Mesh(new THREE.SphereGeometry(16, 64, 48), new THREE.MeshBasicMaterial({ color: 0x000000 })));
  const tiltG = new THREE.Group();
  tiltG.rotation.x = -1.2;
  hole.add(tiltG);
  const diskMat = vortexMaterial(22, 80, [1.0, 0.45, 0.12], [1.0, 0.92, 0.7]);
  const disk = new THREE.Mesh(new THREE.RingGeometry(22, 80, 256, 1), diskMat);
  tiltG.add(disk);
  tiltG.add(new THREE.Mesh(
    new THREE.RingGeometry(16.4, 18.6, 160),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.9, 0.7).multiplyScalar(3), transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  ));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0x8a5cff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(340, 340, 1);
  hole.add(halo);
  updaters.push((dt, t) => { diskMat.uniforms.uTime.value = t; disk.rotation.z += dt * 0.08; });
  targets.push(makeTarget({
    id: 'contact', kind: 'contact', name: 'Контакты', when: 'связь', obj: hole, radius: 18, dockDist: 110,
    accent: '#b59bff', data: null, labelRange: 2100
  }));

  // Пояс астероидов вдоль маршрута
  buildBelt(scene, [SUN_POS, ...planets.map((p) => p.pts), CONTACT_POS], q);

  // Свет: солнце направленным светом, без теней (космос без тени от кораблей — так дешевле и чище)
  const sunLight = new THREE.DirectionalLight(0xfff0dc, 3.2);
  sunLight.position.copy(sunDir).multiplyScalar(1000);
  sunLight.target.position.set(0, 0, -1200);
  scene.add(sunLight, sunLight.target);
  const fill = new THREE.HemisphereLight(0x6f86ff, 0x0a0614, 0.25);

  return {
    name: 'space',
    targets,
    groundY: -1e4,
    spawn: { pos: new THREE.Vector3(0, 6, 40), yaw: 0, arriveFrom: new THREE.Vector3(0, 160, 900) },
    lights: [sunLight, fill],
    environment: envTex,
    background: new THREE.Color(0x02030a),
    fog: { color: 0x02030a, density: 0.00042 },
    shadows: null,
    grade: { vignette: 0.5, warm: 0.12, bloom: 0.5, threshold: 1.2 },
    update(dt, t) { for (let i = 0; i < updaters.length; i++) updaters[i](dt, t); }
  };
}

function buildBelt(scene, points, q) {
  const count = q === 'low' ? 500 : 1100;
  const mesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.08, flatShading: true }),
    count
  );
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();
  const base = new THREE.Vector3();
  let k = 0;
  for (let s = 0; s < points.length - 1; s++) {
    const a = points[s], b = points[s + 1];
    for (let j = 0; j < Math.floor(count / (points.length - 1)) && k < count; j++, k++) {
      base.copy(a).lerp(b, Math.random());
      const ang = Math.random() * TAU;
      const r = 60 + Math.random() * 150;
      dummy.position.set(base.x + Math.cos(ang) * r, base.y + Math.sin(ang) * r * 0.55, base.z + (Math.random() - 0.5) * 80);
      dummy.rotation.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
      const sc = 0.5 + Math.pow(Math.random(), 3) * 4.2;
      dummy.scale.set(sc, sc * (0.6 + Math.random() * 0.4), sc * (0.8 + Math.random() * 0.4));
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
      c.setHSL(0.07 + Math.random() * 0.04, 0.08 + Math.random() * 0.1, 0.18 + Math.random() * 0.2);
      mesh.setColorAt(k, c);
    }
  }
  mesh.count = k;
  scene.add(mesh);
}
