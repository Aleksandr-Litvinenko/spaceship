// Мир «космос»: солнце — «Обо мне», планеты — проекты, пояс астероидов, туманности, чёрная дыра — контакты.
import * as THREE from '../three.js';
import { atmosphere, planetTexture, ringTexture, glow, radialTexture, sunMaterial, vortexMaterial } from '../core/gfx.js';
import { TAU } from '../core/util.js';
import { makeTarget, PALETTES, PLANET_ORDER, starfield, lerp } from './common.js';

const SUN_POS = new THREE.Vector3(-200, 70, -460);
// Слот проекта: маршрут уходит вглубь по оси -Z, планеты чуть покачиваются по сторонам
const slot = (i) => new THREE.Vector3(Math.sin(i * 1.73 + 0.4) * 200, Math.cos(i * 1.19) * 70 + (i % 2 ? 40 : -26), -560 - i * 340);

export function buildSpace(scene, { content, pixelRatio, accent }) {
  const updaters = [];
  const targets = [];
  const n = content.projects.length;
  const CONTACT_POS = new THREE.Vector3(0, -10, -560 - n * 340 - 150);

  updaters.push(starfield(scene, {
    count: 9000, pixelRatio,
    box: { x: 1000, y: 650, zMax: 320, zMin: CONTACT_POS.z - 700 }
  }));

  // Туманности
  const nebTex = radialTexture([[0, 'rgba(255,255,255,0.9)'], [0.35, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
  const nebColors = [0x6a2bd9, 0xff3d9a, 0x1fb5c9, 0x3a5bff, 0xff7a3d];
  for (let i = 0; i < 14; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nebTex, color: nebColors[i % nebColors.length], transparent: true,
      opacity: 0.12 + Math.random() * 0.12, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    const s = 520 + Math.random() * 760;
    sp.scale.set(s, s, 1);
    sp.position.set((Math.random() * 2 - 1) * 900, (Math.random() * 2 - 1) * 420, lerp(200, CONTACT_POS.z - 300, Math.random()));
    scene.add(sp);
  }

  // Солнце: «Обо мне»
  const sun = new THREE.Group();
  sun.position.copy(SUN_POS);
  scene.add(sun);
  const sunMat = sunMaterial();
  const sunBody = new THREE.Mesh(new THREE.SphereGeometry(34, 64, 48), sunMat);
  sun.add(sunBody);
  sun.add(atmosphere(46, 0xffa64d, 1.5));
  [[160, 0xffb06a, 0.55], [380, 0xff7a3d, 0.2]].forEach(([s, c, o]) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.scale.set(s, s, 1);
    sun.add(sp);
  });
  updaters.push((dt, t) => { sunMat.uniforms.uTime.value = t; sunBody.rotation.y += dt * 0.05; });
  const sunLight = new THREE.PointLight(0xfff0d8, 2.2, 0, 0);
  sunLight.position.copy(SUN_POS);
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
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(R, 72, 56),
      new THREE.MeshStandardMaterial({ map: planetTexture({ kind: spec.kind, palette: pal, ocean: spec.ocean }, 11 + i * 31), roughness: 0.92, metalness: 0 })
    );
    tilt.add(body);
    tilt.add(atmosphere(R * 1.1, pal[3], 1.15));
    if (spec.ring) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(R * 1.45, R * 2.35, 160),
        new THREE.MeshStandardMaterial({ map: ringTexture(pal, 40 + i * 9), transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 })
      );
      ring.rotation.x = -Math.PI / 2;
      tilt.add(ring);
    }
    const spin = 0.035 + ((i * 0.37) % 0.04);
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
  hole.add(new THREE.Mesh(new THREE.SphereGeometry(16, 48, 32), new THREE.MeshBasicMaterial({ color: 0x000000 })));
  const tiltG = new THREE.Group();
  tiltG.rotation.x = -1.2;
  hole.add(tiltG);
  const diskMat = vortexMaterial(22, 80);
  const disk = new THREE.Mesh(new THREE.RingGeometry(22, 80, 220, 1), diskMat);
  tiltG.add(disk);
  tiltG.add(new THREE.Mesh(
    new THREE.RingGeometry(16.4, 18.6, 128),
    new THREE.MeshBasicMaterial({ color: 0xffe6b8, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
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
  const belt = [SUN_POS, ...planets.map((p) => p.pts), CONTACT_POS];
  buildBelt(scene, belt);

  return {
    name: 'space',
    targets,
    groundY: -1e4,
    spawn: { pos: new THREE.Vector3(0, 6, 40), yaw: 0, arriveFrom: new THREE.Vector3(0, 160, 900) },
    lights: [new THREE.AmbientLight(0x35406e, 0.7), new THREE.HemisphereLight(0x8fb4ff, 0x140a20, 0.35), sunLight],
    background: 0x03040a,
    fog: { color: 0x03040a, density: 0.00055 },
    update(dt, t) { for (let i = 0; i < updaters.length; i++) updaters[i](dt, t); }
  };
}

function buildBelt(scene, points) {
  const count = 1100;
  const mesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0.05, flatShading: true }),
    count
  );
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();
  const base = new THREE.Vector3();
  let k = 0;
  for (let s = 0; s < points.length - 1; s++) {
    const a = points[s], b = points[s + 1];
    for (let j = 0; j < 130 && k < count; j++, k++) {
      base.copy(a).lerp(b, Math.random());
      const ang = Math.random() * TAU;
      const r = 60 + Math.random() * 150;
      dummy.position.set(base.x + Math.cos(ang) * r, base.y + Math.sin(ang) * r * 0.55, base.z + (Math.random() - 0.5) * 80);
      dummy.rotation.set(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU);
      const sc = 0.5 + Math.pow(Math.random(), 3) * 4.2;
      dummy.scale.set(sc, sc * (0.6 + Math.random() * 0.4), sc * (0.8 + Math.random() * 0.4));
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
      c.setHSL(0.07 + Math.random() * 0.04, 0.08 + Math.random() * 0.1, 0.22 + Math.random() * 0.22);
      mesh.setColorAt(k, c);
    }
  }
  mesh.count = k;
  scene.add(mesh);
}
