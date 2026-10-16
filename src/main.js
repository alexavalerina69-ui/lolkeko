/**
 * РАЗЛОМ · RIFT PROTOCOL — точка входа.
 * Хоррор-экстракшн вертикаль: база «Ковчег», заход в Зону, «Слепой», эвакуация.
 */
import * as THREE from 'three';
import { AudioEngine } from './core/audio.js';
import { Input } from './core/input.js';
import { loadSave, writeSave } from './core/save.js';
import { World } from './game/world.js';
import { Player } from './game/player.js';
import { Blind } from './game/monster.js';
import { LootManager, LOOT_TYPES } from './game/loot.js';
import { Effects } from './game/effects.js';
import { HUD } from './game/hud.js';
import { UI } from './ui/ui.js';

/* ═══════════ Ошибка ═══════════ */
function fatal(msg) {
  const el = document.getElementById('fatal-error');
  el.textContent = 'КРИТИЧЕСКАЯ ОШИБКА:\n' + msg;
  el.classList.remove('hidden');
}
window.addEventListener('error', (e) => fatal(e.message + '\n' + (e.filename || '')));

/* ═══════════ Сохранение и настройки ═══════════ */
const save = loadSave();

/* ═══════════ Рендерер ═══════════ */
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 70);
camera.position.set(0, 2, 0);

const baseScene = new THREE.Scene();
baseScene.background = new THREE.Color(0x06090c);
baseScene.fog = new THREE.FogExp2(0x06090c, 0.12);
baseScene.add(new THREE.AmbientLight(0x223344, 0.5));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ═══════════ Подсистемы ═══════════ */
const audio = new AudioEngine();
const input = new Input(canvas);
const hud = new HUD();
const ui = new UI(audio);

input.sensitivity = save.settings.sensitivity / 100;
input.invertY = save.settings.invertY;
audio.volume = save.settings.volume / 100;
ui.applySettings(save.settings);

// Звук стартует по первому жесту
const startAudio = () => {
  audio.init();
  audio.setVolume(save.settings.volume / 100);
};
document.addEventListener('pointerdown', startAudio, { once: true });
document.addEventListener('keydown', startAudio, { once: true });

/* ═══════════ Состояние игры ═══════════ */
const state = {
  mode: 'menu',            // menu | base | raid | paused | results
  difficulty: 'normal',
  scene: baseScene,
  world: null,
  player: null,
  monster: null,
  loot: null,
  effects: null,
  raidTime: 0,
  samplesTotal: 3,
  samplesTaken: 0,
  artifactsTaken: 0,
  surge: false,
  monsterAlerted: false,
  extracted: false,
};

const DIFF = {
  normal: { speed: 1, sense: 1, reward: 1, label: 'СТАНДАРТ' },
  deep: { speed: 1.18, sense: 1.35, reward: 1.6, label: 'ГЛУБИНА' },
};

function xpToLevel(xp) {
  return 1 + Math.floor(xp / 500);
}

/* ═══════════ Профиль ═══════════ */
function refreshProfileUI() {
  save.profile.level = xpToLevel(save.profile.xp);
  ui.setProfileLine(
    `ОПЕРАТИВНИК #${save.profile.stats.raids + 1} · УР. ${save.profile.level} · КРЕДИТЫ ${save.profile.credits}`
  );
}
refreshProfileUI();

/* ═══════════ РЕЙД ═══════════ */
function startRaid(difficulty) {
  cleanupRaid();

  state.difficulty = difficulty;
  const diff = DIFF[difficulty];

  // Сцена Зоны
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060a);
  scene.fog = new THREE.FogExp2(0x04060a, 0.052);
  scene.add(new THREE.AmbientLight(0x2a3644, 0.34));
  scene.add(new THREE.HemisphereLight(0x2c3c4a, 0x080a0c, 0.32));

  const world = new World().generate(21, 21);
  scene.add(world.group);

  const player = new Player(camera, world, save.profile.upgrades);
  player.addToScene(scene);

  const monster = new Blind(world, { speedScale: diff.speed, senseScale: diff.sense });
  monster.addToScene(scene);

  const loot = new LootManager(scene, world);
  loot.populate();

  const effects = new Effects(scene, camera);

  /* — Связки событий — */
  player.onFootstep = (info) => audio.footstep(info);
  player.onNoise = (ev) => monster.hearNoise(ev);
  player.onHurt = () => effects.damageFlash();
  player.onDeath = () => endRaid('death');

  monster.onPing = () => audio.echolocation();
  monster.onGrowl = () => audio.monsterGrowl();
  monster.onScream = () => audio.monsterScream();
  monster.onAttack = () => {
    player.takeDamage(32);
    audio.hurt();
    effects.damageFlash();
    // Отбрасывание
    const away = new THREE.Vector3().subVectors(player.pos, monster.pos).setY(0).normalize();
    player.pos.addScaledVector(away, 1.35);
    world.resolveCollision(player.pos, 0.42);
  };

  effects.onWhisper = () => audio.whisper();

  Object.assign(state, {
    mode: 'raid',
    scene,
    world,
    player,
    monster,
    loot,
    effects,
    raidTime: 0,
    samplesTaken: 0,
    artifactsTaken: 0,
    surge: false,
    monsterAlerted: false,
    extracted: false,
  });

  hud.show();
  ui.show('hud');
  audio.startAmbience();
  input.requestLock();
}

function cleanupRaid() {
  if (state.loot) state.loot.dispose();
  if (state.effects) state.effects.dispose();
  if (state.world) state.world.dispose();
  if (state.player) state.player.dispose();
  if (state.monster && state.monster.model) {
    state.scene.remove(state.monster.model);
    state.monster.model.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
  audio.stopAmbience();
  state.world = null;
  state.player = null;
  state.monster = null;
  state.loot = null;
  state.effects = null;
  state.scene = baseScene;
}

function endRaid(reason) {
  if (state.mode !== 'raid' && state.mode !== 'paused') return;

  const diff = DIFF[state.difficulty];
  const player = state.player;
  const survived = reason === 'extract';
  state.extracted = survived;

  // Экономика
  const sampleValue = state.samplesTaken * 120;
  const artifactValue = state.artifactsTaken * 250;
  const timeBonus = survived && state.raidTime < 360 ? 200 : 0;
  const levelBonus = save.profile.level * 20;
  let credits = Math.round((sampleValue + artifactValue + timeBonus + levelBonus) * diff.reward);
  let xp = state.samplesTaken * 40 + state.artifactsTaken * 80 + (survived ? 120 : 30);

  if (!survived) {
    const keep = 0.1 + 0.1 * (save.profile.upgrades.insurance || 0);
    credits = Math.round(credits * keep);
    xp = Math.round(xp * 0.5);
    save.profile.stats.deaths++;
  } else {
    save.profile.stats.extracts++;
  }

  save.profile.credits += credits;
  save.profile.xp += xp;
  save.profile.level = xpToLevel(save.profile.xp);
  save.profile.stats.raids++;
  save.profile.stats.samples += state.samplesTaken;
  save.profile.stats.artifacts += state.artifactsTaken;
  if (state.monsterAlerted) save.profile.stats.observations++;
  writeSave(save);

  // Экран результатов
  input.releaseLock();
  hud.hide();
  cleanupRaid();

  const cells = [
    { label: 'ОБРАЗЦЫ', value: `${state.samplesTaken} / ${state.samplesTotal}` },
    { label: 'АРТЕФАКТЫ', value: state.artifactsTaken },
    { label: 'КРЕДИТЫ', value: `+${credits}` },
    { label: 'ОПЫТ', value: `+${xp}` },
    {
      label: 'ВРЕМЯ В ЗОНЕ',
      value: `${Math.floor(state.raidTime / 60)}:${String(Math.floor(state.raidTime % 60)).padStart(2, '0')}`,
    },
    { label: 'НАБЛЮДЕНИЯ', value: save.profile.stats.observations, bad: false },
  ];

  state.mode = 'results';
  ui.show('base');
  ui.renderBase(save.profile);
  refreshProfileUI();
  ui.showResults({
    title: survived ? 'ЭВАКУАЦИЯ УСПЕШНА' : 'ОПЕРАТИВНИК ПОТЕРЯН',
    sub: survived
      ? `${diff.label} · ОБРАЗЦЫ ДОСТАВЛЕНЫ · ШЛЮЗ ЗАКРЫТ`
      : `${diff.label} · СИГНАЛ ПОТЕРЯН · СНАРЯЖЕНИЕ НЕ ВОЗВРАЩЕНО`,
    cells,
  });
}

/* ═══════════ Ввод в рейде ═══════════ */
function handleRaidInput() {
  const player = state.player;
  if (!player || !player.alive) return;

  // Фонарь
  if (input.wasPressed('KeyF')) {
    if (player.battery > 0) {
      player.flashlightOn = !player.flashlightOn;
      audio.flashlightClick();
    }
  }

  // Предметы
  if (input.wasPressed('Digit1') || input.wasPressed('Numpad1')) {
    if (player.useMedkit()) audio.medkit();
    else audio.uiDeny();
  }
  if (input.wasPressed('Digit2') || input.wasPressed('Numpad2')) {
    if (player.useBattery()) audio.batteryIn();
    else audio.uiDeny();
  }
  if (input.wasPressed('Digit3') || input.wasPressed('Numpad3')) {
    if (player.useFlashbang()) {
      audio.flashbang();
      const d = state.monster.distanceTo(player.pos);
      if (d < 12) state.monster.stun(7);
    } else audio.uiDeny();
  }

  // Взаимодействие
  if (input.wasPressed('KeyE')) {
    const item = state.loot.nearest(player.pos);
    if (item) {
      const type = state.loot.take(item);
      audio.pickup();
      if (type === 'sample') state.samplesTaken++;
      if (type === 'artifact') state.artifactsTaken++;
      if (type === 'battery') {
        player.items.battery = Math.min(4, player.items.battery + 1);
      }
      if (type === 'medkit') {
        player.items.medkit = Math.min(4, player.items.medkit + 1);
      }
      if (type === 'flashbang') {
        player.items.flashbang = Math.min(4, player.items.flashbang + 1);
      }
    } else if (player.pos.distanceTo(state.world.exitZone.pos) < state.world.exitZone.radius + 1) {
      if (state.samplesTaken >= state.samplesTotal) {
        audio.extractHum();
        endRaid('extract');
      } else {
        audio.uiDeny();
      }
    }
  }
}

/* ═══════════ Игровой цикл ═══════════ */
const clock = new THREE.Clock();
let elapsed = 0;

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  if (state.mode === 'raid' && state.player) {
    const { player, monster, loot, world, effects } = state;
    const diff = DIFF[state.difficulty];

    // Пауза по Esc (выход из pointer lock)
    if (input.wasPressed('Escape')) {
      // браузер сам выходит из lock; событие pointerlockchange откроет паузу
    }

    handleRaidInput();

    // Камера мышью
    const { dx, dy } = input.consumeMouse();
    if (dx || dy) player.applyLook(dx, dy, input.sensitivity);

    player.update(dt, input);
    monster.update(dt, player, elapsed);
    loot.update(dt);
    world.update(dt, elapsed);
    effects.update(dt, player, monster);

    // Психика от близости монстра
    const dMon = monster.distanceTo(player.pos);
    if (dMon < 12 && player.alive) {
      player.drainPsyche((12 - dMon) * 0.24 * dt * (monster.state === 'chase' ? 1.7 : 1));
      if (monster.state === 'chase') state.monsterAlerted = true;
    }

    // Сердце
    audio.updateHeartbeat(dt, player.stressLevel(dMon));

    // Всплеск активности (7-я минута)
    if (!state.surge && state.raidTime > 420) {
      state.surge = true;
      monster.speedScale = diff.speed * 1.16;
      audio.setAmbienceIntensity(1);
      audio.surgeAlarm();
    }

    state.raidTime += dt;

    // Подсказки
    let prompt = null;
    const item = loot.nearest(player.pos);
    if (item) {
      prompt = LOOT_TYPES[item.type].prompt;
    } else if (player.pos.distanceTo(world.exitZone.pos) < world.exitZone.radius + 1) {
      prompt = state.samplesTaken >= state.samplesTotal
        ? 'активировать шлюз эвакуации'
        : `шлюз заблокирован — образцы ${state.samplesTaken}/${state.samplesTotal}`;
    }

    hud.update(player, {
      samplesTaken: state.samplesTaken,
      samplesTotal: state.samplesTotal,
      time: state.raidTime,
      extractionReady: state.samplesTaken >= state.samplesTotal,
      nearbyPrompt: prompt,
      surge: state.surge,
    });

    renderer.render(state.scene, camera);
    input.endFrame();
    return;
  }

  // Меню/база: лёгкая анимация сцены-заглушки
  camera.position.set(Math.sin(elapsed * 0.05) * 2, 2 + Math.sin(elapsed * 0.11) * 0.3, Math.cos(elapsed * 0.05) * 2);
  camera.lookAt(0, 1.5, 0);
  if (state.mode !== 'paused') {
    renderer.render(state.scene, camera);
  }
  input.endFrame();
}

/* ═══════════ Связки UI ═══════════ */
ui.on('play', () => {
  startRaid(state.difficulty);
});
ui.on('openBase', () => {
  state.mode = 'base';
  ui.renderBase(save.profile);
  ui.show('base');
});
ui.on('backToMenu', () => {
  state.mode = 'menu';
  ui.show('menu');
  refreshProfileUI();
});
ui.on('launch', (diff) => {
  startRaid(diff);
});
ui.on('resume', () => {
  ui.hideOverlay('pause');
  state.mode = 'raid';
  input.requestLock();
});
ui.on('abandon', () => {
  ui.hideOverlay('pause');
  endRaid('death');
});
ui.on('resultsContinue', () => {
  state.mode = 'base';
  ui.renderBase(save.profile);
  ui.show('base');
  refreshProfileUI();
});
ui.on('buyUpgrade', (id) => {
  const up = (save.profile.upgrades[id] || 0);
  const costs = { battery: 300, stamina: 280, psyche: 340, medkit: 260, insurance: 300 };
  const maxes = { battery: 5, stamina: 5, psyche: 5, medkit: 3, insurance: 5 };
  const cost = costs[id] * (up + 1);
  if (up >= maxes[id]) { audio.uiDeny(); return; }
  if (save.profile.credits < cost) { audio.uiDeny(); return; }
  save.profile.credits -= cost;
  save.profile.upgrades[id] = up + 1;
  writeSave(save);
  ui.renderBase(save.profile);
  refreshProfileUI();
});
ui.on('settingsChange', (s) => {
  save.settings = s;
  input.sensitivity = s.sensitivity / 100;
  input.invertY = s.invertY;
  audio.setVolume(s.volume / 100);
  writeSave(save);
});

// Пауза при потере pointer lock во время рейда
input.onPointerLockChange = (locked) => {
  if (!locked && state.mode === 'raid') {
    state.mode = 'paused';
    ui.showOverlay('pause');
  }
};
input.onCanvasClick = () => {
  if (state.mode === 'raid') input.requestLock();
};

// Старт
ui.show('menu');
tick();
