/**
 * РАЗЛОМ · Эффекты: галлюцинации, вспышки урона, искажения.
 */
import * as THREE from 'three';
import { silhouetteTexture } from './textures.js';

export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.hallucinations = [];
    this.halluTimer = 6;
    this.time = 0;

    const tex = silhouetteTexture();
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.15), mat);
      mesh.visible = false;
      scene.add(mesh);
      this.hallucinations.push({ mesh, life: 0, maxLife: 0, drift: 0 });
    }

    // DOM-элементы
    this.elFlash = document.getElementById('fx-flash');
    this.elDistort = document.getElementById('fx-distort');
    this.flashTimer = 0;
    this.whisperTimer = 3 + Math.random() * 5;
    this.onWhisper = null;
    this.onHeartbeat = null;
  }

  damageFlash() {
    if (this.elFlash) {
      this.elFlash.classList.add('on');
      setTimeout(() => this.elFlash.classList.remove('on'), 90);
    }
  }

  update(dt, player, monster) {
    this.time += dt;

    // ── Галлюцинации при низкой психике ──
    const psycheK = 1 - player.psyche / player.maxPsyche;   // 0..1
    if (psycheK > 0.55) {
      this.halluTimer -= dt * (0.6 + psycheK);
      if (this.halluTimer <= 0) {
        this.halluTimer = 4.5 + Math.random() * 7 * (1.2 - psycheK);
        this._spawnHallucination(player, psycheK);
      }
    }
    for (const h of this.hallucinations) {
      if (h.life > 0) {
        h.life -= dt;
        const k = h.life / h.maxLife;
        const opacity = Math.sin(Math.min(1, k * 2) * Math.PI * 0.5) * Math.min(1, k * 3) * 0.85;
        h.mesh.material.opacity = opacity;
        h.mesh.lookAt(this.camera.position.x, h.mesh.position.y + 1, this.camera.position.z);
        h.mesh.position.x += h.drift * dt;
        if (h.life <= 0) h.mesh.visible = false;
      }
    }

    // ── Искажение экрана ──
    if (this.elDistort) {
      const should = psycheK > 0.62 || (monster && monster.distanceTo(player.pos) < 9 && monster.state === 'chase');
      this.elDistort.classList.toggle('on', !!should);
    }

    // ── Шёпоты ──
    if (psycheK > 0.45) {
      this.whisperTimer -= dt * (0.5 + psycheK);
      if (this.whisperTimer <= 0) {
        this.whisperTimer = 3.5 + Math.random() * 6;
        if (this.onWhisper) this.onWhisper();
      }
    }
  }

  _spawnHallucination(player, k) {
    const h = this.hallucinations.find((x) => x.life <= 0) || this.hallucinations[0];
    const yaw = player.yaw + (Math.random() - 0.5) * 1.6 + (Math.random() < 0.5 ? 0 : Math.PI);
    const dist = 4 + Math.random() * 7;
    const px = player.pos.x - Math.sin(yaw) * dist;
    const pz = player.pos.z - Math.cos(yaw) * dist;
    h.mesh.position.set(px, 1.15, pz);
    h.mesh.visible = true;
    h.life = h.maxLife = 1.6 + Math.random() * 2.4;
    h.drift = (Math.random() - 0.5) * 0.55;
    h.mesh.material.opacity = 0;
    // Чем хуже психика — тем ближе и зловеще
    if (k > 0.8) h.mesh.scale.setScalar(1.25);
    else h.mesh.scale.setScalar(1);
  }

  dispose() {
    for (const h of this.hallucinations) {
      this.scene.remove(h.mesh);
      h.mesh.geometry.dispose();
      h.mesh.material.dispose();
    }
  }
}
