/**
 * РАЗЛОМ · Генерация мира: процедурный комплекс «Объект-9».
 * Лабиринт-коридоры + комнаты, слитая геометрия стен, освещение, коллизии, BFS-пути.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { concreteTexture, floorTexture, ceilingTexture, metalTexture } from './textures.js';

export const CELL = 4.2;
export const WALL_H = 3.4;

const DIRS = [
  { dx: 1, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
];

function key(x, z) { return x + ',' + z; }

export class World {
  constructor(seedText = '') {
    this.group = new THREE.Group();
    this.colliders = [];      // {minX, maxX, minZ, maxZ}
    this.floorCells = [];
    this.lightFixtures = [];  // {light, baseIntensity, flicker}
    this.seed = seedText;
  }

  /**
   * Генерирует уровень.
   * @param {number} cols размер сетки (нечётный)
   * @param {number} rows размер сетки (нечётный)
   */
  generate(cols = 21, rows = 21) {
    this.cols = cols % 2 === 0 ? cols + 1 : cols;
    this.rows = rows % 2 === 0 ? rows + 1 : rows;
    const { cols: W, rows: H } = this;

    // ── 1. Лабиринт (recursive backtracker) ──
    const grid = Array.from({ length: W }, () => new Array(H).fill(1)); // 1 = стена
    const stack = [[1, 1]];
    grid[1][1] = 0;
    while (stack.length) {
      const [cx, cz] = stack[stack.length - 1];
      const options = DIRS
        .map((d) => [cx + d.dx * 2, cz + d.dz * 2, d])
        .filter(([nx, nz]) => nx > 0 && nz > 0 && nx < W - 1 && nz < H - 1 && grid[nx][nz] === 1);
      if (options.length === 0) { stack.pop(); continue; }
      const [nx, nz, d] = options[(Math.random() * options.length) | 0];
      grid[cx + d.dx][cz + d.dz] = 0;
      grid[nx][nz] = 0;
      stack.push([nx, nz]);
    }

    // ── 2. Комнаты (расширяем полости) ──
    const roomCenters = [];
    for (let i = 0; i < 9; i++) {
      const rw = 3 + ((Math.random() * 3) | 0);   // 3..5
      const rh = 3 + ((Math.random() * 3) | 0);
      const rx = 1 + ((Math.random() * (W - rw - 2)) | 0);
      const rz = 1 + ((Math.random() * (H - rh - 2)) | 0);
      for (let x = rx; x < rx + rw; x++) {
        for (let z = rz; z < rz + rh; z++) grid[x][z] = 0;
      }
      roomCenters.push({ x: (rx + rw / 2) | 0, z: (rz + rh / 2) | 0, w: rw, h: rh });
    }

    this.grid = grid;
    this._bakeGeometry(roomCenters);
    this._placeLights(roomCenters);
    this._placeProps(roomCenters);

    // ── 3. Точки интереса ──
    this.spawn = this._cellToWorld(1, 1);
    this.spawn.y = 0;
    this.exitZone = { pos: this.spawn.clone(), radius: 2.2 };

    const dists = this._bfsDistances(1, 1);
    let maxD = 0;
    for (const d of dists.values()) maxD = Math.max(maxD, d);

    // Образцы — далеко и врозь
    this.sampleSpawns = [];
    const candidates = this.floorCells.filter((c) => (dists.get(key(c.x, c.z)) || 0) > maxD * 0.35);
    let guard = 0;
    while (this.sampleSpawns.length < 3 && guard++ < 400 && candidates.length) {
      const c = candidates[(Math.random() * candidates.length) | 0];
      const p = this._cellToWorld(c.x, c.z);
      if (this.sampleSpawns.every((s) => s.distanceTo(p) > CELL * 6)) {
        this.sampleSpawns.push(p.clone().setY(0));
      }
    }
    while (this.sampleSpawns.length < 3 && this.floorCells.length) {
      const c = this.floorCells[(Math.random() * this.floorCells.length) | 0];
      this.sampleSpawns.push(this._cellToWorld(c.x, c.z).setY(0));
    }

    // Расходники
    this.lootSpawns = { battery: [], medkit: [], flashbang: [], artifact: [] };
    const pick = (n, minDist) => {
      const out = [];
      let g = 0;
      while (out.length < n && g++ < 300) {
        const c = this.floorCells[(Math.random() * this.floorCells.length) | 0];
        const p = this._cellToWorld(c.x, c.z);
        if (p.distanceTo(this.spawn) < minDist) continue;
        if (this.sampleSpawns.some((s) => s.distanceTo(p) < CELL)) continue;
        if (out.some((s) => s.distanceTo(p) < CELL * 2)) continue;
        out.push(p.setY(0));
      }
      return out;
    };
    this.lootSpawns.battery = pick(5, CELL * 3);
    this.lootSpawns.medkit = pick(3, CELL * 4);
    this.lootSpawns.flashbang = pick(3, CELL * 4);
    this.lootSpawns.artifact = pick(2, CELL * 7);

    // Монстр — максимально далеко от спавна
    let far = this.floorCells[0];
    let farD = -1;
    for (const c of this.floorCells) {
      const d = dists.get(key(c.x, c.z)) || 0;
      if (d > farD) { farD = d; far = c; }
    }
    this.monsterSpawn = this._cellToWorld(far.x, far.z).setY(0);

    return this;
  }

  /* ─────────────── Геометрия ─────────────── */

  _bakeGeometry(roomCenters) {
    const { cols: W, rows: H, grid } = this;
    const concrete = concreteTexture(1);
    const floorTex = floorTexture(Math.max(6, W * 0.7));
    const ceilTex = ceilingTexture(Math.max(6, W * 0.7));
    const metal = metalTexture(1);

    // Пол и потолок — по одной плоскости
    const planW = W * CELL;
    const planD = H * CELL;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(planW, planD),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0.08, color: 0x9aa2a8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(planW / 2 - CELL / 2, 0, planD / 2 - CELL / 2);
    floor.receiveShadow = true;
    this.group.add(floor);

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(planW, planD),
      new THREE.MeshStandardMaterial({ map: ceilTex, roughness: 0.95, metalness: 0.05, color: 0x6a7278 })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(planW / 2 - CELL / 2, WALL_H, planD / 2 - CELL / 2);
    this.group.add(ceil);

    // Сены — слитая геометрия (1 draw call)
    const wallGeos = [];
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < H; z++) {
        if (grid[x][z] !== 1) continue;
        // Ставим блок только если соседом есть пол (или граница с полом)
        let touchesFloor = x === 0 || z === 0 || x === W - 1 || z === H - 1;
        for (const d of DIRS) {
          const nx = x + d.dx, nz = z + d.dz;
          if (nx >= 0 && nz >= 0 && nx < W && nz < H && grid[nx][nz] === 0) touchesFloor = true;
        }
        if (!touchesFloor) continue;
        const geo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
        const pos = this._cellToWorld(x, z);
        geo.translate(pos.x, WALL_H / 2, pos.z);
        wallGeos.push(geo);
        this.colliders.push({
          minX: pos.x - CELL / 2, maxX: pos.x + CELL / 2,
          minZ: pos.z - CELL / 2, maxZ: pos.z + CELL / 2,
        });
      }
    }
    const merged = mergeGeometries(wallGeos, false);
    for (const g of wallGeos) g.dispose();
    const wallMesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
      map: concrete, roughness: 0.94, metalness: 0.06, color: 0x8f979e,
    }));
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    this.group.add(wallMesh);

    // Координаты свободных клеток
    this.floorCells = [];
    for (let x = 0; x < W; x++) {
      for (let z = 0; z < H; z++) {
        if (grid[x][z] === 0) this.floorCells.push({ x, z });
      }
    }

    // Служебные поля
    this._metalTex = metal;
    this._roomCenters = roomCenters;
  }

  _placeLights(roomCenters) {
    const fixtureGeo = new THREE.BoxGeometry(0.9, 0.12, 0.34);
    const emissiveMat = new THREE.MeshStandardMaterial({
      color: 0x222831, emissive: 0x8fb8d8, emissiveIntensity: 1.6, roughness: 0.5,
    });
    const redMat = new THREE.MeshStandardMaterial({
      color: 0x241214, emissive: 0xd8442c, emissiveIntensity: 1.8, roughness: 0.5,
    });

    const points = [];
    for (const r of roomCenters) points.push({ x: r.x, z: r.z });
    // Дополнительные светильники в коридорах
    for (let i = 0; i < 14; i++) {
      const c = this.floorCells[(Math.random() * this.floorCells.length) | 0];
      points.push(c);
    }

    let count = 0;
    for (const p of points) {
      if (count >= 16) break;                       // лимит динамических источников
      const pos = this._cellToWorld(p.x, p.z);
      const isRed = Math.random() < 0.22;
      const fix = new THREE.Mesh(fixtureGeo, isRed ? redMat : emissiveMat);
      fix.position.set(pos.x, WALL_H - 0.18, pos.z);
      fix.rotation.y = Math.random() * Math.PI;
      this.group.add(fix);

      const light = new THREE.PointLight(
        isRed ? 0xd85438 : 0x9cc4e8,
        isRed ? 3.2 : 5.2,
        isRed ? 9 : 12,
        2
      );
      light.position.set(pos.x, WALL_H - 0.55, pos.z);
      this.group.add(light);

      const flicker = Math.random() < 0.34 ? 0.25 + Math.random() * 0.6 : 0;
      this.lightFixtures.push({ light, base: light.intensity, flicker, phase: Math.random() * 10 });
      count++;
    }
  }

  _placeProps(roomCenters) {
    const metal = this._metalTex;

    // Ящики — InstancedMesh
    const crateGeo = new THREE.BoxGeometry(1.15, 1.15, 1.15);
    const crateMat = new THREE.MeshStandardMaterial({ map: metal, roughness: 0.8, metalness: 0.35, color: 0x8892a0 });
    const crateCount = 26;
    const crates = new THREE.InstancedMesh(crateGeo, crateMat, crateCount);
    crates.castShadow = true;
    crates.receiveShadow = true;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < crateCount; i++) {
      const r = roomCenters[(Math.random() * roomCenters.length) | 0];
      const off = 1 + Math.random() * (Math.min(r.w, r.h) * CELL * 0.32);
      const ang = Math.random() * Math.PI * 2;
      const pos = this._cellToWorld(r.x, r.z);
      pos.x += Math.cos(ang) * off;
      pos.z += Math.sin(ang) * off;
      const s = 0.75 + Math.random() * 0.55;
      sc.set(s, s, s);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
      m4.compose(pos.setY(0.575 * s), q, sc);
      crates.setMatrixAt(i, m4);
      // Коллизия
      const half = 0.575 * s;
      this.colliders.push({
        minX: pos.x - half, maxX: pos.x + half,
        minZ: pos.z - half, maxZ: pos.z + half,
      });
    }
    crates.instanceMatrix.needsUpdate = true;
    this.group.add(crates);

    // Колонны в комнатах
    const pillarGeo = new THREE.CylinderGeometry(0.34, 0.42, WALL_H, 8);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x565e66, roughness: 0.9, metalness: 0.15 });
    for (const r of roomCenters) {
      if (Math.random() > 0.6) continue;
      const pos = this._cellToWorld(r.x, r.z);
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(pos.x, WALL_H / 2, pos.z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.group.add(pillar);
      this.colliders.push({
        minX: pos.x - 0.45, maxX: pos.x + 0.45,
        minZ: pos.z - 0.45, maxZ: pos.z + 0.45,
      });
    }

    // Трубы под потолком вдоль случайных коридоров
    const pipeGeo = new THREE.CylinderGeometry(0.12, 0.12, CELL * 2.2, 6);
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x3a424c, roughness: 0.7, metalness: 0.55 });
    const pipes = new THREE.InstancedMesh(pipeGeo, pipeMat, 18);
    for (let i = 0; i < 18; i++) {
      const c = this.floorCells[(Math.random() * this.floorCells.length) | 0];
      const pos = this._cellToWorld(c.x, c.z);
      const horizontal = Math.random() < 0.5;
      q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      if (!horizontal) {
        const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
        q.multiply(q2);
      }
      sc.set(1, 1, 1);
      m4.compose(pos.setY(WALL_H - 0.42 - Math.random() * 0.3), q, sc);
      pipes.setMatrixAt(i, m4);
    }
    pipes.instanceMatrix.needsUpdate = true;
    this.group.add(pipes);
  }

  /* ─────────────── Утилиты ─────────────── */

  _cellToWorld(x, z) {
    return new THREE.Vector3(x * CELL, 0, z * CELL);
  }

  worldToCell(v) {
    return {
      x: Math.round(v.x / CELL),
      z: Math.round(v.z / CELL),
    };
  }

  isWalkable(cx, cz) {
    return cx >= 0 && cz >= 0 && cx < this.cols && cz < this.rows && this.grid[cx][cz] === 0;
  }

  _bfsDistances(sx, sz) {
    const dist = new Map();
    dist.set(key(sx, sz), 0);
    const q = [[sx, sz]];
    while (q.length) {
      const [x, z] = q.shift();
      const d = dist.get(key(x, z));
      for (const dir of DIRS) {
        const nx = x + dir.dx, nz = z + dir.dz;
        if (this.isWalkable(nx, nz) && !dist.has(key(nx, nz))) {
          dist.set(key(nx, nz), d + 1);
          q.push([nx, nz]);
        }
      }
    }
    return dist;
  }

  /** BFS-путь между мировыми точками (массив Vector3). */
  findPath(from, to) {
    const a = this.worldToCell(from);
    const b = this.worldToCell(to);
    if (!this.isWalkable(a.x, a.z) || !this.isWalkable(b.x, b.z)) return null;
    const prev = new Map();
    const q = [[a.x, a.z]];
    prev.set(key(a.x, a.z), null);
    while (q.length) {
      const [x, z] = q.shift();
      if (x === b.x && z === b.z) break;
      for (const dir of DIRS) {
        const nx = x + dir.dx, nz = z + dir.dz;
        if (this.isWalkable(nx, nz) && !prev.has(key(nx, nz))) {
          prev.set(key(nx, nz), [x, z]);
          q.push([nx, nz]);
        }
      }
    }
    if (!prev.has(key(b.x, b.z))) return null;
    const path = [];
    let cur = [b.x, b.z];
    while (cur) {
      path.push(this._cellToWorld(cur[0], cur[1]).setY(0));
      cur = prev.get(key(cur[0], cur[1]));
    }
    path.reverse();
    return path;
  }

  /** Разрешение коллизий круга (игрока) о AABB-стены. */
  resolveCollision(pos, radius) {
    for (const c of this.colliders) {
      const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - nx;
      const dz = pos.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        const d = Math.sqrt(d2) || 0.0001;
        const push = radius - d;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
      }
    }
  }

  /** Ближайший свободный путь «наружу» из стены (страховка спавна). */
  clampToFloor(pos) {
    const c = this.worldToCell(pos);
    if (this.isWalkable(c.x, c.z)) return pos;
    for (let r = 1; r < 8; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (this.isWalkable(c.x + dx, c.z + dz)) {
            const p = this._cellToWorld(c.x + dx, c.z + dz);
            pos.x = p.x; pos.z = p.z;
            return pos;
          }
        }
      }
    }
    return pos;
  }

  update(dt, time) {
    for (const f of this.lightFixtures) {
      if (f.flicker > 0) {
        const n = Math.sin(time * 17 + f.phase) * Math.sin(time * 5.3 + f.phase * 2);
        const cut = n > 0.55 ? f.flicker : 0;
        f.light.intensity = f.base * (1 - cut) * (0.92 + 0.08 * Math.sin(time * 2 + f.phase));
      }
    }
  }

  dispose() {
    this.group.traverse((obj) => {
      if (obj.isInstancedMesh) obj.dispose();
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
  }
}
