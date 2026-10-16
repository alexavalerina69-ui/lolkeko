/**
 * РАЗЛОМ · Сохранение прогресса (localStorage).
 */

const KEY = 'rift_protocol_save_v1';

const DEFAULT = {
  settings: { volume: 80, sensitivity: 100, invertY: false },
  profile: {
    credits: 0,
    xp: 0,
    level: 1,
    upgrades: { battery: 0, stamina: 0, psyche: 0, medkit: 0, insurance: 0 },
    stats: { raids: 0, extracts: 0, deaths: 0, samples: 0, artifacts: 0, observations: 0 },
  },
};

function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(over || {})) {
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], over[k]);
    } else {
      out[k] = over[k];
    }
  }
  return out;
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT);
    return deepMerge(DEFAULT, JSON.parse(raw));
  } catch (_) {
    return structuredClone(DEFAULT);
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (_) {
    /* приватный режим — играем без сохранений */
  }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); } catch (_) { /* ignore */ }
  return structuredClone(DEFAULT);
}

export { DEFAULT as SAVE_DEFAULT };
