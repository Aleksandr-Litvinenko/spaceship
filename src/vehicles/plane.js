// Самолёт: классический силуэт с двумя крыльями, килем и двумя гондолами. Летает в небе.
import * as THREE from '../three.js';
import { hull, dark, glass, neon, lathe, flare, result } from './shared.js';

function build(accent) {
  const group = new THREE.Group();
  const body = hull();
  group.add(new THREE.Mesh(lathe([[0, 6.5], [0.55, 6.0], [0.95, 4.6], [1.15, 2.5], [1.2, 0], [1.12, -3], [0.85, -5.6], [0.45, -6.6], [0, -6.8]]), body));

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 9.5), neon(accent));
  stripe.position.set(0, 1.2, -0.6);
  group.add(stripe);

  // Крыло: контур в XY, потом кладём плашмя (передняя кромка — больший y)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0.9, 1.4);
  wingShape.lineTo(7.2, -1.2);
  wingShape.lineTo(7.4, -1.9);
  wingShape.lineTo(4.6, -2.6);
  wingShape.lineTo(0.9, -3.4);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 2 });
  wingGeo.rotateX(-Math.PI / 2);
  const wingR = new THREE.Mesh(wingGeo, body);
  wingR.position.y = -0.3;
  const wingL = wingR.clone();
  wingL.scale.x = -1;
  group.add(wingR, wingL);

  // Киль: контур в XY с осью x = -z, поворот кладёт его вертикально в хвосте
  const finShape = new THREE.Shape();
  finShape.moveTo(-3.0, 1.0);
  finShape.lineTo(-6.4, 4.2);
  finShape.lineTo(-6.9, 4.2);
  finShape.lineTo(-6.9, 1.0);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  finGeo.rotateY(Math.PI / 2);
  finGeo.translate(-0.1, 0, 0);
  group.add(new THREE.Mesh(finGeo, dark()));
  const finAccent = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 1.2), neon(accent));
  finAccent.position.set(0, 4.2, 5.2);
  group.add(finAccent);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.12, 1.6), dark());
  tail.position.set(0, 0.35, 5.6);
  group.add(tail);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), glass());
  canopy.scale.set(0.8, 0.65, 1.9);
  canopy.position.set(0, 1.05, -2.5);
  group.add(canopy);

  const nozzles = [new THREE.Vector3(2.9, -0.45, 1.5), new THREE.Vector3(-2.9, -0.45, 1.5)];
  [2.9, -2.9].forEach((x) => {
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 3.2, 20), dark());
    nac.geometry.rotateX(Math.PI / 2);
    nac.position.set(x, -0.45, -0.3);
    group.add(nac);
  });

  const lightGeo = new THREE.SphereGeometry(0.22, 12, 8);
  const navL = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0xff3b5c }));
  const navR = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: 0x3bffa5 }));
  navL.position.set(-7.3, 0.1, 1.4);
  navR.position.set(7.3, 0.1, 1.4);
  group.add(navL, navR);

  const glows = nozzles.map((n) => {
    const sp = flare(0x6fe9ff, 3.6);
    sp.position.copy(n);
    group.add(sp);
    return sp;
  });

  return result(group, {
    nozzles,
    update(dt, t, S) {
      const power = Math.min(1, S.speed / 60);
      glows.forEach((g, i) => {
        g.material.opacity = (0.55 + 0.35 * Math.sin(t * 38 + i * 2)) * (0.3 + 0.7 * power);
        g.scale.setScalar(2.6 + 2.2 * power + Math.sin(t * 30 + i) * 0.25);
      });
      const blink = Math.sin(t * 5.2) > 0.2;
      navL.visible = navR.visible = blink;
      stripe.material.emissiveIntensity = 1.1 + Math.sin(t * 2) * 0.35;
    }
  });
}

export const vehicle = {
  label: 'Самолёт',
  env: 'sky',
  control: 'fly',
  spec: {
    control: 'fly',
    cruise: 52, boost: 105, brake: 12, accel: 1.4,
    turn: 1.3, pitchRate: 0.9, roll: 0.7,
    kmh: 40, hum: 44, autoSpeed: 130, exhaust: true,
    camera: { back: [0, 6.2, 24], look: 16, orbit: 46, orbitH: 16 },
    dockView: { dist: 70, side: 40, height: 18, lookShift: 60 }
  },
  build
};
