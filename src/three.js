// Единая точка входа для three.js. Библиотека грузится с CDN одной строкой, без importmap:
// так страница проходит строгий CSP (без инлайн-скриптов). Версию меняем здесь и только здесь.
export * from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
