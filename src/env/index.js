// Реестр миров. Новый мир = файл с функцией build(scene, { content, pixelRatio, accent }),
// который возвращает { name, targets, groundY, spawn, lights, background, fog, update(dt, t) }.
import { buildSpace } from './space.js';
import { buildSky } from './sky.js';
import { buildRoad } from './road.js';

export const ENVIRONMENTS = { space: buildSpace, sky: buildSky, road: buildRoad };
