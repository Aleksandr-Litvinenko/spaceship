// Ввод: клавиатура, курсор (рычаг от центра экрана) и касание. Клик по миру — через pick().
import { clamp } from './util.js';

const dz = (v) => {
  const a = Math.abs(v);
  return a < 0.1 ? 0 : Math.sign(v) * clamp((a - 0.1) / 0.9, 0, 1);
};

export function createInput(canvas, handlers = {}) {
  const keys = new Set();
  const pointer = { on: false, nx: 0, ny: 0, cx: 0, cy: 0 };
  const isKey = (...codes) => codes.some((c) => keys.has(c));
  const GAME_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

  addEventListener('keydown', (e) => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.code === 'Escape') handlers.escape?.();
    if (e.code === 'Enter' && !e.repeat) handlers.enter?.();
    if (e.code === 'KeyM') handlers.mute?.();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  addEventListener('pointermove', (e) => {
    pointer.on = e.target === canvas;
    pointer.cx = e.clientX;
    pointer.cy = e.clientY;
    pointer.nx = clamp((e.clientX - innerWidth / 2) / (innerWidth / 2), -1, 1);
    pointer.ny = clamp(-(e.clientY - innerHeight / 2) / (innerHeight / 2), -1, 1);
  });
  document.documentElement.addEventListener('pointerleave', () => { pointer.on = false; });

  // Клик без протяжки: короткое нажатие на холсте
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved <= 6) handlers.click?.(e.clientX, e.clientY);
  });

  function read() {
    const kx = (isKey('KeyD', 'ArrowRight') ? 1 : 0) - (isKey('KeyA', 'ArrowLeft') ? 1 : 0);
    const ky = (isKey('KeyW', 'ArrowUp') ? 1 : 0) - (isKey('KeyS', 'ArrowDown') ? 1 : 0);
    // Q/E — вверх и вниз (вертолёт); Shift — форсаж; Space — тормоз
    const kv = (isKey('KeyE') ? 1 : 0) - (isKey('KeyQ', 'ControlLeft', 'ControlRight') ? 1 : 0);
    let x = kx, y = ky;
    if (kx === 0 && pointer.on) x = dz(pointer.nx);
    if (ky === 0 && pointer.on) y = dz(pointer.ny);
    return {
      x, y,
      vertical: kv,
      boost: isKey('ShiftLeft', 'ShiftRight'),
      brake: isKey('Space')
    };
  }

  return { read, pointer, keys, isKey };
}
