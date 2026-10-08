// Частицы: выхлоп реактивных двигателей и пыль из-под колёс. Кольцевой буфер, аддитивное смешивание.
// Цвет умножается на «жизнь», поэтому угасающие частицы становятся чёрными и незаметными.
import * as THREE from '../three.js';
import { glow } from './gfx.js';
import { rnd } from './util.js';

export class Particles {
  constructor(scene, { max = 420, size = 1.9, hot = [1.0, 0.75, 0.45], cool = [0.4, 0.8, 1.0], drag = 1.6, spread = 5 } = {}) {
    this.max = max;
    this.hot = hot;
    this.cool = cool;
    this.drag = drag;
    this.spread = spread;
    this.P = new Float32Array(max * 3);
    this.V = new Float32Array(max * 3);
    this.C = new Float32Array(max * 3);
    this.L = new Float32Array(max);
    this.ML = new Float32Array(max);
    this.head = 0;
    this.acc = 0;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.P, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.C, 3));
    this.mat = new THREE.PointsMaterial({
      size, vertexColors: true, map: glow(), transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(origin, dir, speed, life = [0.5, 1.2]) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    const s = this.spread;
    this.P[i * 3] = origin.x; this.P[i * 3 + 1] = origin.y; this.P[i * 3 + 2] = origin.z;
    this.V[i * 3] = dir.x * speed + rnd(-s, s);
    this.V[i * 3 + 1] = dir.y * speed + rnd(-s, s);
    this.V[i * 3 + 2] = dir.z * speed + rnd(-s, s);
    this.L[i] = this.ML[i] = rnd(life[0], life[1]);
  }

  // Испускание с заданной частотой (в штуках в секунду) из списка точек
  feed(dt, rate, sources, dir, speed) {
    this.acc += dt * rate;
    while (this.acc >= 1) {
      this.acc -= 1;
      for (const s of sources) this.emit(s, dir, speed);
    }
  }

  stop() { this.acc = 0; }

  update(dt) {
    const P = this.P, V = this.V, C = this.C, L = this.L;
    const drag = Math.max(0, 1 - dt * this.drag);
    for (let i = 0; i < this.max; i++) {
      if (L[i] > 0) {
        L[i] -= dt;
        P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
        V[i * 3] *= drag; V[i * 3 + 1] *= drag; V[i * 3 + 2] *= drag;
        const k = Math.max(L[i], 0) / this.ML[i];
        C[i * 3] = lerp1(this.cool[0], this.hot[0], k) * k;
        C[i * 3 + 1] = lerp1(this.cool[1], this.hot[1], k) * k;
        C[i * 3 + 2] = lerp1(this.cool[2], this.hot[2], k) * k;
      } else {
        C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = 0;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

const lerp1 = (a, b, t) => a + (b - a) * t;
