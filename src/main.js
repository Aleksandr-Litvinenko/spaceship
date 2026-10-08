// Точка входа движка: читает контент, выбирает транспорт и мир, запускает прилёт и цикл кадров.
import * as THREE from './three.js';
import { resolveContent } from './core/content.js';
import { VEHICLES } from './vehicles/index.js';
import { ENVIRONMENTS } from './env/index.js';
import { createController } from './core/controller.js';
import { createInput } from './core/input.js';
import { createUI } from './core/ui.js';
import { Particles } from './core/effects.js';

// Цвета задаём как в обычном CSS (hex = sRGB, без перевода в линейное пространство) — так шейдеры и материалы совпадают
THREE.ColorManagement.enabled = false;

const $ = (sel) => document.querySelector(sel);

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const [cfg, github] = await Promise.all([
    loadJSON('content/site.json'),
    loadJSON('content/github.json').catch(() => ({ user: '', repos: [] }))
  ]);
  // ?vehicle=car — посмотреть другой транспорт без правки конфига
  if (params.get('vehicle')) cfg.site = { ...cfg.site, vehicle: params.get('vehicle') };

  const content = resolveContent(cfg, github);
  const vehicleName = content.vehicle;
  const vehicle = VEHICLES[vehicleName];
  const envName = content.environment;
  const accent = content.site.accent[0];

  const canvas = $('#scene');
  const pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.8, 12000);

  // Мир, потом транспорт в нём
  const world = ENVIRONMENTS[envName](scene, { content, pixelRatio, accent });
  world.lights.forEach((l) => scene.add(l));
  scene.background = new THREE.Color(world.background);
  scene.fog = new THREE.FogExp2(world.fog.color, world.fog.density);

  const model = vehicle.build(accent);
  scene.add(model.group);
  const exhaust = vehicle.spec.exhaust && model.nozzles.length
    ? new Particles(scene, { max: 420, size: vehicle.spec.control === 'drive' ? 0.9 : 1.9 })
    : null;

  const ctrl = createController(vehicle.spec, { groundY: world.groundY });
  ctrl.setPose(world.spawn.pos, world.spawn.yaw);
  ctrl.arrive(world.spawn.arriveFrom, world.spawn.pos, 6.5);

  /* ---------- Интерфейс и управление ---------- */
  const ui = createUI({ content, vehicles: VEHICLES, vehicleName, envName });
  const findTarget = (id) => world.targets.find((t) => t.id === id);

  function goto(t) {
    if (!t || !ctrl.state.started) return;
    if (ctrl.state.mode === 'dock' && ctrl.state.target === t) { ui.openCard(t); return; }
    ui.closeCard();
    ctrl.goto(t);
  }
  function release() {
    ui.closeCard();
    ctrl.release();
  }

  ui.init({ targets: world.targets, handlers: { goto } });
  $('#btn-free').addEventListener('click', release);

  const intro = $('#intro');
  $('#btn-takeoff').addEventListener('click', () => {
    ctrl.start();
    document.body.classList.add('is-takeoff');
    intro.classList.add('is-gone');
    ui.toast('Взлёт', 'Курсор или WASD — курс. Shift — форсаж. Клик по цели — автопилот.');
    $('#btn-takeoff').blur();
  });

  const input = createInput(canvas, {
    escape: () => (ui.openId ? ui.closeCard() : release()),
    enter: () => {
      const id = $('#scan').dataset.id;
      if (id && ctrl.state.mode === 'free') goto(findTarget(id));
    },
    mute: () => ui.toggleSound(),
    click: (x, y) => { const t = pick(x, y); if (t) goto(t); }
  });

  // Клик по миру: луч из камеры, ищем цель (спрайты пропускаем — у них огромный размер)
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const owner = new Map(world.targets.map((t) => [t.obj, t]));
  const pickables = [...owner.keys()];
  function pick(clientX, clientY) {
    ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, true).find((h) => !h.object.isSprite);
    if (!hit) return null;
    let o = hit.object;
    while (o && !owner.has(o)) o = o.parent;
    return o ? owner.get(o) : null;
  }

  /* ---------- Цикл ---------- */
  const clock = new THREE.Clock();
  const back = new THREE.Vector3(0, 0, 1);
  let frameNo = 0;
  let revealed = false;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    frameNo++;

    ctrl.update(dt, input.read());
    world.update(dt, t);
    const S = ctrl.state;
    model.group.position.copy(S.pos);
    model.group.quaternion.copy(S.quat);
    model.group.updateMatrixWorld(true);
    model.update(dt, t, S);

    if (exhaust) {
      if (S.mode !== 'idle' && S.speed > 2) {
        const sources = model.nozzles.map((n) => model.group.localToWorld(n.clone()));
        const dir = back.clone().applyQuaternion(S.quat);
        exhaust.feed(dt, 30 + S.speed * 2, sources, dir, 6 + S.speed * 0.25);
      } else {
        exhaust.stop();
      }
      exhaust.update(dt);
    }

    ctrl.updateCamera(camera, dt, t);
    ui.frame(dt, camera, ctrl);

    if (!revealed && S.mode === 'idle' && !S.started) {
      revealed = true;
      ui.revealIntro();
    }
    if (frameNo % 8 === 0 && input.pointer.on) {
      canvas.style.cursor = pick(input.pointer.cx, input.pointer.cy) ? 'pointer' : 'crosshair';
    }

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  // Для отладки в консоли: ?debug=1
  if (params.has('debug')) window.spaceship = { content, world, ctrl, camera, scene, vehicle: vehicleName, env: envName };

  frame();
}

boot().catch((err) => {
  console.error(err);
  const box = document.querySelector('#boot-error');
  if (box) {
    box.hidden = false;
    box.textContent = 'Не удалось собрать сайт: ' + err.message;
  }
});
