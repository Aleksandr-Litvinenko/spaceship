#!/usr/bin/env node
// Вендоринг аддонов three.js: скачивает нужные файлы examples/jsm с jsDelivr в src/vendor/jsm,
// рекурсивно собирая их относительные импорты, и переписывает голые импорты 'three'
// на локальный src/three.js. Так страница работает под строгим CSP и без importmap.
//   npm run vendor
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.160.0';
const CDN = `https://cdn.jsdelivr.net/npm/three@${VERSION}/examples/jsm/`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = path.join(root, 'src', 'vendor', 'jsm');

// Что реально используем: постобработка, физическое небо, вода
const seeds = [
  'postprocessing/EffectComposer.js',
  'postprocessing/RenderPass.js',
  'postprocessing/ShaderPass.js',
  'postprocessing/UnrealBloomPass.js',
  'postprocessing/OutputPass.js',
  'objects/Sky.js',
  'objects/Water.js'
];

// Путь от файла внутри src/vendor/jsm/<dir>/ до src/three.js
const threeImport = (rel) => {
  const dirSegments = path.posix.dirname(rel).split('/').filter(Boolean).length;
  return '../'.repeat(dirSegments + 2) + 'three.js';
};

const queue = [...seeds];
const seen = new Set();
const specRe = /(from\s+|import\s+)['"]([^'"]+)['"]/g;

while (queue.length) {
  const rel = queue.shift();
  if (seen.has(rel)) continue;
  seen.add(rel);

  const res = await fetch(CDN + rel);
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  let code = await res.text();

  code = code.replace(specRe, (match, kw, spec) => {
    if (spec === 'three') return match.replace(`'${spec}'`, `'${threeImport(rel)}'`).replace(`"${spec}"`, `'${threeImport(rel)}'`);
    if (spec.startsWith('.')) {
      const dep = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
      queue.push(dep);
    }
    return match;
  });

  const target = path.join(outRoot, rel);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, code, 'utf8');
  console.log(`  ${rel}`);
}

console.log(`Готово: ${seen.size} файлов аддонов three.js ${VERSION} → src/vendor/jsm`);
