/**
 * Смоук-тест генерации мира: связность, пути, лут, спавны.
 * Запуск: npm test
 */

// ── Минимальные заглушки DOM для canvas-текстур ──
const ctxStub = {
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  putImageData: () => {},
  createRadialGradient: () => ({ addColorStop: () => {} }),
  fillRect: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  stroke: () => {},
  fill: () => {},
  ellipse: () => {},
  closePath: () => {},
  quadraticCurveTo: () => {},
  fillText: () => {},
  set strokeStyle(v) {}, set fillStyle(v) {}, set lineWidth(v) {},
  set globalAlpha(v) {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {},
};
globalThis.document = {
  createElement: () => ({
    width: 0, height: 0,
    getContext: () => ctxStub,
  }),
  addEventListener: () => {},
  getElementById: () => null,
};
globalThis.window = { addEventListener: () => {}, AudioContext: null, webkitAudioContext: null };

const { World, CELL } = await import('../src/game/world.js');

function assert(cond, msg) {
  if (!cond) {
    console.error('✗ FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

let allSamples = 0;
const ITER = 25;
for (let i = 0; i < ITER; i++) {
  const world = new World().generate(21, 21);

  assert(world.grid.length === 21 && world.grid[0].length === 21, 'размер сетки 21×21');
  assert(world.floorCells.length > 120, `достаточно свободных клеток (${world.floorCells.length})`);
  assert(world.colliders.length > 40, `есть коллизии (${world.colliders.length})`);
  assert(world.sampleSpawns.length === 3, 'ровно 3 образца');
  assert(world.lootSpawns.battery.length >= 3, 'хватает АКБ');
  assert(world.monsterSpawn, 'спавн монстра существует');

  // Спавн и все точки — на проходимых клетках
  const points = [
    world.spawn,
    world.monsterSpawn,
    ...world.sampleSpawns,
    ...world.lootSpawns.battery,
    ...world.lootSpawns.medkit,
    ...world.lootSpawns.flashbang,
    ...world.lootSpawns.artifact,
  ];
  for (const p of points) {
    const c = world.worldToCell(p);
    assert(world.isWalkable(c.x, c.z), `точка на проходимой клетке (${c.x},${c.z})`);
  }

  // Пути BFS существуют до всех образцов и до монстра
  for (const s of world.sampleSpawns) {
    const path = world.findPath(world.spawn, s);
    assert(path && path.length > 1, 'путь до образца найден');
  }
  const mp = world.findPath(world.spawn, world.monsterSpawn);
  assert(mp && mp.length > 5, 'путь до монстра длинный');

  // Образцы врозь
  const [a, b, c] = world.sampleSpawns;
  assert(a.distanceTo(b) > CELL * 3, 'образцы разнесены (1-2)');
  assert(b.distanceTo(c) > CELL * 3, 'образцы разнесены (2-3)');
  assert(a.distanceTo(c) > CELL * 3, 'образцы разнесены (1-3)');

  allSamples += world.sampleSpawns.length;
}

console.log(`✓ Генерация мира: ${ITER} итераций OK (образцов: ${allSamples})`);
console.log('✓ Все проверки пройдены');
