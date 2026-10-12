// Общие материалы и заготовки для моделей транспорта: физический лак, металл, стекло, хром, неон.
// Отражения даёт scene.environment (небо мира), поэтому материалы сами по себе ничего не «рисуют».
import * as THREE from '../three.js';
import { glow, panelNormal, flakeNormal, hexNormal } from '../core/gfx.js';

// Карты, которые запекаются один раз при инициализации (см. initMaterials)
const maps = { panel: null, flake: null, hex: null };

export function initMaterials(renderer) {
  maps.panel = panelNormal(renderer, 7, 512);
  maps.flake = flakeNormal(renderer, 512);
  maps.hex = hexNormal(renderer, 512);
}

// Корпус: белый лак с панелями. Сплошной цвет, отражения неба, мягкий клирКот
export const hull = (color = 0xe8ecf6, { panels = true, repeat = 1 } = {}) => {
  const mat = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.36, metalness: 0.35,
    clearcoat: 0.9, clearcoatRoughness: 0.14
  });
  if (panels && maps.panel) {
    // Текстуры из render target нельзя клонировать: повтор задаём у общей карты (всегда 1 на корпус)
    maps.panel.repeat.set(repeat, repeat);
    mat.normalMap = maps.panel;
    mat.normalScale = new THREE.Vector2(0.35, 0.35);
  }
  return mat;
};

// Автомобильный лак: цвет, металлический флейк и прозрачный верхний слой
export const paint = (color = 0x1c2338) => {
  const mat = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.42, metalness: 0.55,
    clearcoat: 1, clearcoatRoughness: 0.06
  });
  if (maps.flake) {
    mat.normalMap = maps.flake;
    mat.normalScale = new THREE.Vector2(0.6, 0.6);
  }
  return mat;
};

// Тёмный карбон/пластик
export const dark = (color = 0x1b2038) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.5, metalness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.3
});

// Карбон с сотами для корпуса корабля
export const carbon = (color = 0x151a2c) => {
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  if (maps.hex) {
    maps.hex.repeat.set(4, 4);
    mat.normalMap = maps.hex;
    mat.normalScale = new THREE.Vector2(0.5, 0.5);
  }
  return mat;
};

// Стекло и затемнённые стёкла кабины: почти зеркальные, с лёгким свечением подсветки
export const glass = (color = 0x0a2440, emissive = 0x2de1c2, intensity = 0.35) => new THREE.MeshPhysicalMaterial({
  color, emissive: new THREE.Color(emissive), emissiveIntensity: intensity,
  roughness: 0.03, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.02,
  transparent: true, opacity: 0.82, ior: 1.5, specularIntensity: 1
});

// Неон: яркая эмиссия, которую подхватит блум
export const neon = (color, intensity = 1.7) => new THREE.MeshStandardMaterial({
  color, emissive: new THREE.Color(color), emissiveIntensity: intensity, roughness: 0.35, metalness: 0.0
});

// Хром: полированный металл, зеркальные блики
export const chrome = (color = 0xdfe6f2) => new THREE.MeshStandardMaterial({ color, roughness: 0.12, metalness: 1.0 });

// Резина шин: матовая, почти чёрная
export const rubber = () => new THREE.MeshStandardMaterial({ color: 0x0b0b10, roughness: 0.85, metalness: 0.0 });

// Тело вращения из профиля [[радиус, высота], ...], ось Y → ось Z, нос уходит в -Z.
// Сегменты больше — кривые стали гладкими, без граней.
export function lathe(points, segments = 96) {
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

// Общая сборка: итог, который получает сцена
export function result(group, extra = {}) {
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group, nozzles: [], update: () => {}, ...extra };
}
