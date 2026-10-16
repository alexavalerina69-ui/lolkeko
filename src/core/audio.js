/**
 * РАЗЛОМ · Процедурный звуковой движок (WebAudio)
 * Все звуки синтезируются на лету — ноль внешних ассетов.
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.ambBus = null;
    this.ambNodes = [];
    this.heartTimer = 0;
    this.heartbeatInterval = 1.05;
    this.volume = 0.8;
  }

  /** Инициализация по первому жесту пользователя (политика автоплея). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);

    this.ambBus = this.ctx.createGain();
    this.ambBus.gain.value = 0.0;
    this.ambBus.connect(this.master);

    // Общий "пространственный" эхо-контур
    this.delay = this.ctx.createDelay(1.2);
    this.delay.delayTime.value = 0.34;
    this.delayFb = this.ctx.createGain();
    this.delayFb.gain.value = 0.38;
    this.delayWet = this.ctx.createGain();
    this.delayWet.gain.value = 0.32;
    this.delay.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delay.connect(this.delayWet);
    this.delayWet.connect(this.master);

    // Буфер белого шума (2 c)
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  /* ─────────────── Базовые примитивы ─────────────── */

  _noise({ dur = 0.2, gain = 0.3, type = 'lowpass', freq = 800, q = 1, bus = null, delay = false, attack = 0.002 }) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = dur > 1.9;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = this.ctx.createGain();
    const t0 = this.t;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0001), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(bus || this.sfxBus);
    if (delay) g.connect(this.delay);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  _tone({ freq = 220, dur = 0.2, gain = 0.2, type = 'sine', slide = 0, bus = null, delay = false, attack = 0.004 }) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    const g = this.ctx.createGain();
    const t0 = this.t;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide !== 0) osc.frequency.exponentialRampToValueAtTime(Math.max(freq + slide, 1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0001), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(bus || this.sfxBus);
    if (delay) g.connect(this.delay);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /* ─────────────── Атмосфера рейда ─────────────── */

  startAmbience() {
    if (!this.ctx) return;
    this.stopAmbience();
    const t0 = this.t;

    // Низкий дрон: две расстроенные пилы + саб
    for (const [f, type, gain] of [[41, 'sine', 0.16], [41.7, 'sawtooth', 0.05], [82, 'triangle', 0.045]]) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.05 + Math.random() * 0.06;
      const lfoG = this.ctx.createGain();
      lfoG.gain.value = gain * 0.55;
      lfo.connect(lfoG);
      lfoG.connect(g.gain);
      osc.connect(g);
      g.connect(this.ambBus);
      osc.start(t0); lfo.start(t0);
      this.ambNodes.push(osc, lfo);
    }

    // Дыхание здания: отфильтрованный шум с медленным LFO на фильтре
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 220;
    filt.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.value = 0.12;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.032;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 110;
    lfo.connect(lfoG);
    lfoG.connect(filt.frequency);
    src.connect(filt); filt.connect(g); g.connect(this.ambBus);
    src.start(t0); lfo.start(t0);
    this.ambNodes.push(src, lfo);

    // Случайные металлические скрипы/стуки
    this._ambCreakLoop();

    // Проявление амбиенса
    this.ambBus.gain.cancelScheduledValues(t0);
    this.ambBus.gain.setValueAtTime(0.0001, t0);
    this.ambBus.gain.exponentialRampToValueAtTime(0.9, t0 + 3);
  }

  _ambCreakLoop() {
    if (!this.ctx) return;
    this._creakTimeout = setTimeout(() => {
      if (!this.ctx) return;
      const r = Math.random();
      if (r < 0.4) {
        // металлический скрип
        this._tone({ freq: 70 + Math.random() * 140, dur: 0.7 + Math.random(), gain: 0.035, type: 'sawtooth', slide: -20, bus: this.ambBus, delay: true });
      } else if (r < 0.75) {
        // далёкий стук
        this._noise({ dur: 0.09, gain: 0.06, freq: 300 + Math.random() * 500, type: 'bandpass', q: 6, bus: this.ambBus, delay: true });
      } else {
        // оседание/гул
        this._noise({ dur: 1.6, gain: 0.05, freq: 90 + Math.random() * 70, q: 2, bus: this.ambBus, delay: true });
      }
      this._ambCreakLoop();
    }, 3800 + Math.random() * 6200);
  }

  stopAmbience() {
    if (this._creakTimeout) clearTimeout(this._creakTimeout);
    if (!this.ctx) return;
    const t0 = this.t;
    if (this.ambBus) {
      this.ambBus.gain.cancelScheduledValues(t0);
      this.ambBus.gain.setValueAtTime(this.ambBus.gain.value, t0);
      this.ambBus.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
    }
    const nodes = this.ambNodes;
    this.ambNodes = [];
    setTimeout(() => {
      for (const n of nodes) { try { n.stop(); } catch (_) { /* уже остановлен */ } }
    }, 1400);
  }

  /** Переключение напряжённости амбиенса (Всплеск). */
  setAmbienceIntensity(k) {
    if (!this.ctx || !this.ambBus) return;
    this.ambBus.gain.setTargetAtTime(0.7 + k * 0.55, this.t, 1.5);
  }

  /* ─────────────── Игровые события ─────────────── */

  footstep({ sprint = false, crouch = false } = {}) {
    const gain = crouch ? 0.055 : sprint ? 0.3 : 0.14;
    const freq = crouch ? 220 : sprint ? 420 : 320;
    this._noise({ dur: 0.08, gain, freq, type: 'bandpass', q: 1.2 });
    this._noise({ dur: 0.045, gain: gain * 0.7, freq: 1600 + Math.random() * 600, type: 'highpass', q: 0.8 });
  }

  flashlightClick() {
    this._tone({ freq: 1400, dur: 0.03, gain: 0.12, type: 'square' });
    this._tone({ freq: 700, dur: 0.05, gain: 0.07, type: 'triangle' });
  }

  pickup() {
    this._tone({ freq: 520, dur: 0.09, gain: 0.14, type: 'sine', slide: 240 });
    this._tone({ freq: 1040, dur: 0.14, gain: 0.08, type: 'sine', slide: 120 });
  }

  medkit() {
    this._tone({ freq: 340, dur: 0.22, gain: 0.13, type: 'triangle', slide: 180 });
    this._noise({ dur: 0.35, gain: 0.05, freq: 900, type: 'bandpass', q: 2 });
  }

  batteryIn() {
    this._tone({ freq: 180, dur: 0.16, gain: 0.14, type: 'square', slide: 320 });
    this._tone({ freq: 620, dur: 0.2, gain: 0.07, type: 'sine', slide: 140 });
  }

  flashbang() {
    this._noise({ dur: 0.14, gain: 0.55, freq: 2200, type: 'highpass' });
    this._tone({ freq: 3200, dur: 0.09, gain: 0.3, type: 'square', slide: -2600 });
    setTimeout(() => this._tone({ freq: 90, dur: 0.5, gain: 0.22, type: 'sine', slide: -40 }), 40);
    // звон в ушах
    this._tone({ freq: 4200, dur: 1.6, gain: 0.045, type: 'sine' });
  }

  hurt() {
    this._noise({ dur: 0.22, gain: 0.4, freq: 500, type: 'bandpass', q: 1.4 });
    this._tone({ freq: 120, dur: 0.28, gain: 0.32, type: 'sawtooth', slide: -60 });
    this._tone({ freq: 220, dur: 0.18, gain: 0.12, type: 'triangle', slide: -120 });
  }

  monsterGrowl() {
    const f = 55 + Math.random() * 25;
    this._tone({ freq: f, dur: 1.5 + Math.random(), gain: 0.2, type: 'sawtooth', slide: -f * 0.35, delay: true });
    this._tone({ freq: f * 1.5, dur: 1.1, gain: 0.1, type: 'square', slide: -30, delay: true });
    this._noise({ dur: 1.3, gain: 0.11, freq: 320, type: 'bandpass', q: 2.5, delay: true });
  }

  monsterScream() {
    this._tone({ freq: 880, dur: 0.7, gain: 0.3, type: 'sawtooth', slide: -700, delay: true });
    this._tone({ freq: 420, dur: 0.9, gain: 0.24, type: 'square', slide: -320, delay: true });
    this._noise({ dur: 0.8, gain: 0.22, freq: 1500, type: 'bandpass', q: 1.2, delay: true });
  }

  /** Эхолокационный щелчок «Слепого» (с эхом). */
  echolocation() {
    this._tone({ freq: 2100 + Math.random() * 500, dur: 0.045, gain: 0.16, type: 'sine', delay: true });
    this._tone({ freq: 1300, dur: 0.06, gain: 0.09, type: 'triangle', slide: -400, delay: true });
    this._noise({ dur: 0.05, gain: 0.07, freq: 3200, type: 'highpass', delay: true });
  }

  whisper() {
    // Случайные шёпоты при низкой психике
    const base = 250 + Math.random() * 500;
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this._noise({ dur: 0.32, gain: 0.06, freq: base + Math.random() * 900, type: 'bandpass', q: 7, delay: true });
      }, i * (120 + Math.random() * 180));
    }
  }

  heartbeat(intensity = 0.5) {
    const g = 0.12 + intensity * 0.3;
    this._tone({ freq: 52, dur: 0.16, gain: g, type: 'sine', slide: -12 });
    setTimeout(() => this._tone({ freq: 46, dur: 0.13, gain: g * 0.75, type: 'sine', slide: -10 }), 165);
  }

  /** Фоновый гул тревоги при Всплеске. */
  surgeAlarm() {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this._tone({ freq: 330, dur: 0.5, gain: 0.13, type: 'square', slide: -60 });
        this._tone({ freq: 165, dur: 0.55, gain: 0.1, type: 'sawtooth', slide: -30 });
      }, i * 620);
    }
  }

  extractHum() {
    this._tone({ freq: 110, dur: 2.4, gain: 0.16, type: 'sine', slide: 60 });
    this._tone({ freq: 220, dur: 2.2, gain: 0.09, type: 'triangle', slide: 80 });
    this._noise({ dur: 2, gain: 0.05, freq: 600, type: 'bandpass', q: 1.5 });
  }

  uiHover() {
    this._tone({ freq: 880, dur: 0.035, gain: 0.05, type: 'sine' });
  }

  uiClick() {
    this._tone({ freq: 620, dur: 0.06, gain: 0.11, type: 'triangle', slide: 140 });
    this._noise({ dur: 0.03, gain: 0.05, freq: 2200, type: 'highpass' });
  }

  uiDeny() {
    this._tone({ freq: 180, dur: 0.16, gain: 0.12, type: 'square', slide: -70 });
  }

  /** Пульсация сердца — вызывать из цикла. */
  updateHeartbeat(dt, rate01) {
    if (!this.ctx || rate01 <= 0) return;
    // rate01: 0 — покой, 1 — паника
    this.heartbeatInterval = 1.15 - rate01 * 0.68;
    this.heartTimer -= dt;
    if (this.heartTimer <= 0) {
      this.heartTimer = this.heartbeatInterval;
      this.heartbeat(rate01);
    }
  }

  /** Радиопомехи (база/кат-сцены). */
  radioChatter() {
    this._noise({ dur: 0.5, gain: 0.07, freq: 1700, type: 'bandpass', q: 1.2 });
    for (let i = 0; i < 4; i++) {
      setTimeout(() => this._tone({ freq: 400 + Math.random() * 900, dur: 0.06, gain: 0.035, type: 'sawtooth' }), i * 90);
    }
  }
}
