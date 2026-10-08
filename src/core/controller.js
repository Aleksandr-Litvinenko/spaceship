// Управление транспортом. Два вида движения:
//   fly   — самолёт, корабль, вертолёт: курс, тангаж, крен; вертолёт умеет подниматься (Q/E)
//   drive — машина, мотоцикл: руление по земле, ход вперёд и назад, наклон на поворотах (мотоцикл)
// Общее для всех: прилёт в начало, автопилот по сплайну к цели, стыковка и камера, которая идёт за транспортом.
// Режимы: idle → arrive (прилёт) → idle (висим) → free (ручной) ⇄ auto (лечу к цели) → dock (стою у цели).
import * as THREE from '../three.js';
import { clamp, easeInOutCubic } from './util.js';

const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Vector3();
const posOf = (t) => t.obj.getWorldPosition(new THREE.Vector3());

export function createController(spec, { groundY = 0 } = {}) {
  const drive = spec.control === 'drive';
  const S = {
    mode: 'idle',
    started: false,
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    yaw: 0, pitch: 0, roll: 0,
    speed: 0,
    target: null,
    dir: new THREE.Vector3(0, 0, 1),   // сторона подлёта к цели
    auto: null,
    bob: 0
  };
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _v = new THREE.Vector3();
  const _w = new THREE.Vector3();
  const rig = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 62, init: false };

  const forward = (out = _v) => out.set(0, 0, -1).applyQuaternion(S.quat);

  // Ориентация «носом по направлению» (локальная -Z смотрит на target)
  function aimQuat(eye, target, out) {
    const up = Math.abs((target.clone().sub(eye)).normalize().y) > 0.98 ? new THREE.Vector3(0, 0, 1) : UP;
    _m.lookAt(eye, target, up);
    return out.setFromRotationMatrix(_m);
  }

  function setPose(pos, yaw) {
    S.pos.copy(pos);
    S.yaw = yaw; S.pitch = 0; S.roll = 0;
    _e.set(0, yaw, 0, 'YXZ');
    S.quat.setFromEuler(_e);
  }

  // Прилёт: плавный полёт/заезд из далёкой точки на исходную позицию, затем висим и ждём взлёта
  function arrive(from, to, dur = 6) {
    const mid = from.clone().lerp(to, 0.5);
    mid.y = Math.max(mid.y, to.y + (drive ? 0 : 40));
    const curve = new THREE.CatmullRomCurve3([from, mid, to], false, 'centripetal');
    S.pos.copy(from);
    S.auto = { curve, t: 0, len: curve.getLength(), dur, arriving: true };
    S.mode = 'arrive';
    S.target = null;
  }

  function start() {
    if (S.started) return;
    S.started = true;
    S.mode = 'free';
    S.speed = 0;
  }

  function release() {
    if (S.mode !== 'auto' && S.mode !== 'dock') return;
    _e.setFromQuaternion(S.quat, 'YXZ');
    S.pitch = drive ? 0 : _e.x;
    S.yaw = _e.y;
    S.roll = 0;
    S.mode = 'free';
    S.speed = Math.max(S.speed, drive ? 12 : 30);
    S.target = null;
    S.auto = null;
  }

  function goto(target) {
    if (!S.started) return false;
    const tp = posOf(target);
    const from = S.pos.clone();
    const dir = from.clone().sub(tp);
    if (drive) dir.y = 0;
    if (dir.lengthSq() < 1e-4) dir.set(0, 0.25, 1);
    dir.normalize();
    S.dir.copy(dir);
    const dock = tp.clone().addScaledVector(dir, target.dockDist);
    if (drive) dock.y = groundY;

    const fwd = forward().clone();
    if (drive) { fwd.y = 0; fwd.normalize(); }
    const c1 = from.clone().addScaledVector(fwd, clamp(from.distanceTo(dock) * 0.35, 30, 160));
    const c2 = dock.clone().addScaledVector(dir, target.dockDist * 0.7 + 30);
    const curve = new THREE.CatmullRomCurve3([from, c1, c2, dock], false, 'centripetal');
    const len = curve.getLength();
    S.auto = { curve, t: 0, len, dur: clamp(len / spec.autoSpeed, 2.2, 6.5) };
    S.target = target;
    S.mode = 'auto';
    return true;
  }

  function flyUpdate(dt, input) {
    const c = spec;
    S.yaw -= input.x * c.turn * dt;
    if (input.y) S.pitch = clamp(S.pitch + input.y * c.pitchRate * dt, -1.2, 1.2);
    else S.pitch *= Math.max(0, 1 - dt * 0.45);
    S.roll += (-input.x * c.roll - S.roll) * Math.min(1, dt * 4);
    const cruise = input.boost ? c.boost : input.brake ? c.brake : c.cruise;
    S.speed += (cruise - S.speed) * Math.min(1, dt * c.accel);
    _e.set(S.pitch, S.yaw, S.roll, 'YXZ');
    S.quat.setFromEuler(_e);
    S.pos.addScaledVector(forward(), S.speed * dt);
    if (c.vertical) {
      S.pos.y = Math.max(groundY + 1.5, S.pos.y + input.vertical * c.vertical * dt);
    }
  }

  function driveUpdate(dt, input) {
    const c = spec;
    const top = input.boost ? c.boostSpeed : c.cruise;
    let target = 0;
    if (!input.brake) {
      if (input.y > 0) target = top;
      else if (input.y < 0) target = -c.reverse;
    }
    const rate = input.brake ? 5 : input.y !== 0 ? c.accel : 0.5;
    S.speed += (target - S.speed) * Math.min(1, dt * rate);
    // Руль работает на ходу: на месте машина не поворачивает
    const grip = clamp(Math.abs(S.speed) / (c.cruise * 0.35), 0, 1);
    S.yaw -= input.x * c.turn * dt * grip * Math.sign(S.speed || 1);
    // Мотоцикл ложится в поворот, машина слегка заваливается
    const lean = c.lean ? -input.x * c.lean * clamp(Math.abs(S.speed) / c.cruise, 0, 1) : 0;
    S.roll += (lean - S.roll) * Math.min(1, dt * 6);
    S.pitch = 0;
    _e.set(0, S.yaw, S.roll, 'YXZ');
    S.quat.setFromEuler(_e);
    const f = forward();
    S.pos.x += f.x * S.speed * dt;
    S.pos.z += f.z * S.speed * dt;
    S.pos.y = groundY;
  }

  function autoUpdate(dt) {
    const a = S.auto;
    a.t = Math.min(1, a.t + dt / a.dur);
    const e = easeInOutCubic(a.t);
    a.curve.getPointAt(e, S.pos);
    const tan = a.curve.getTangentAt(clamp(e, 0.001, 0.999));
    if (drive) tan.y = 0;
    aimQuat(ZERO, tan, S.quat);
    S.speed = a.len / a.dur;
    if (a.t >= 1) {
      S.speed = 0;
      if (a.arriving) {
        S.mode = 'idle';
        S.auto = null;
      } else {
        S.mode = 'dock';
        S.bob = 0;
      }
    }
  }

  // Стыковка: держимся у цели, даже если она движется (спутники, покачивание)
  function dockUpdate(dt) {
    const tg = S.target;
    const tp = posOf(tg);
    S.bob += dt;
    const bob = drive ? 0.1 : Math.sin(S.bob * 1.3) * 1.5;
    _v.copy(tp).addScaledVector(S.dir, tg.dockDist + bob);
    if (drive) _v.y = groundY;
    S.pos.lerp(_v, 1 - Math.exp(-dt * 4));
    aimQuat(S.pos, tp, _q);
    S.quat.slerp(_q, 1 - Math.exp(-dt * 5));
    S.speed = 0;
  }

  function update(dt, input) {
    if (S.mode === 'free') (drive ? driveUpdate : flyUpdate)(dt, input);
    else if (S.mode === 'auto' || S.mode === 'arrive') autoUpdate(dt);
    else if (S.mode === 'dock') dockUpdate(dt);
  }

  // Камера: идёт за транспортом с инерцией; в стыковке кадрирует цель, оставляя место для карточки
  function updateCamera(camera, dt, t) {
    const cam = spec.camera;
    const view = spec.dockView;
    let desired, look, k = 1 - Math.exp(-dt * 8);

    if (!S.started && S.mode === 'idle') {
      const a = t * 0.12;
      desired = S.pos.clone().add(new THREE.Vector3(Math.sin(a) * cam.orbit, cam.orbitH, Math.cos(a) * cam.orbit));
      look = S.pos.clone().add(new THREE.Vector3(0, 1, 0));
      k = 1 - Math.exp(-dt * 2);
    } else if (S.mode === 'dock') {
      const tg = S.target;
      const tp = posOf(tg);
      const right = _w.crossVectors(UP, S.dir).normalize();
      // Камера стоит дальше точки стыковки, так что транспорт оказывается между ней и целью
      desired = tp.clone().addScaledVector(S.dir, tg.dockDist + view.dist).addScaledVector(right, view.side);
      desired.y += view.height;
      look = tp.clone().lerp(S.pos, 0.25).addScaledVector(right, view.lookShift);
      k = 1 - Math.exp(-dt * 2.5);
    } else {
      const back = new THREE.Vector3(...cam.back).applyQuaternion(S.quat);
      desired = S.pos.clone().add(back);
      look = S.pos.clone().addScaledVector(forward(), cam.look);
      if (S.mode === 'auto' || S.mode === 'arrive') k = 1 - Math.exp(-dt * 3.2);
    }

    if (!rig.init) {
      rig.pos.copy(desired); rig.look.copy(look); rig.init = true;
    }
    rig.pos.lerp(desired, k);
    rig.look.lerp(look, k);
    const speedFrac = clamp(S.speed / (drive ? spec.boostSpeed : spec.boost), 0, 1);
    if (S.mode === 'free' && speedFrac > 0.6) {
      const sh = (speedFrac - 0.6) * 0.3;
      rig.pos.x += (Math.random() - 0.5) * sh;
      rig.pos.y += (Math.random() - 0.5) * sh;
    }
    camera.position.copy(rig.pos);
    camera.lookAt(rig.look);

    const boost = S.mode === 'auto' || S.mode === 'arrive' ? 0.7 : clamp((speedFrac - 0.6) / 0.4, 0, 1);
    rig.fov += (62 + boost * 13 - rig.fov) * (1 - Math.exp(-dt * 3));
    camera.fov = rig.fov;
    camera.updateProjectionMatrix();
  }

  return {
    state: S,
    spec,
    setPose, arrive, start, goto, release, update, updateCamera, forward,
    get warp() {
      if (S.mode === 'auto' || S.mode === 'arrive') return 0.7;
      const top = drive ? spec.boostSpeed : spec.boost;
      return clamp((S.speed - spec.cruise * 0.9) / (top - spec.cruise * 0.9 + 1e-6), 0, 1) * (drive ? 0.5 : 1);
    }
  };
}
