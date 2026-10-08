// Вертолёт: капсула кабины, хвостовая балка, несущий винт и рулевой винт. Умеет зависать и подниматься.
import * as THREE from '../three.js';
import { hull, dark, glass, neon, lathe, result } from './shared.js';

function build(accent) {
  const group = new THREE.Group();
  const body = hull(0xf1f3f8);
  group.add(new THREE.Mesh(lathe([[0, 3.2], [1.1, 2.6], [1.7, 1.0], [1.7, -0.6], [1.2, -2.0], [0, -2.3]], 40), body));

  const cabin = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 20), glass(0x06203a, accent));
  cabin.scale.set(1.1, 0.95, 1.1);
  cabin.position.set(0, 0.5, -1.5);
  group.add(cabin);

  // Хвостовая балка и киль
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 8, 14), body);
  boom.geometry.rotateX(Math.PI / 2);
  boom.position.set(0, 0.6, 5.8);
  group.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.0, 1.4), dark());
  fin.position.set(0, 1.8, 9.2);
  group.add(fin);

  // Неоновая полоса по борту
  [1.6, -1.6].forEach((x) => {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.4), neon(accent));
    stripe.position.set(x, 0.1, 0.5);
    group.add(stripe);
  });

  // Полозья
  [1.1, -1.1].forEach((x) => {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 5.2), dark());
    skid.position.set(x, -2.1, -0.4);
    group.add(skid);
    [-1.6, 1.4].forEach((z) => {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), dark());
      strut.position.set(x, -1.6, z);
      group.add(strut);
    });
  });

  // Несущий винт: два лопасти на общей оси
  const rotor = new THREE.Group();
  rotor.position.set(0, 2.5, 0);
  const bladeGeo = new THREE.BoxGeometry(12.5, 0.06, 0.6);
  rotor.add(new THREE.Mesh(bladeGeo, dark(0x2a3050)));
  const blade2 = new THREE.Mesh(bladeGeo, dark(0x2a3050));
  blade2.rotation.y = Math.PI / 2;
  rotor.add(blade2);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.8, 10), dark());
  mast.position.y = -0.4;
  rotor.add(mast);
  group.add(rotor);

  // Рулевой винт на конце балки
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.25, 1.8, 9.4);
  const tb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 0.3), dark(0x2a3050));
  tailRotor.add(tb);
  group.add(tailRotor);

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: accent }));
  beacon.position.set(0, 2.4, -0.2);
  group.add(beacon);

  return result(group, {
    update(dt, t, S) {
      rotor.rotation.y += dt * (14 + S.speed * 0.2);
      tailRotor.rotation.z += dt * 30;
      beacon.visible = Math.sin(t * 5) > 0.1;
    }
  });
}

export const vehicle = {
  label: 'Вертолёт',
  env: 'sky',
  control: 'fly',
  spec: {
    control: 'fly',
    cruise: 22, boost: 40, brake: 0, accel: 1.2,
    turn: 1.6, pitchRate: 1.2, roll: 0.9,
    vertical: 14,
    kmh: 20, hum: 60, autoSpeed: 60, exhaust: false,
    camera: { back: [0, 4, 20], look: 10, orbit: 30, orbitH: 8 },
    dockView: { dist: 50, side: 30, height: 10, lookShift: 40 }
  },
  build
};
