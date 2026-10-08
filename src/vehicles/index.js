// Реестр транспорта. Чтобы добавить новый вид, создайте файл по образцу и добавьте его сюда
// (и правило в VEHICLE_ENV в src/core/content.js). См. prompts/new-vehicle.md.
import { vehicle as plane } from './plane.js';
import { vehicle as spaceship } from './spaceship.js';
import { vehicle as helicopter } from './helicopter.js';
import { vehicle as car } from './car.js';
import { vehicle as motorcycle } from './motorcycle.js';

export const VEHICLES = { plane, spaceship, helicopter, car, motorcycle };
