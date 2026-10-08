// Интерфейс поверх сцены: интро, миссии, подписи, телеметрия, карточки, уведомления, звук, варп-эффект.
// Всё, что показывается, берётся из контента (site.json + github.json), поэтому здесь нет ни одного имени.
import * as THREE from '../three.js';
import { clamp, esc, fmt, TAU } from './util.js';

const $ = (sel) => document.querySelector(sel);

export function createUI({ content, vehicles, vehicleName, envName }) {
  const cardEl = $('#card');
  const cardBody = $('#card-body');
  const scanEl = $('#scan');
  const labelsHost = $('#labels');
  const missionEls = new Map();
  const labelEls = new Map();
  const discovered = new Set();
  const _p = new THREE.Vector3();
  const _items = [];
  let handlers = {};
  let targets = [];
  let dockedFor = null;
  let openId = null;
  let armed = false; // интро уже показано: до прилёта HUD и подписи скрыты

  const accentOf = (t) => t.accent || '#ffcf6b';

  /* ---------- Миссии и подписи ---------- */
  function buildMissions() {
    const ol = $('#missions');
    targets.forEach((t, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'mission';
      btn.style.setProperty('--c', accentOf(t));
      btn.innerHTML = `<span class="m-idx">${String(i + 1).padStart(2, '0')}</span>
        <span class="m-name">${esc(t.name)}</span>
        <span class="m-when">${esc(t.when)}</span><span class="m-dot"></span>`;
      btn.addEventListener('click', () => handlers.goto(t));
      li.appendChild(btn);
      ol.appendChild(li);
      missionEls.set(t.id, btn);
    });
  }

  function buildLabels() {
    targets.forEach((t) => {
      const el = document.createElement('button');
      el.className = 'label';
      el.style.setProperty('--c', accentOf(t));
      el.innerHTML = `<i></i><span class="l-name">${esc(t.name)}</span><span class="l-when">${esc(t.when)}</span>`;
      el.addEventListener('click', (e) => { e.stopPropagation(); handlers.goto(t); });
      labelsHost.appendChild(el);
      labelEls.set(t, el);
    });
  }

  const hideLabel = (el) => { el.style.opacity = 0; el.style.pointerEvents = 'none'; };

  // Подписи: ближняя важнее, пересекающиеся скрываются (до них всё равно можно добраться из списка)
  function updateLabels(camera, fpos) {
    const W = innerWidth, H = innerHeight;
    const pxPerUnit = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    _items.length = 0;
    labelEls.forEach((el, t) => {
      const wp = t.obj.getWorldPosition(_p);
      const dist = wp.distanceTo(fpos);
      const maxD = t.labelRange || 2100;
      const v = wp.clone().project(camera);
      if (!armed || dist > maxD || v.z > 1 || v.z < -1) { hideLabel(el); return; }
      _items.push({
        el, dist,
        fade: clamp(1 - (dist - maxD * 0.6) / (maxD * 0.4), 0, 1),
        x: (v.x * 0.5 + 0.5) * W,
        y: (-v.y * 0.5 + 0.5) * H - t.radius * pxPerUnit / Math.max(dist, 1) - 6,
        w: el.offsetWidth, h: el.offsetHeight
      });
    });
    _items.sort((a, b) => a.dist - b.dist);
    const placed = [];
    for (const it of _items) {
      const x0 = it.x - it.w / 2 - 6, x1 = it.x + it.w / 2 + 6;
      const y0 = it.y - it.h - 4, y1 = it.y + 4;
      const clash = placed.some((r) => x0 < r.x1 && x1 > r.x0 && y0 < r.y1 && y1 > r.y0);
      if (clash || it.fade < 0.05) { hideLabel(it.el); continue; }
      placed.push({ x0, x1, y0, y1 });
      it.el.style.opacity = it.fade;
      it.el.style.pointerEvents = 'auto';
      it.el.style.transform = `translate3d(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
  }

  /* ---------- Карточки ---------- */
  function renderAbout() {
    const P = content.person;
    return `
      <div class="kicker">Обо мне${P.callsign ? ' · ' + esc(P.callsign) : ''}</div>
      <h2 class="c-title">${esc(P.name)}</h2>
      <p class="c-role">${esc(P.role)}</p>
      ${P.lead ? `<p class="c-lead">${esc(P.lead)}</p>` : ''}
      ${P.bio ? `<p class="c-body">${esc(P.bio)}</p>` : ''}
      ${P.stats?.length ? `<div class="c-metrics">${P.stats.map((s, i) => `
        <div class="metric" style="--i:${i}"><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join('')}</div>` : ''}
      ${P.experience?.length ? `<h4>Опыт</h4>
        <ol class="timeline">${P.experience.map((e) => `
          <li><span class="tl-when">${esc(e.period)}</span><b>${esc(e.role)}</b><em>${esc(e.org)}</em></li>`).join('')}</ol>` : ''}
      ${P.skills?.length ? `<h4>Навыки</h4>${P.skills.map((g) => `
        <div class="skill-group"><span>${esc(g.group)}</span>
        <div class="chips">${g.items.map((x) => `<i class="chip">${esc(x)}</i>`).join('')}</div></div>`).join('')}` : ''}
      ${P.education?.length ? `<h4>Образование</h4><ul class="plain">${P.education.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${P.certificates?.length ? `<h4>Сертификаты</h4><ul class="plain">${P.certificates.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${P.languages ? `<p class="c-meta">${esc(P.languages)}</p>` : ''}
      ${P.principles?.length ? `<h4>Как я работаю</h4><ul class="plain">${P.principles.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${P.seeking ? `<p class="c-seek">${esc(P.seeking)}</p>` : ''}`;
  }

  function renderProject(t) {
    const p = t.data;
    const links = [
      p.url ? `<a class="btn" href="${esc(p.url)}" target="_blank" rel="noopener">Репозиторий</a>` : '',
      p.live ? `<a class="btn ghost" href="${esc(p.live)}" target="_blank" rel="noopener">Живой сайт</a>` : ''
    ].join('');
    return `
      <div class="kicker">${esc(p.when)}${p.role ? ' · ' + esc(p.role) : ''}</div>
      <h2 class="c-title">${esc(p.name)}</h2>
      ${p.stars ? `<p class="c-role">★ ${fmt(p.stars)} на GitHub${p.language ? ' · ' + esc(p.language) : ''}</p>` : (p.language ? `<p class="c-role">${esc(p.language)}</p>` : '')}
      ${p.short ? `<p class="c-lead">${esc(p.short)}</p>` : ''}
      ${p.body ? `<p class="c-body">${esc(p.body)}</p>` : ''}
      ${p.bullets?.length ? `<ul class="bullets">${p.bullets.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${p.metrics?.length ? `<div class="c-metrics">${p.metrics.map((m, i) => `
        <div class="metric" style="--i:${i}"><b>${esc(m.value)}</b><span>${esc(m.label)}</span></div>`).join('')}</div>` : ''}
      ${p.tags?.length ? `<div class="chips">${p.tags.map((x) => `<i class="chip">${esc(x)}</i>`).join('')}</div>` : ''}
      ${links ? `<div class="c-links">${links}</div>` : ''}`;
  }

  function renderContact() {
    return `
      <div class="kicker">Связь</div>
      <h2 class="c-title">Связаться со мной</h2>
      ${content.person.seeking ? `<p class="c-lead">${esc(content.person.seeking)}</p>` : ''}
      <ul class="contacts">${content.contacts.map((c, i) => `
        <li style="--i:${i}"><span>${esc(c.label)}</span><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.value)}</a></li>`).join('')}</ul>`;
  }

  function openCard(t) {
    openId = t.id;
    const html = t.kind === 'about' ? renderAbout() : t.kind === 'contact' ? renderContact() : renderProject(t);
    cardBody.innerHTML = html;
    cardBody.scrollTop = 0;
    cardEl.style.setProperty('--accent', accentOf(t));
    cardEl.classList.add('is-open');
    cardEl.setAttribute('aria-hidden', 'false');
  }

  function closeCard() {
    cardEl.classList.remove('is-open');
    cardEl.setAttribute('aria-hidden', 'true');
    openId = null;
  }

  $('#card-close').addEventListener('click', () => closeCard());

  /* ---------- Открытия и уведомления ---------- */
  function toast(title, text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<b>${esc(title)}</b><span>${esc(text)}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3800);
  }

  function discover(t) {
    discovered.add(t.id);
    $('#t-found').textContent = discovered.size;
    toast('Открыто: ' + t.name, t.kind === 'project' ? (t.data.short || t.when).slice(0, 90) : t.when);
    if (discovered.size === targets.length) toast('Все миры открыты', 'Резюме изучено полностью. Напишите мне.');
  }

  /* ---------- Варп: радиальные линии при высокой скорости ---------- */
  const wc = $('#warp');
  const wx = wc.getContext('2d');
  const streaks = Array.from({ length: 110 }, () => ({ a: Math.random() * TAU, r: Math.random(), len: 0.15 + Math.random() * 0.45, sp: 0.6 + Math.random() * 1.4 }));
  function resizeWarp() { wc.width = innerWidth; wc.height = innerHeight; }
  function drawWarp(w, dt) {
    wx.clearRect(0, 0, wc.width, wc.height);
    if (w < 0.03) return;
    const cx = wc.width / 2, cy = wc.height / 2;
    const R = Math.hypot(cx, cy);
    wx.lineCap = 'round';
    for (const s of streaks) {
      s.r += dt * s.sp * (0.5 + w * 2.4);
      if (s.r > 1) { s.r -= 1; s.a = Math.random() * TAU; }
      const r0 = Math.pow(s.r, 2.4) * R;
      const r1 = r0 + s.len * w * R * 0.35 + 6;
      const c = Math.cos(s.a), sn = Math.sin(s.a);
      wx.strokeStyle = `rgba(200,225,255,${(0.55 * w * s.r).toFixed(3)})`;
      wx.lineWidth = 0.6 + s.r * 1.6;
      wx.beginPath();
      wx.moveTo(cx + c * r0, cy + sn * r0);
      wx.lineTo(cx + c * r1, cy + sn * r1);
      wx.stroke();
    }
  }

  /* ---------- Звук: гул мотора, частота зависит от транспорта и скорости ---------- */
  const Snd = (() => {
    let ctx = null, master = null, hum = null, filt = null, noiseGain = null, on = false;
    const base = vehicles[vehicleName].spec.hum || 44;
    function start() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = ctx || new AC();
      if (ctx.state === 'suspended') ctx.resume();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 400;
      filt.connect(master);
      hum = ctx.createOscillator();
      hum.type = 'sawtooth';
      hum.frequency.value = base;
      const g1 = ctx.createGain();
      g1.gain.value = 0.2;
      hum.connect(g1); g1.connect(filt);
      hum.start();
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = base * 2;
      const g2 = ctx.createGain();
      g2.gain.value = 0.1;
      sub.connect(g2); g2.connect(filt);
      sub.start();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      noise.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 900;
      bp.Q.value = 0.7;
      noiseGain = ctx.createGain();
      noiseGain.gain.value = 0;
      noise.connect(bp); bp.connect(noiseGain); noiseGain.connect(master);
      noise.start();
      master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.4);
      on = true;
      return true;
    }
    function stop() {
      if (!ctx) return;
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      on = false;
    }
    function update(speedFrac, warp) {
      if (!on) return;
      const t = ctx.currentTime;
      hum.frequency.setTargetAtTime(base + speedFrac * base * 0.5, t, 0.2);
      filt.frequency.setTargetAtTime(340 + speedFrac * 700, t, 0.2);
      noiseGain.gain.setTargetAtTime(warp * 0.14, t, 0.15);
    }
    return { start, stop, update, get on() { return on; } };
  })();

  const soundBtn = $('#btn-sound');
  function toggleSound() {
    if (Snd.on) { Snd.stop(); soundBtn.setAttribute('aria-pressed', 'false'); soundBtn.textContent = 'Звук выкл'; return; }
    if (Snd.start()) { soundBtn.setAttribute('aria-pressed', 'true'); soundBtn.textContent = 'Звук вкл'; }
  }
  soundBtn.addEventListener('click', toggleSound);

  /* ---------- Кадр ---------- */
  const _q = new THREE.Vector3();
  function frame(dt, camera, ctrl) {
    const S = ctrl.state;
    const topSpeed = ctrl.spec.control === 'drive' ? ctrl.spec.boostSpeed : ctrl.spec.boost;
    let nearest = null, nd = Infinity;
    for (const t of targets) {
      const d = t.obj.getWorldPosition(_q).distanceTo(S.pos);
      t._d = d;
      if (d < nd) { nd = d; nearest = t; }
      if (!discovered.has(t.id) && S.started && d < t.radius * 4.2 + 30) discover(t);
    }

    document.body.classList.toggle('is-flying', armed && S.started);
    const modeText = {
      idle: 'Готов к взлёту',
      arrive: 'Прилёт',
      free: 'Ручное управление',
      auto: S.target ? 'Автопилот → ' + S.target.name : 'Автопилот',
      dock: S.target ? 'Стыковка · ' + S.target.name : 'Стыковка'
    }[S.mode];
    $('#t-status').textContent = modeText;
    $('#t-speed').textContent = fmt(S.speed * ctrl.spec.kmh);
    $('#t-dist').textContent = nearest ? fmt(nd * 10) : '—';
    $('#t-sector').textContent = nearest ? nearest.name : '—';

    const scanOn = armed && S.started && S.mode === 'free' && nearest && nd < nearest.radius * 4.6 + 40 && !cardEl.classList.contains('is-open');
    scanEl.classList.toggle('is-on', !!scanOn);
    if (scanOn) $('#scan-name').textContent = nearest.name;
    scanEl.dataset.id = scanOn ? nearest.id : '';

    if (S.mode === 'dock' && S.target && dockedFor !== S.target.id) {
      dockedFor = S.target.id;
      openCard(S.target);
    }
    if (S.mode !== 'dock') dockedFor = null;

    missionEls.forEach((btn, id) => {
      btn.classList.toggle('is-active', (S.mode === 'dock' || S.mode === 'auto') && S.target && S.target.id === id);
      btn.classList.toggle('is-found', discovered.has(id));
    });
    $('#btn-free').classList.toggle('is-on', armed && (S.mode === 'auto' || S.mode === 'dock'));

    updateLabels(camera, S.pos);
    drawWarp(ctrl.warp, dt);
    Snd.update(clamp(S.speed / topSpeed, 0, 1), ctrl.warp);
  }

  // Интро показываем после прилёта: до этого сцена живёт сама
  function revealIntro() {
    armed = true;
    $('#intro').classList.remove('is-hidden');
  }

  function init(opts) {
    handlers = opts.handlers;
    targets = opts.targets;
    buildMissions();
    buildLabels();
    $('#t-total').textContent = targets.length;
    $('#t-brand-name').textContent = content.person.name || content.site.title;
    $('#t-brand-role').textContent = content.person.role || '';
    $('#t-callsign').textContent = `${vehicles[vehicleName].label} · ${envName === 'space' ? 'космос' : envName === 'sky' ? 'небо' : 'трасса'}`;
    $('#hero-name').textContent = content.person.name || content.site.title;
    $('#hero-role').textContent = content.person.role || '';
    $('#hero-lead').textContent = content.person.lead || '';
    $('#hero-eyebrow').textContent = content.site.intro.eyebrow || '';
    $('#hero-text').textContent = content.site.intro.tagline || '';
    $('#vehicle-chips').innerHTML = Object.entries(vehicles).map(([key, v]) =>
      `<a class="chip-link${key === vehicleName ? ' is-current' : ''}" href="?vehicle=${key}">${esc(v.label)}</a>`).join('');
    document.title = content.site.title;
    resizeWarp();
    addEventListener('resize', resizeWarp);
    $('#scan-go').addEventListener('click', () => {
      const t = targets.find((x) => x.id === scanEl.dataset.id);
      if (t) handlers.goto(t);
    });
  }

  return {
    init, frame, openCard, closeCard, toast, revealIntro, toggleSound,
    get openId() { return openId; }
  };
}
