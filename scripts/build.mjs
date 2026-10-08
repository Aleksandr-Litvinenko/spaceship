#!/usr/bin/env node
// Сборка сайта: проверяет контент и копирует статику в dist/. Сборщика нет — движок работает как есть.
//   npm run build
// Ошибка контента (неизвестный транспорт, пустой список проектов) остановит сборку с понятным текстом.

import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveContent, VEHICLE_ENV } from '../src/core/content.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const readJSON = async (rel) => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const exists = (rel) => stat(path.join(root, rel)).then(() => true, () => false);

const cfg = await readJSON('content/site.json');
let github = { user: '', repos: [] };
if (await exists('content/github.json')) {
  github = await readJSON('content/github.json');
} else {
  console.warn('! content/github.json нет: проекты возьмутся без ссылок и звёзд. Запустите npm run fetch.');
}

let content;
try {
  content = resolveContent(cfg, github);
} catch (err) {
  console.error('Сборка остановлена: ' + err.message);
  process.exit(1);
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const item of ['index.html', 'src', 'content']) {
  await cp(path.join(root, item), path.join(dist, item), { recursive: true });
}

console.log('Сайт собран в dist/');
console.log(`  транспорт: ${content.vehicle} (мир: ${content.environment})`);
console.log(`  доступные транспорты: ${Object.keys(VEHICLE_ENV).join(', ')}`);
console.log(`  проектов: ${content.projects.length}`);
content.projects.forEach((p) => console.log(`    - ${p.name}${p.live ? ' (есть живой сайт)' : ''}`));
