// Точка входа движка: качество → рендерер → материалы → мир → транспорт → постобработка → цикл кадров.
import * as THREE from './three.js';
import { resolveContent } from './core/content.js';
import { VEHICLES } from './vehicles/index.js';
import { ENVIRONMENTS } from './env/index.js';
import { createController } from './core/controller.js';
import { createInput } from './core/input.js';
import { createUI } from './core/ui.js';
import { Particles } from './core/effects.js';
import { chooseQuality, createRenderer, QUALITY } from './core/render.js';
import { createPost } from './core/post.js';
import { initMaterials } from './vehicles/shared.js';

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

  // Качество: ?q=low|high|ultra, иначе по устройству
  const quality = chooseQuality(params.get('q'));
  const Q = QUALITY[quality];

  const canvas = $('#scene');
  const renderer = createRenderer(canvas, quality);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.8, 12000);
  const pixelRatio = renderer.getPixelRatio();

  // Материалы с процедурными картами (панели, флейк, соты) запекаются один раз на GPU
  initMaterials(renderer);

  // Мир: текстуры планет, небо, вода, асфальт — всё генерируется здесь
  const world = ENVIRONMENTS[envName](scene, { content, renderer, quality, pixelRatio, accent });
  world.lights.forEach((l) => scene.add(l));
  scene.environment = world.environment;
  scene.background = world.background;
  scene.fog = new THREE.FogExp2(world.fog.color, world.fog.density);

  // Транспорт
  const model = vehicle.build(accent);
  scene.add(model.group);
  const exhaust = vehicle.spec.exhaust && model.nozzles.length
    ? new Particles(scene, { max: 300, size: vehicle.spec.control === 'drive' ? 0.9 : 1.2 })
    : null;

  const ctrl = createController(vehicle.spec, { groundY: world.groundY });
  ctrl.setPose(world.spawn.pos, world.spawn.yaw);
  ctrl.arrive(world.spawn.arriveFrom, world.spawn.pos, 6.5);

  // Постобработка: на high и ultra; на low сцена рисуется напрямую
  const post = Q.post
    ? createPost({ renderer, scene, camera, width: innerWidth, height: innerHeight, pixelRatio, samples: Q.samples, bloom: world.grade.bloom, threshold: world.grade.threshold })
    : null;
  if (post) {
    post.grade.uniforms.uVignette.value = world.grade.vignette;
    post.grade.uniforms.uWarm.value = world.grade.warm;
  }

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
    world.update(dt, t, ctrl.state.pos);
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
      document.body.classList.add('is-ready');
    }
    if (frameNo % 8 === 0 && input.pointer.on) {
      canvas.style.cursor = pick(input.pointer.cx, input.pointer.cy) ? 'pointer' : 'crosshair';
    }

    if (post) post.render(t);
    else renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if (post) post.setSize(innerWidth, innerHeight);
  });

  // Для отладки в консоли: ?debug=1
  if (params.has('debug')) window.spaceship = { content, world, ctrl, camera, scene, renderer, vehicle: vehicleName, env: envName, quality };

  frame();
  $('#loader')?.remove();
}

boot().catch((err) => {
  console.error(err);
  $('#loader')?.remove();
  const box = $('#boot-error');
  if (box) {
    box.hidden = false;
    box.textContent = 'Не удалось собрать сайт: ' + err.message;
  }
});
