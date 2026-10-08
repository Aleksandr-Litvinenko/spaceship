#!/usr/bin/env node
// Снимок публичных репозиториев GitHub-пользователя → content/github.json.
// Использование: npm run fetch            (логин берётся из content/site.json)
//                npm run fetch -- <логин>
// Токен не нужен для публичных репозиториев; если есть GITHUB_TOKEN, он поднимает лимит запросов.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteFile = path.join(root, 'content', 'site.json');
const outFile = path.join(root, 'content', 'github.json');

async function defaultUser() {
  try {
    const site = JSON.parse(await readFile(siteFile, 'utf8'));
    return site.site?.github;
  } catch {
    return undefined;
  }
}

const user = process.argv[2] || (await defaultUser());
if (!user) {
  console.error('Не указан логин GitHub: передайте его аргументом или задайте site.github в content/site.json');
  process.exit(1);
}

const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'spaceship-engine' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const all = [];
for (let page = 1; ; page++) {
  const url = `https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&type=owner&sort=pushed&page=${page}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`GitHub ответил ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const batch = await res.json();
  all.push(...batch);
  if (batch.length < 100) break;
}

// Только публичные, не форки. Приватные сюда не попадают вовсе — их имена не должны уйти на сайт.
const repos = all
  .filter((r) => !r.private && !r.fork)
  .map((r) => ({
    name: r.name,
    url: r.html_url,
    description: r.description || '',
    language: r.language || '',
    stars: r.stargazers_count || 0,
    topics: r.topics || [],
    homepage: r.homepage || '',
    updatedAt: r.updated_at,
    archived: !!r.archived
  }));

await writeFile(outFile, JSON.stringify({ user, fetchedAt: new Date().toISOString(), count: repos.length, repos }, null, 2) + '\n', 'utf8');
console.log(`Сохранено ${repos.length} публичных репозиториев пользователя ${user} → content/github.json`);
