// Космический истребитель: длинный обтекаемый корпус, дельта-крылья, неоновое кольцо и два сопла.
import * as THREE from '../three.js';
import { hull, dark, glass, neon, lathe, flare, result } from './shared.js';

function build(accent) {
  const group = new THREE.Group();
  const body = hull(0xdfe6f2);
  group.add(new THREE.Mesh(lathe([[0, 9], [0.5, 7.4], [1.1, 4.6], [1.5, 0.5], [1.4, -3.5], [1.1, -6.5], [0.7, -7.8], [0, -8.2]], 40), body));

  // Дельта-крылья: треугольник в XY, плашмя, с отрицательной стреловидностью назад
  const delta = new THREE.Shape();
  delta.moveTo(1.2, 2.8);
  delta.lineTo(7.4, -5.6);
  delta.lineTo(7.0, -6.4);
  delta.lineTo(1.2, -3.4);
  delta.closePath();
  const deltaGeo = new THREE.ExtrudeGeometry(delta, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  deltaGeo.rotateX(-Math.PI / 2);
  const wingR = new THREE.Mesh(deltaGeo, dark(0x23293f));
  wingR.position.y = -0.2;
  const wingL = wingR.clone();
  wingL.scale.x = -1;
  group.add(wingR, wingL);

  // Кромки крыльев — неон
  [1, -1].forEach((s) => {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 9.2), neon(accent));
    edge.position.set(s * 4.2, 0.1, -0.9);
    edge.rotation.y = s * 0.56;
    group.add(edge);
  });

  // Неоновое кольцо на середине корпуса
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.07, 10, 48), neon(accent));
  ring.rotation.x = Math.PI / 2;
  ring.position.z = 1.2;
  group.add(ring);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), glass(0x06203a, accent));
  canopy.scale.set(0.7, 0.55, 2.2);
  canopy.position.set(0, 1.0, -4.0);
  group.add(canopy);

  // Сопла: конусы с горячим свечением
  const nozzles = [new THREE.Vector3(1.1, -0.1, 7.2), new THREE.Vector3(-1.1, -0.1, 7.2)];
  nozzles.forEach((n) => {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.4, 1.6, 20), dark(0x151a2c));
    cone.geometry.rotateX(Math.PI / 2);
    cone.position.copy(n).add(new THREE.Vector3(0, 0, 0.6));
    group.add(cone);
  });

  const glows = nozzles.map((n) => {
    const sp = flare(accent, 4.4);
    sp.position.copy(n).add(new THREE.Vector3(0, 0, 1.6));
    group.add(sp);
    return sp;
  });

  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshBasicMaterial({ color: accent }));
  beacon.position.set(0, 1.6, 2.5);
  group.add(beacon);

  return result(group, {
    nozzles,
    update(dt, t, S) {
      const power = Math.min(1, S.speed / 90);
      glows.forEach((g, i) => {
        g.material.opacity = (0.6 + 0.3 * Math.sin(t * 40 + i)) * (0.35 + 0.65 * power);
        g.scale.setScalar(3.4 + 2.6 * power + Math.sin(t * 33 + i) * 0.3);
      });
      beacon.visible = Math.sin(t * 6) > 0;
      ring.rotation.z = t * 0.6;
    }
  });
}

export const vehicle = {
  label: 'Корабль',
  env: 'space',
  control: 'fly',
  spec: {
    control: 'fly',
    cruise: 70, boost: 150, brake: 14, accel: 1.1,
    turn: 1.2, pitchRate: 0.8, roll: 0.9,
    kmh: 110, hum: 36, autoSpeed: 200, exhaust: true,
    camera: { back: [0, 5, 30], look: 20, orbit: 60, orbitH: 18 },
    dockView: { dist: 70, side: 45, height: 16, lookShift: 60 }
  },
  build
};
