// Сборка контента: site.json (кураторский, правите вы) + github.json (снимок GitHub) → данные для сцены.
// Модуль без DOM и без three.js: его же использует сборка в Node (npm run build) для проверки.

// Какое окружение нужно каждому транспорту. Окружение — это «мир», в котором он летает или едет.
export const VEHICLE_ENV = {
  spaceship: 'space',   // космос: планеты-проекты
  plane: 'sky',         // небо: острова-проекты над морем
  helicopter: 'sky',
  car: 'road',          // неон-трасса: ворота-проекты у дороги
  motorcycle: 'road'
};
export const ENVIRONMENTS = ['space', 'sky', 'road'];
export const VEHICLE_NAMES = Object.keys(VEHICLE_ENV);

// Слова для подписей интро: «Я — корабль. Проекты — планеты.» подставляются автоматически
export const VEHICLE_COPY = {
  plane: { noun: 'самолёт', places: 'острова над морем' },
  helicopter: { noun: 'вертолёт', places: 'острова над морем' },
  spaceship: { noun: 'корабль', places: 'планеты' },
  car: { noun: 'машина', places: 'ворота на трассе' },
  motorcycle: { noun: 'мотоцикл', places: 'ворота на трассе' }
};

// Подбор транспорта по профилю, если site.vehicle = "auto". Первое совпадение побеждает.
// Свои правила добавляются в site.vehicleRules: [{ "match": "регулярка", "vehicle": "car" }]
const DEFAULT_RULES = [
  [/космос|космич|game|игр|unity|webgl|3d|space|ракет|starship/i, 'spaceship'],
  [/вертол|helicopter|спасат|rescue/i, 'helicopter'],
  [/мотоцикл|moto|курьер|delivery|доставк/i, 'motorcycle'],
  [/машин|автомоб|автодил|driver|логист|fleet|\bcar\b/i, 'car'],
  [/самол[её]т|авиа|aviation|pilot|пилот|flight/i, 'plane']
];

export function pickVehicle(requested, profileText, customRules = []) {
  if (requested && requested !== 'auto') {
    if (!VEHICLE_ENV[requested]) {
      throw new Error(`Неизвестный транспорт «${requested}». Доступны: ${VEHICLE_NAMES.join(', ')}`);
    }
    return requested;
  }
  const rules = customRules.map((r) => [new RegExp(r.match, 'i'), r.vehicle]).concat(DEFAULT_RULES);
  for (const [re, name] of rules) {
    if (re.test(profileText)) return name;
  }
  return 'plane';
}

const year = (iso) => (iso ? String(new Date(iso).getFullYear()) : '');
const trim = (s, n = 140) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '');
// Насколько репозиторий «топовый»: звёзды, живой сайт, свежие коммиты
const score = (r) => (r.stars || 0) * 2 + (r.homepage ? 3 : 0) + (Date.now() - Date.parse(r.updatedAt) < 90 * 864e5 ? 2 : 0);

export function resolveProjects(cfg, github) {
  const repos = github?.repos || [];
  const user = cfg.site?.github || github?.user || '';
  const byName = new Map(repos.map((r) => [r.name.toLowerCase(), r]));
  const p = cfg.projects || {};

  let items = p.items || [];
  if (p.mode === 'top') {
    // Автоматически: самые сильные репозитории, без форков и архивов
    items = [...repos]
      .filter((r) => !r.archived)
      .sort((a, b) => score(b) - score(a))
      .slice(0, p.top || 6)
      .map((r) => ({ repo: r.name }));
  }

  return items.map((it, i) => {
    const repo = byName.get(String(it.repo || '').toLowerCase());
    const name = it.name || repo?.name || it.repo;
    if (!repo && p.mode !== 'top') {
      console.warn(`[content] репозиторий «${it.repo}» не найден в content/github.json — запустите npm run fetch`);
    }
    return {
      id: slug(it.repo || name) || `project-${i}`,
      kind: 'project',
      name,
      when: it.when || year(repo?.updatedAt),
      role: it.role || repo?.language || '',
      short: it.short || trim(repo?.description || '', 160),
      body: it.body || '',
      bullets: it.bullets || [],
      metrics: it.metrics || [],
      tags: it.tags || repo?.topics || [],
      url: repo?.url || (user ? `https://github.com/${user}/${it.repo}` : ''),
      live: it.live || repo?.homepage || '',
      stars: repo?.stars || 0,
      language: repo?.language || ''
    };
  });
}

// Единая точка входа: всё, что нужно сцене, одним объектом
export function resolveContent(cfg, github) {
  const site = cfg.site || {};
  const person = cfg.person || {};
  const projects = resolveProjects(cfg, github);
  if (!projects.length) throw new Error('Нет ни одного проекта: заполните projects.items в content/site.json');

  const profileText = [
    person.role, person.lead, person.bio,
    ...projects.map((p) => `${p.name} ${p.short} ${p.tags.join(' ')}`)
  ].join(' ');

  const vehicle = pickVehicle(site.vehicle, profileText, site.vehicleRules || []);
  const environment = site.environment && site.environment !== 'auto' ? site.environment : VEHICLE_ENV[vehicle];
  if (!ENVIRONMENTS.includes(environment)) {
    throw new Error(`Неизвестное окружение «${environment}». Доступны: ${ENVIRONMENTS.join(', ')}`);
  }

  return {
    site: {
      title: site.title || person.name || 'Портфолио',
      lang: site.lang || 'ru',
      github: site.github || github?.user || '',
      domain: site.domain || '',
      accent: site.accent?.length ? site.accent : ['#ff5fd2', '#2de1c2', '#ffcf6b', '#7b5cff'],
      intro: {
        eyebrow: site.intro?.eyebrow || (person.callsign ? `Резюме · позывной ${person.callsign}` : 'Портфолио'),
        tagline: site.intro?.tagline ||
          `Я — ${VEHICLE_COPY[vehicle].noun}. Проекты — ${VEHICLE_COPY[vehicle].places}. Поехали смотреть, чем я занимался.`
      }
    },
    person,
    contacts: cfg.contacts || [],
    projects,
    vehicle,
    environment
  };
}
