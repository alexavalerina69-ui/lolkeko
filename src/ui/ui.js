/**
 * РАЗЛОМ · UI: меню, база «Ковчег», оверлеи.
 */

export const UPGRADES = [
  { id: 'battery', name: 'ЁМКОСТЬ АКБ', desc: '+20 к заряду фонаря', max: 5, cost: (l) => 300 * (l + 1) },
  { id: 'stamina', name: 'ВЫНОСЛИВОСТЬ', desc: '+15 к выносливости', max: 5, cost: (l) => 280 * (l + 1) },
  { id: 'psyche', name: 'ПСИХ. УСТОЙЧИВОСТЬ', desc: '−10% к деградации психики', max: 5, cost: (l) => 340 * (l + 1) },
  { id: 'medkit', name: 'АПТЕЧКА+', desc: '+15 к лечению', max: 3, cost: (l) => 260 * (l + 1) },
  { id: 'insurance', name: 'СТРАХОВКА', desc: '+10% кредитов при смерти', max: 5, cost: (l) => 300 * (l + 1) },
];

export const RADIO_MESSAGES = [
  { need: 0, time: 'ЦИКЛ 0 · 03:14', text: '«Ковчег» принял тебя, оперативник. Зона спит — но это временно. Собери образцы, выходи к шлюзу. Не задерживайся.' },
  { need: 1, time: 'ЦИКЛ 1 · 22:07', text: 'Разведка докладывает: «Слепой» не видит свет. Он слышит дыхание, шаги, крик. Бег для него — как сирена. Приседай. Дыши тише.' },
  { need: 2, time: 'ЦИКЛ 2 · 04:41', text: 'Образцы содержат связанные структуры. Институт платит за каждый. Предупреждение: артефакты «привязываются». Эвакуируйся сразу после изъятия.' },
  { need: 3, time: 'ЦИКЛ 3 · 01:56', text: 'Голосовой перехват: «...он запоминает громких...». Уточняю: сущность учится. Сегодня ты громко — завтра он ждёт именно тебя.' },
  { need: 5, time: 'ЦИКЛ 5 · 19:23', text: 'Сигнал 44.7 МГц — не помеха. Кто-то дышит в радиомикрофон ровно так, как дышишь ты. Мы отключили передатчик. Он продолжает.' },
  { need: 8, time: 'ЦИКЛ 8 · 23:58', text: 'Файл «СТАТИК» повреждён повторно. Кто-то внутри «Ковчега» не хочет, чтобы ты его прочитал. Береги психику — галлюцинации врут, но иногда и нет.' },
  { need: 12, time: 'ЦИКЛ 12 · 00:00', text: 'Ты собрал достаточно. Координаты ГЛУБИНЫ зашифрованы в последнем образце. Ответь на вопрос: если Зона показывает разные миры — какой из них настоящий?' },
];

export const DOSSIER = [
  {
    need: 5,
    tier: 'ДОСЬЕ: БАЗОВЫЙ ФАЙЛ',
    text: '«Слепой» — гуманоидный хищник зоны отчуждения. Зрение отсутствует. Эхолокация: периодические импульсы в диапазоне 2–3 кГц. Реагирует на шаги, спринт, удары. Крик провоцирует немедленную погоню.',
  },
  {
    need: 15,
    tier: 'ДОСЬЕ: ПОВЕДЕНИЕ',
    text: 'После потери цели переходит в режим «расследование»: проверяет последнюю известную позицию. Помнит «громких» — при повторном контакте реагирует быстрее. Оглушение светом работает, но адаптируется.',
  },
  {
    need: 30,
    tier: 'ДОСЬЕ: ПОЛНЫЙ ДОСТУП',
    text: 'Не убиваем известным оружием. Эвакуация — единственный протокол. Слабое место: тишина. Совершенная тишина. Отчёт агента «Ветка»: «Он уходит, если не слышит вас 40 секунд. Я слышал, как он уходил. Потом услышал, как возвращается».',
  },
];

export class UI {
  constructor(audio) {
    this.audio = audio;
    this.screens = {
      menu: document.getElementById('screen-menu'),
      base: document.getElementById('screen-base'),
      hud: document.getElementById('screen-hud'),
      pause: document.getElementById('screen-pause'),
      results: document.getElementById('screen-results'),
      settings: document.getElementById('screen-settings'),
      help: document.getElementById('screen-help'),
    };
    this.settingsReturnTo = 'menu';
    this.callbacks = {};
    this.difficulty = 'normal';

    this._bindMenu();
    this._bindSettings();
    this._bindHelp();
    this._bindBase();
    this._bindPause();
    this._bindResults();
    this._bindGlobalHotkeys();
    this._hoverSound();
  }

  on(name, fn) { this.callbacks[name] = fn; return this; }
  _emit(name, ...args) { if (this.callbacks[name]) this.callbacks[name](...args); }

  _click() { if (this.audio) this.audio.uiClick(); }

  _hoverSound() {
    document.querySelectorAll('button').forEach((b) => {
      b.addEventListener('mouseenter', () => { if (this.audio) this.audio.uiHover(); });
    });
  }

  /* ── Навигация ── */
  show(name) {
    for (const [key, el] of Object.entries(this.screens)) {
      if (!el) continue;
      el.classList.toggle('hidden', key !== name);
    }
  }

  showOverlay(name) {
    this.screens[name].classList.remove('hidden');
  }

  hideOverlay(name) {
    this.screens[name].classList.add('hidden');
  }

  /* ── Меню ── */
  _bindMenu() {
    document.getElementById('btn-play').addEventListener('click', () => {
      this._click();
      this._emit('play');
    });
    document.getElementById('btn-base').addEventListener('click', () => {
      this._click();
      this._emit('openBase');
    });
    document.getElementById('btn-settings').addEventListener('click', () => {
      this._click();
      this.settingsReturnTo = 'menu';
      this.showOverlay('settings');
    });
    document.getElementById('btn-help').addEventListener('click', () => {
      this._click();
      this.showOverlay('help');
    });
  }

  setProfileLine(text) {
    const el = document.getElementById('menu-profile');
    if (el) el.textContent = text;
  }

  /* ── Настройки ── */
  _bindSettings() {
    const vol = document.getElementById('set-volume');
    const sens = document.getElementById('set-sens');
    const iny = document.getElementById('set-inverty');
    this.settingInputs = { vol, sens, iny };

    vol.addEventListener('input', () => {
      document.getElementById('set-volume-val').textContent = vol.value;
      this._emit('settingsChange', this._readSettings());
    });
    sens.addEventListener('input', () => {
      document.getElementById('set-sens-val').textContent = (sens.value / 100).toFixed(2);
      this._emit('settingsChange', this._readSettings());
    });
    iny.addEventListener('change', () => {
      this._emit('settingsChange', this._readSettings());
    });
    document.getElementById('btn-settings-back').addEventListener('click', () => {
      this._click();
      this.hideOverlay('settings');
    });
  }

  _readSettings() {
    return {
      volume: Number(this.settingInputs.vol.value),
      sensitivity: Number(this.settingInputs.sens.value),
      invertY: this.settingInputs.iny.checked,
    };
  }

  applySettings(s) {
    this.settingInputs.vol.value = s.volume;
    this.settingInputs.sens.value = s.sensitivity;
    this.settingInputs.iny.checked = s.invertY;
    document.getElementById('set-volume-val').textContent = s.volume;
    document.getElementById('set-sens-val').textContent = (s.sensitivity / 100).toFixed(2);
  }

  /* ── Управление ── */
  _bindHelp() {
    document.getElementById('btn-help-back').addEventListener('click', () => {
      this._click();
      this.hideOverlay('help');
    });
  }

  /* ── База ── */
  _bindBase() {
    document.getElementById('btn-base-back').addEventListener('click', () => {
      this._click();
      this._emit('backToMenu');
    });
    document.getElementById('btn-launch').addEventListener('click', () => {
      this._click();
      this._emit('launch', this.difficulty);
    });
    document.querySelectorAll('.chip[data-diff]').forEach((chip) => {
      chip.addEventListener('click', () => {
        this._click();
        document.querySelectorAll('.chip[data-diff]').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        this.difficulty = chip.dataset.diff;
      });
    });
  }

  renderBase(profile) {
    document.getElementById('base-credits').textContent = profile.credits;
    document.getElementById('base-level').textContent = profile.level;
    document.getElementById('base-raids').textContent = profile.stats.raids;

    // Улучшения
    const list = document.getElementById('upgrade-list');
    list.innerHTML = '';
    for (const up of UPGRADES) {
      const lvl = profile.upgrades[up.id] || 0;
      const maxed = lvl >= up.max;
      const cost = up.cost(lvl);
      const row = document.createElement('div');
      row.className = 'upgrade-row';
      row.innerHTML = `
        <div class="upgrade-info">
          <strong>${up.name}</strong>
          <small>${up.desc}</small>
        </div>
        <div class="upgrade-pips">${Array.from({ length: up.max }, (_, i) =>
          `<span class="pip ${i < lvl ? 'on' : ''}"></span>`).join('')}</div>
        <button class="btn-buy ${maxed ? 'maxed' : ''}" ${maxed || profile.credits < cost ? 'disabled' : ''}>
          ${maxed ? 'МАКС.' : cost + ' ₽'}
        </button>`;
      const btn = row.querySelector('button');
      btn.addEventListener('click', () => {
        this._click();
        this._emit('buyUpgrade', up.id);
      });
      list.appendChild(row);
    }

    // Досье
    const obs = profile.stats.observations;
    const fill = document.getElementById('dossier-fill');
    const label = document.getElementById('dossier-progress-label');
    const tierEl = document.getElementById('dossier-tier');
    const textEl = document.getElementById('dossier-text');
    fill.style.width = `${Math.min(100, (obs / 30) * 100)}%`;
    label.textContent = `НАБЛЮДЕНИЯ: ${obs} / 30`;
    let tier = null;
    for (const d of DOSSIER) if (obs >= d.need) tier = d;
    if (tier) {
      tierEl.textContent = tier.tier;
      textEl.textContent = tier.text;
    } else {
      tierEl.textContent = 'ДОСЬЕ: НЕ ИЗУЧЕНО';
      textEl.textContent = 'Данные отсутствуют. Проведите наблюдения в Зоне, чтобы восстановить файл.';
    }

    // Радио
    const log = document.getElementById('radio-log');
    log.innerHTML = '';
    const unlocked = RADIO_MESSAGES.filter((m) => profile.stats.raids >= m.need);
    for (const m of unlocked.slice(-5).reverse()) {
      const div = document.createElement('div');
      div.className = 'radio-msg';
      div.innerHTML = `<span class="mono">${m.time}</span>${m.text}`;
      log.appendChild(div);
    }
    if (unlocked.length === 0) {
      log.innerHTML = '<div class="radio-msg locked"><span class="mono">НЕТ СИГНАЛОВ</span>Начните заход, чтобы активить радиорубку.</div>';
    }
  }

  /* ── Пауза ── */
  _bindPause() {
    document.getElementById('btn-resume').addEventListener('click', () => {
      this._click();
      this._emit('resume');
    });
    document.getElementById('btn-pause-settings').addEventListener('click', () => {
      this._click();
      this.showOverlay('settings');
    });
    document.getElementById('btn-abandon').addEventListener('click', () => {
      this._click();
      this._emit('abandon');
    });
  }

  /* ── Результаты ── */
  _bindResults() {
    document.getElementById('btn-results-continue').addEventListener('click', () => {
      this._click();
      this.hideOverlay('results');
      this._emit('resultsContinue');
    });
  }

  showResults({ title, sub, cells }) {
    document.getElementById('results-title').textContent = title;
    document.getElementById('results-sub').textContent = sub;
    const grid = document.getElementById('results-grid');
    grid.innerHTML = '';
    for (const c of cells) {
      const div = document.createElement('div');
      div.className = 'result-cell' + (c.bad ? ' bad' : '');
      div.innerHTML = `<span class="mono">${c.label}</span><strong>${c.value}</strong>`;
      grid.appendChild(div);
    }
    this.showOverlay('results');
  }

  /* ── Горячие клавиши ── */
  _bindGlobalHotkeys() {
    window.addEventListener('keydown', (e) => {
      if (!this.screens.menu.classList.contains('hidden')) {
        if (e.code === 'Enter' || e.code === 'NumpadEnter') document.getElementById('btn-play').click();
        if (e.code === 'KeyB') document.getElementById('btn-base').click();
        if (e.code === 'KeyS' && e.shiftKey) document.getElementById('btn-settings').click();
        if (e.code === 'KeyH') document.getElementById('btn-help').click();
      }
    });
  }
}
