/**
 * РАЗЛОМ · HUD рейда.
 */
export class HUD {
  constructor() {
    this.root = document.getElementById('screen-hud');
    this.barHp = document.getElementById('bar-hp');
    this.barPsy = document.getElementById('bar-psy');
    this.barSta = document.getElementById('bar-sta');
    this.barBat = document.getElementById('bar-bat');
    this.valHp = document.getElementById('val-hp');
    this.valPsy = document.getElementById('val-psy');
    this.valSta = document.getElementById('val-sta');
    this.valBat = document.getElementById('val-bat');
    this.objective = document.getElementById('hud-objective-text');
    this.timer = document.getElementById('hud-timer');
    this.status = document.getElementById('hud-status');
    this.prompt = document.getElementById('hud-prompt');
    this.promptText = document.getElementById('hud-prompt-text');
    this.noise = document.getElementById('hud-noise');
    this.cntMed = document.getElementById('cnt-med');
    this.cntBat = document.getElementById('cnt-bat');
    this.cntFla = document.getElementById('cnt-fla');
    this.slot1 = document.getElementById('slot-1');
    this.slot2 = document.getElementById('slot-2');
    this.slot3 = document.getElementById('slot-3');
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  update(player, { samplesTaken, samplesTotal, time, extractionReady, nearbyPrompt, surge }) {
    const pct = (v, max) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
    this.barHp.style.width = pct(player.hp, player.maxHp);
    this.barPsy.style.width = pct(player.psyche, player.maxPsyche);
    this.barSta.style.width = pct(player.stamina, player.maxStamina);
    this.barBat.style.width = pct(player.battery, player.maxBattery);
    this.valHp.textContent = Math.ceil(player.hp);
    this.valPsy.textContent = Math.ceil(player.psyche);
    this.valSta.textContent = Math.ceil(player.stamina);
    this.valBat.textContent = Math.ceil(player.battery);

    if (extractionReady) {
      this.objective.innerHTML = `Эвакуация активна: <b>вернуться к шлюзу</b>`;
    } else {
      this.objective.innerHTML = `Соберите образцы: <b>${samplesTaken} / ${samplesTotal}</b>`;
    }

    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    this.timer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    if (surge) {
      this.status.textContent = '⚠ ВСПЛЕСК АКТИВНОСТИ';
      this.status.className = 'hud-status mono danger';
    } else if (player.psyche < 35) {
      this.status.textContent = 'ПСИХИКА НЕСТАБИЛЬНА';
      this.status.className = 'hud-status mono warn-status';
    } else if (player.hp < 40) {
      this.status.textContent = 'КРИТИЧЕСКОЕ СОСТОЯНИЕ';
      this.status.className = 'hud-status mono danger';
    } else {
      this.status.textContent = 'СИГНАЛ СТАБИЛЕН';
      this.status.className = 'hud-status mono';
    }

    if (nearbyPrompt) {
      this.prompt.classList.remove('hidden');
      this.promptText.textContent = nearbyPrompt;
    } else {
      this.prompt.classList.add('hidden');
    }

    // Шум
    const level = Math.round(player.noiseLevel * 5);
    const blocks = '▁▂▃▄▅▆▇█';
    let txt = 'ШУМ ';
    for (let i = 0; i < 5; i++) {
      txt += blocks[Math.min(7, Math.max(0, level * 2 - i * 1.4 | 0))];
    }
    this.noise.textContent = txt;
    this.noise.classList.toggle('loud', player.noiseLevel > 0.7);

    // Слоты
    this.cntMed.textContent = player.items.medkit;
    this.cntBat.textContent = player.items.battery;
    this.cntFla.textContent = player.items.flashbang;
    this.slot1.classList.toggle('empty', player.items.medkit <= 0);
    this.slot2.classList.toggle('empty', player.items.battery <= 0);
    this.slot3.classList.toggle('empty', player.items.flashbang <= 0);
  }
}
