/**
 * Симуляция игровой логики без WebGL: физика игрока, ИИ «Слепого», боевка.
 * Запуск: node test/sim-test.mjs
 */

const ctxStub = {
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  putImageData: () => {},
  createRadialGradient: () => ({ addColorStop: () => {} }),
  fillRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
  stroke: () => {}, fill: () => {}, ellipse: () => {}, closePath: () => {},
  quadraticCurveTo: () => {}, fillText: () => {},
  set strokeStyle(v) {}, set fillStyle(v) {}, set lineWidth(v) {},
  set globalAlpha(v) {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {},
};
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }),
  addEventListener: () => {},
  getElementById: () => null,
};
globalThis.window = { addEventListener: () => {} };

const THREE = await import('three');
const { World } = await import('../src/game/world.js');
const { Player } = await import('../src/game/player.js');
const { Blind } = await import('../src/game/monster.js');

function assert(cond, msg) {
  if (!cond) {
    console.error('✗ FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
}

const idleInput = { isDown: () => false, wasPressed: () => false };
const inputOf = (...codes) => ({ isDown: (c) => codes.includes(c), wasPressed: () => false });

// ── 1. Игрок: движение, коллизии, статы ──
{
  const world = new World().generate(21, 21);
  const camera = new THREE.PerspectiveCamera();
  const player = new Player(camera, world, { stamina: 2, battery: 3, psyche: 5 });

  assert(player.maxStamina === 130, 'апгрейд выносливости применяется');
  assert(player.maxBattery === 160, 'апгрейд АКБ применяется');
  assert(player.psycheResist === 0.5, 'апгрейд психики применяется');

  let noiseEvents = 0;
  player.onNoise = () => noiseEvents++;
  player.onFootstep = () => {};

  const start = player.pos.clone();
  for (let i = 0; i < 300; i++) player.update(1 / 60, inputOf('KeyW', 'ShiftLeft'));
  assert(player.pos.distanceTo(start) > 2, 'игрок перемещается');
  assert(Number.isFinite(player.pos.x) && Number.isFinite(player.pos.z), 'координаты конечны');
  const cell = world.worldToCell(player.pos);
  assert(world.isWalkable(cell.x, cell.z), 'игрок не ушёл в стены');
  assert(noiseEvents > 0, 'шумовые события генерируются');
  assert(player.stamina < player.maxStamina, 'спринт тратит выносливость');

  // Урон и смерть
  let died = false;
  player.onDeath = () => { died = true; };
  player.takeDamage(50);
  assert(player.hp === 50, 'урон применяется');
  player.takeDamage(60);
  assert(died && !player.alive, 'смерть срабатывает');

  // Предметы
  const p2 = new Player(camera, world, {});
  assert(p2.useMedkit() === false, 'аптечка при полном ХП не тратится');
  p2.hp = 30;
  assert(p2.useMedkit() && p2.hp > 30, 'аптечка лечит');
  p2.battery = 10;
  assert(p2.useBattery() && p2.battery > 10, 'АКБ заряжает фонарь');
  assert(p2.useFlashbang(), 'вспышка используется');

  // Приседание шумит меньше бега
  const quiet = new Player(camera, world, {});
  let qNoise = null;
  quiet.onNoise = (ev) => { if (!qNoise) qNoise = ev; };
  quiet.onFootstep = () => {};
  for (let i = 0; i < 120; i++) quiet.update(1 / 60, inputOf('KeyC', 'KeyW'));
  assert(qNoise && qNoise.radius === 5 && !qNoise.loud, 'приседание: тихий шум радиусом 5');
}

// ── 2. «Слепой»: патруль, слух, погоня, оглушение ──
{
  const world = new World().generate(21, 21);
  const camera = new THREE.PerspectiveCamera();
  const player = new Player(camera, world, {});
  const monster = new Blind(world, { speedScale: 1, senseScale: 1 });

  let pings = 0;
  let attacks = 0;
  monster.onPing = () => pings++;
  monster.onAttack = () => { attacks++; player.takeDamage(32); };
  monster.onGrowl = () => {};
  monster.onScream = () => {};
  player.onFootstep = () => {};

  const spawnPos = monster.pos.clone();

  // Патруль 12 секунд
  for (let i = 0; i < 720; i++) {
    player.update(1 / 60, idleInput);
    monster.update(1 / 60, player, i / 60);
  }
  assert(monster.pos.distanceTo(spawnPos) > 1.5, 'монстр патрулирует (двигается)');
  assert(pings > 0, 'эхолокация работает');
  assert(['patrol', 'investigate', 'chase'].includes(monster.state), `состояние валидно (${monster.state})`);

  // Громкий шум рядом → обнаружение
  monster.state = 'patrol';
  monster.pos.copy(player.pos).add(new THREE.Vector3(6, 0, 0));
  monster.hearNoise({ pos: player.pos.clone(), radius: 17, loud: true });
  assert(monster.state === 'investigate' || monster.state === 'chase', 'слышит громкий шум');

  // Прямая близость → погоня и атаки
  monster.pos.copy(player.pos).add(new THREE.Vector3(1.2, 0, 0));
  const hpBefore = player.hp;
  for (let i = 0; i < 240; i++) {
    player.update(1 / 60, idleInput);
    monster.update(1 / 60, player, i / 60);
  }
  assert(monster.state === 'chase', 'погоня при близости');
  assert(attacks > 0, 'монстр атакует');
  assert(player.hp < hpBefore, 'игрок получает урон');

  // Оглушение
  monster.stun(7);
  assert(monster.state === 'stunned', 'оглушение работает');
  const stunnedPos = monster.pos.clone();
  for (let i = 0; i < 60; i++) monster.update(1 / 60, player, i / 60);
  assert(monster.pos.distanceTo(stunnedPos) < 0.2, 'оглушённый не двигается');
}

// ── 3. Тишина: приседание не выдаёт позицию на расстоянии ──
{
  const world = new World().generate(21, 21);
  const camera = new THREE.PerspectiveCamera();
  const player = new Player(camera, world, {});
  const monster = new Blind(world, {});

  // Тихий шум на расстоянии 8 м не будит монстра
  monster.pos.copy(player.pos).add(new THREE.Vector3(8, 0, 0));
  monster.hearNoise({ pos: player.pos.clone(), radius: 5, loud: false });
  assert(monster.state === 'patrol', 'тихий шум вне радиуса — монстр спокоен');

  // Громкий шум на той же дистанции — будит
  monster.hearNoise({ pos: player.pos.clone(), radius: 17, loud: true });
  assert(monster.state !== 'patrol', 'громкий шум в радиусе — монстр реагирует');
}

console.log('✓ Симуляция: физика игрока, ИИ монстра, боевка — OK');
console.log('✓ Все проверки пройдены');
