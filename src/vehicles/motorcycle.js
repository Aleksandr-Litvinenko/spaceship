// Мотоцикл: два колеса, рама, бак, обтекатель и гонщик. Ложится в поворот, выхлоп — маленькие частицы.
import * as THREE from '../three.js';
import { hull, dark, glass, neon, lathe, flare, result } from './shared.js';

function wheel(accent) {
  const group = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.17, 12, 28), dark(0x0c0f1c));
  tyre.geometry.rotateY(Math.PI / 2); // ось колеса → по X
  group.add(tyre);
  const rim = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), neon(accent));
    spoke.rotation.x = i * Math.PI / 4;
    rim.add(spoke);
  }
  group.add(rim);
  return { group, rim };
}

function build(accent) {
  const group = new THREE.Group();
  const frame = dark(0x1d2338);
  const front = wheel(accent);
  const rear = wheel(accent);
  front.group.position.set(0, 0.56, -1.55);
  rear.group.position.set(0, 0.56, 1.55);
  group.add(front.group, rear.group);

  // Рама и мотор
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 3.2), frame);
  chassis.position.set(0, 0.7, 0.1);
  group.add(chassis);
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 1.0), dark(0x2a3050));
  engine.position.set(0, 0.5, 0.25);
  group.add(engine);

  // Бак с неоновой полосой
  const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 6, 14), hull(0xe8ecf6));
  tank.rotation.x = Math.PI / 2;
  tank.position.set(0, 1.2, -0.25);
  group.add(tank);
  const tankStripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.06, 0.9), neon(accent));
  tankStripe.position.set(0, 1.62, -0.25);
  group.add(tankStripe);

  // Сиденье
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 1.2), dark(0x111527));
  seat.position.set(0, 1.12, 0.95);
  group.add(seat);

  // Обтекатель: тело вращения, острым концом вперёд
  const fairing = new THREE.Mesh(lathe([[0, 1.25], [0.55, 1.0], [0.72, 0.2], [0.5, -0.5], [0, -0.8]], 28), hull(0xf4f6fb));
  fairing.position.set(0, 1.25, -1.45);
  fairing.scale.set(1, 1, 1.1);
  group.add(fairing);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 12), glass(0x06203a, accent));
  visor.scale.set(0.9, 0.45, 0.6);
  visor.position.set(0, 1.7, -1.6);
  group.add(visor);

  // Руль
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.07, 0.07), dark());
  bar.position.set(0, 1.7, -1.05);
  group.add(bar);

  // Гонщик: туловище и шлем в цвет акцента
  const rider = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 6, 12), dark(0x161b30));
  torso.rotation.x = -0.9;
  torso.position.set(0, 2.1, 0.2);
  rider.add(torso);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), neon(accent));
  helmet.position.set(0, 2.85, -0.3);
  rider.add(helmet);
  group.add(rider);

  // Фара и выхлоп
  const headlight = flare(0xfff1c9, 2.6);
  headlight.position.set(0, 1.25, -2.1);
  group.add(headlight);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.4, 12), dark(0xaab3c9));
  pipe.geometry.rotateX(Math.PI / 2);
  pipe.position.set(0.3, 0.35, 1.9);
  group.add(pipe);
  const exhaustGlow = flare(0xffa552, 1.2);
  exhaustGlow.position.set(0.3, 0.35, 2.7);
  group.add(exhaustGlow);

  return result(group, {
    nozzles: [new THREE.Vector3(0.3, 0.35, 2.6)],
    update(dt, t, S) {
      const spin = (S.speed * dt) / 0.56;
      front.rim.rotation.x -= spin;
      rear.rim.rotation.x -= spin;
      exhaustGlow.material.opacity = 0.5 + 0.3 * Math.sin(t * 25);
      headlight.material.opacity = 0.8;
    }
  });
}

export const vehicle = {
  label: 'Мотоцикл',
  env: 'road',
  control: 'drive',
  spec: {
    control: 'drive',
    cruise: 50, boostSpeed: 82, reverse: 8, accel: 2.2,
    turn: 2.4, lean: 0.5,
    kmh: 6.5, hum: 96, autoSpeed: 100, exhaust: true,
    camera: { back: [0, 2.6, 9], look: 6, orbit: 14, orbitH: 4 },
    dockView: { dist: 14, side: 5, height: 3, lookShift: 3 }
  },
  build
};
