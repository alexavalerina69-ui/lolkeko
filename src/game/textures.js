/**
 * РАЗЛОМ · Процедурные текстуры (canvas) — бетон, пол, металл.
 */
import * as THREE from 'three';

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.size = size;
  c.height = size;
  return c;
}

function noiseFill(ctx, size, base, spread) {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * spread;
    d[i] = Math.max(0, Math.min(255, base[0] + n));
    d[i + 1] = Math.max(0, Math.min(255, base[1] + n));
    d[i + 2] = Math.max(0, Math.min(255, base[2] + n));
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function addStains(ctx, size, count, color, alpha, rMin, rMax) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = rMin + Math.random() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color},${alpha})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function addLines(ctx, size, count, color, alpha, vertical) {
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.lineWidth = 0.5 + Math.random() * 2;
    ctx.beginPath();
    const a = Math.random() * size;
    const b = Math.random() * size;
    const len = size * (0.15 + Math.random() * 0.6);
    if (vertical) {
      ctx.moveTo(a, b); ctx.lineTo(a + (Math.random() - 0.5) * 8, b + len);
    } else {
      ctx.moveTo(b, a); ctx.lineTo(b + len, a + (Math.random() - 0.5) * 8);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function toTexture(canvas, repeat = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Бетонная стена. */
export function concreteTexture(repeat = 2) {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  noiseFill(ctx, size, [52, 56, 62], 26);
  addStains(ctx, size, 7, '18,20,24', 0.35, 30, 90);
  addStains(ctx, size, 4, '96,104,110', 0.16, 20, 70);
  addLines(ctx, size, 6, '#1a1e22', 0.5, true);
  addLines(ctx, size, 4, '#707880', 0.12, false);
  // Панельные швы
  ctx.strokeStyle = 'rgba(14,16,20,0.75)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
  ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
  ctx.stroke();
  return toTexture(c, repeat);
}

/** Промышленный пол с решётками. */
export function floorTexture(repeat = 4) {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  noiseFill(ctx, size, [40, 43, 48], 18);
  // Плитка
  ctx.strokeStyle = 'rgba(12,14,18,0.9)';
  ctx.lineWidth = 5;
  for (let i = 0; i <= 4; i++) {
    const p = (i * size) / 4;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }
  addStains(ctx, size, 9, '16,18,22', 0.4, 24, 80);
  addLines(ctx, size, 8, '#8a9298', 0.08, false);
  return toTexture(c, repeat);
}

/** Потолок. */
export function ceilingTexture(repeat = 4) {
  const size = 128;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  noiseFill(ctx, size, [28, 31, 36], 12);
  ctx.strokeStyle = 'rgba(10,12,15,0.8)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 2; i++) {
    const p = (i * size) / 2;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }
  return toTexture(c, repeat);
}

/** Металл (двери, ящики, оборудование). */
export function metalTexture(repeat = 1) {
  const size = 128;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  noiseFill(ctx, size, [58, 64, 72], 16);
  addStains(ctx, size, 5, '30,22,14', 0.3, 14, 44); // ржавчина
  addLines(ctx, size, 10, '#22282e', 0.45, true);
  return toTexture(c, repeat);
}

/** Силуэт для галлюцинаций. */
export function silhouetteTexture() {
  const size = 128;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.96)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // Фигура
  ctx.fillStyle = 'rgba(0,0,0,0.98)';
  ctx.beginPath();
  ctx.ellipse(size / 2, size * 0.34, size * 0.11, size * 0.13, 0, 0, Math.PI * 2); // голова
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(size * 0.38, size * 0.46);
  ctx.quadraticCurveTo(size * 0.5, size * 0.42, size * 0.62, size * 0.46);
  ctx.lineTo(size * 0.66, size * 0.88);
  ctx.lineTo(size * 0.34, size * 0.88);
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Иконка/эмиссивная маркировка (номера, знаки). */
export function decalTexture(text, color = '#57d0c8') {
  const c = makeCanvas(128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.font = 'bold 64px monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
