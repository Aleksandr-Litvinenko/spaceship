// Общие заготовки для моделей транспорта: материалы, тела вращения, светящиеся точки.
import * as THREE from '../three.js';
import { glow } from '../core/gfx.js';

export const hull = (color = 0xe8ecf6) => new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 });
export const dark = (color = 0x1b2038) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.5 });
export const glass = (color = 0x0a2440, emissive = 0x2de1c2) => new THREE.MeshStandardMaterial({
  color, emissive, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.92
});
export const neon = (color) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.4 });

// Тело вращения из профиля [[радиус, высота], ...], ось Y → ось Z, нос уходит в -Z
export function lathe(points, segments = 36) {
  const pts = points.map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// Светящаяся точка-спрайт (огонь двигателя, фара, сигнал)
export function flare(color, scale = 2) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow(), color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  sp.scale.set(scale, scale, 1);
  return sp;
}

// Общая сборка: итог, который потом получает сцена
export function result(group, extra = {}) {
  return { group, nozzles: [], update: () => {}, ...extra };
}
