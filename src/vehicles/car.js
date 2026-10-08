// Спорткар: низкий кузов, кабина, неоновая подсветка снизу, фары и вращающиеся колёса. Едет по трассе.
import * as THREE from '../three.js';
import { hull, dark, glass, neon, flare, result } from './shared.js';
import { glow } from '../core/gfx.js';

// Кузов задаётся профилем в плоскости XY (x — длина, нос в +x), потом выдавливается по ширине
function extrudeSide(points, width, bevel = 0.08) {
  const sh = new THREE.Shape();
  sh.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => sh.lineTo(x, y));
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(Math.PI / 2); // длина → по -Z (нос вперёд), ширина → по X
  return geo;
}

function wheel(paint) {
  const group = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.42, 22), dark(0x0c0f1c));
  tyre.geometry.rotateZ(Math.PI / 2);
  group.add(tyre);
  const rim = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.1), paint);
    spoke.position.set(0.22, Math.sin(i * Math.PI * 2 / 5) * 0.18, Math.cos(i * Math.PI * 2 / 5) * 0.18);
    spoke.rotation.x = i * Math.PI * 2 / 5;
    rim.add(spoke);
  }
  rim.position.x = 0.22;
  group.add(rim);
  return { group, rim };
}

function build(accent) {
  const group = new THREE.Group();
  const paint = hull(0x1c2338);
  group.add(new THREE.Mesh(extrudeSide([[-2.3, 0.45], [2.3, 0.45], [2.35, 0.78], [2.2, 0.98], [1.7, 1.02], [-2.2, 1.02], [-2.3, 0.78]], 1.9), paint));

  const cabin = new THREE.Mesh(extrudeSide([[-1.25, 1.0], [-0.55, 1.62], [0.85, 1.62], [1.45, 1.0]], 1.5, 0.06), glass(0x06203a, accent));
  cabin.position.set(0, 0.0, 0);
  group.add(cabin);

  // Неоновые полосы по бортам и спойлер сзади
  [1, -1].forEach((s) => {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 4.2), neon(accent));
    strip.position.set(s * 0.97, 0.5, 0);
    group.add(strip);
  });
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.38), dark());
  spoiler.position.set(0, 1.25, 2.0);
  group.add(spoiler);

  // Колёса
  const wheels = [];
  [[0.98, -1.45], [-0.98, -1.45], [0.98, 1.45], [-0.98, 1.45]].forEach(([x, z]) => {
    const w = wheel(neon(accent));
    w.group.position.set(x, 0.5, z);
    group.add(w.group);
    wheels.push(w.rim);
  });

  // Фары и задние огни
  const heads = [flare(0xfff1c9, 2.0), flare(0xfff1c9, 2.0)];
  heads[0].position.set(0.7, 0.72, -2.38);
  heads[1].position.set(-0.7, 0.72, -2.38);
  const tails = [flare(0xff2b4d, 1.6), flare(0xff2b4d, 1.6)];
  tails[0].position.set(0.75, 0.8, 2.38);
  tails[1].position.set(-0.75, 0.8, 2.38);
  group.add(...heads, ...tails);

  // Подсветка снизу: мягкий неон под кузовом
  const under = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 2.6),
    new THREE.MeshBasicMaterial({ map: glow(), color: accent, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  under.rotation.x = -Math.PI / 2;
  under.position.y = 0.04;
  group.add(under);

  return result(group, {
    update(dt, t, S) {
      const spin = (S.speed * dt) / 0.5;
      wheels.forEach((r) => { r.rotation.x -= spin; });
      heads.forEach((h) => { h.material.opacity = 0.7 + 0.2 * Math.sin(t * 2); });
      under.material.opacity = 0.45 + 0.15 * Math.sin(t * 3);
    }
  });
}

export const vehicle = {
  label: 'Машина',
  env: 'road',
  control: 'drive',
  spec: {
    control: 'drive',
    cruise: 44, boostSpeed: 72, reverse: 12, accel: 1.6,
    turn: 1.9, lean: 0.04,
    kmh: 6, hum: 80, autoSpeed: 90, exhaust: false,
    camera: { back: [0, 3.6, 12], look: 8, orbit: 18, orbitH: 6 },
    dockView: { dist: 16, side: 6, height: 4, lookShift: 4 }
  },
  build
};
