/**
 * РАЗЛОМ · «СЛЕПОЙ» — охотник на звук.
 * Патруль → расследование → погой; эхолокация; процедурная модель.
 */
import * as THREE from 'three';

const SPEED = {
  patrol: 1.65,
  investigate: 2.75,
  chase: 4.35,
  stunned: 0,
};

export class Blind {
  constructor(world, { speedScale = 1, senseScale = 1 } = {}) {
    this.world = world;
    this.speedScale = speedScale;
    this.senseScale = senseScale;

    this.pos = world.monsterSpawn.clone();
    this.state = 'patrol';
    this.path = null;
    this.pathIdx = 0;
    this.repathTimer = 0;
    this.targetPos = null;        // куда идёт (расследование/погоня)
    this.lastKnownPos = null;
    this.attackCooldown = 0;
    this.stunTimer = 0;
    this.pingTimer = 2.5 + Math.random() * 2;
    this.growlTimer = 4 + Math.random() * 6;
    this.walkPhase = Math.random() * 10;
    this.awareness = 0;           // 0..1 накопленное «подозрение»
    this.timeSinceSeen = 999;

    this.onPing = null;           // колбэк щелчка
    this.onGrowl = null;
    this.onScream = null;
    this.onAttack = null;

    this._buildModel();
  }

  _buildModel() {
    const g = new THREE.Group();

    const skin = new THREE.MeshStandardMaterial({
      color: 0x0c0d10,
      roughness: 0.86,
      metalness: 0.18,
    });
    const bone = new THREE.MeshStandardMaterial({
      color: 0x1a1c20,
      roughness: 0.7,
      metalness: 0.3,
    });

    // Торс — вытянутый, сутулый
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.42, 1.5, 7), skin);
    torso.position.y = 1.55;
    torso.rotation.x = 0.22;
    torso.castShadow = true;
    g.add(torso);
    this.torso = torso;

    // Голова
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), skin);
    head.position.set(0, 2.42, 0.14);
    head.scale.set(0.85, 1.18, 1.0);
    head.castShadow = true;
    g.add(head);
    this.head = head;

    // Глаза — слабое свечение (он слепой, но «видит» эхом)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xb8fff2 });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038, 6, 6), eyeMat);
      eye.position.set(0.1 * s, 2.46, 0.35);
      g.add(eye);
    }

    // Длинные руки
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.38 * s, 2.05, 0);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 1.05, 6), skin);
      upper.position.y = -0.52;
      upper.castShadow = true;
      pivot.add(upper);
      const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 1.15, 6), skin);
      fore.position.set(0, -1.5, 0.12);
      fore.rotation.x = -0.35;
      fore.castShadow = true;
      pivot.add(fore);
      // Когти
      for (let i = 0; i < 3; i++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.24, 4), bone);
        claw.position.set(0.06 * (i - 1), -2.12, 0.34);
        claw.rotation.x = Math.PI - 0.5;
        pivot.add(claw);
      }
      g.add(pivot);
      this.arms.push(pivot);
    }

    // Ноги
    this.legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0.17 * s, 1.05, 0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.06, 1.12, 6), skin);
      leg.position.y = -0.56;
      leg.castShadow = true;
      pivot.add(leg);
      g.add(pivot);
      this.legs.push(pivot);
    }

    g.position.copy(this.pos);
    this.model = g;
  }

  addToScene(scene) {
    scene.add(this.model);
  }

  /** Событие шума от игрока. */
  hearNoise({ pos, radius, loud }) {
    const d = this.pos.distanceTo(pos);
    const effective = radius * this.senseScale * (loud ? 1.25 : 1);
    if (d > effective) return;

    if (this.state === 'patrol' || this.state === 'investigate') {
      this.targetPos = pos.clone();
      this.lastKnownPos = pos.clone();
      this.state = 'investigate';
      this.awareness = Math.min(1, this.awareness + (loud ? 0.55 : 0.3));
      this.repathTimer = 0;
    } else if (this.state === 'chase') {
      this.lastKnownPos = pos.clone(); // уточняем позицию
      this.timeSinceSeen = 0;
    }
  }

  stun(duration = 7) {
    this.state = 'stunned';
    this.stunTimer = duration;
    this.awareness = 0;
    this.path = null;
    if (this.onScream) this.onScream();
  }

  update(dt, player, time) {
    if (!this.model) return;

    // ── Эхолокация ──
    this.pingTimer -= dt;
    if (this.pingTimer <= 0) {
      this.pingTimer = this.state === 'chase' ? 1.35 : 3.2 + Math.random() * 2.2;
      if (this.onPing) this.onPing();

      const d = this.pos.distanceTo(player.pos);
      const pingRange = 30 * this.senseScale;
      if (d < pingRange && player.alive) {
        // Успех пинга зависит от шумности игрока (тишина = невидимость)
        const detect = player.noiseLevel * 1.3 + Math.max(0, 0.35 - (d / pingRange) * 0.35);
        if (detect > 0.42) {
          this.lastKnownPos = player.pos.clone();
          if (d < 16 || detect > 0.9) {
            if (this.state !== 'chase') {
              this.state = 'chase';
              if (this.onGrowl) this.onGrowl();
            }
            this.awareness = 1;
            this.timeSinceSeen = 0;
          } else if (this.state !== 'chase') {
            this.state = 'investigate';
            this.targetPos = this.lastKnownPos.clone();
            this.awareness = Math.min(1, this.awareness + 0.5);
          }
          this.repathTimer = 0;
        }
      }
    }

    // ── Стадийная логика ──
    if (this.state === 'stunned') {
      this.stunTimer -= dt;
      if (this.stunTimer <= 0) {
        this.state = 'patrol';
        this.repathTimer = 0;
      }
    } else {
      const dPlayer = this.pos.distanceTo(player.pos);

      // Прямое «чувство» близости — паника без пинга
      if (dPlayer < 3.2 && player.alive && this.state !== 'chase') {
        this.state = 'chase';
        this.lastKnownPos = player.pos.clone();
        this.timeSinceSeen = 0;
        if (this.onGrowl) this.onGrowl();
      }

      // Потеря цели
      if (this.state === 'chase') {
        this.timeSinceSeen += dt;
        if (this.lastKnownPos && this.pos.distanceTo(this.lastKnownPos) < 2.2) {
          this.timeSinceSeen += dt * 2;
        }
        if (this.timeSinceSeen > 7.5) {
          this.state = 'investigate';
          this.targetPos = this.lastKnownPos ? this.lastKnownPos.clone() : null;
          this.repathTimer = 0;
        }
      } else if (this.state === 'investigate') {
        if (this.targetPos && this.pos.distanceTo(this.targetPos) < 1.8) {
          this.state = 'patrol';
          this.awareness = Math.max(0, this.awareness - 0.4);
          this.targetPos = null;
        }
      }

      // Патруль: случайные точки
      if (this.state === 'patrol' && (!this.path || this.pathIdx >= this.path.length)) {
        const cell = this.world.floorCells[(Math.random() * this.world.floorCells.length) | 0];
        const p = new THREE.Vector3(cell.x * 4.2, 0, cell.z * 4.2);
        this.targetPos = p;
        this.repathTimer = 0;
      }

      // Перестроение пути
      this.repathTimer -= dt;
      if (this.repathTimer <= 0 && this.targetPos) {
        this.repathTimer = this.state === 'chase' ? 0.55 : 1.1;
        const goal = this.state === 'chase' && player.alive ? player.pos : this.targetPos;
        const path = this.world.findPath(this.pos, goal);
        if (path && path.length > 1) {
          this.path = path;
          this.pathIdx = 1;
        }
      }

      // Движение по пути
      const speed = SPEED[this.state] * this.speedScale;
      if (this.path && this.pathIdx < this.path.length && speed > 0) {
        const wp = this.path[this.pathIdx];
        const dir = new THREE.Vector3().subVectors(wp, this.pos);
        dir.y = 0;
        const dist = dir.length();
        if (dist < 0.55) {
          this.pathIdx++;
        } else {
          dir.normalize();
          this.pos.addScaledVector(dir, speed * dt);
          this.world.resolveCollision(this.pos, 0.5);
          // Плавный поворот модели
          const targetAngle = Math.atan2(dir.x, dir.z);
          let da = targetAngle - this.model.rotation.y;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          this.model.rotation.y += da * Math.min(1, dt * 6);
        }
      }

      // Сброс «подозрения» в патруле
      if (this.state === 'patrol') {
        this.awareness = Math.max(0, this.awareness - dt * 0.12);
        this.timeSinceSeen = 999;
      }

      // Атака
      this.attackCooldown = Math.max(0, this.attackCooldown - dt);
      if (this.state === 'chase' && dPlayer < 1.85 && this.attackCooldown <= 0 && player.alive) {
        this.attackCooldown = 1.55;
        if (this.onAttack) this.onAttack();
      }

      // Рёв
      this.growlTimer -= dt;
      if (this.growlTimer <= 0) {
        this.growlTimer = this.state === 'chase' ? 2.2 + Math.random() * 1.6 : 7 + Math.random() * 8;
        if (this.onGrowl) this.onGrowl();
      }
    }

    // ── Анимация ──
    this.walkPhase += dt * (this.state === 'chase' ? 3.1 : this.state === 'stunned' ? 0.4 : 1.35);
    const swing = Math.sin(this.walkPhase) * (this.state === 'chase' ? 0.85 : 0.42);
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.8;
    this.arms[1].rotation.x = swing * 0.8;
    this.head.rotation.z = Math.sin(this.walkPhase * 0.37) * 0.16;
    this.head.rotation.x = 0.1 + Math.sin(this.walkPhase * 0.21) * 0.1;

    this.model.position.set(this.pos.x, 0, this.pos.z);
    if (this.state === 'stunned') {
      this.model.rotation.z = Math.sin(time * 22) * 0.09;
    } else {
      this.model.rotation.z = Math.sin(this.walkPhase * 0.5) * 0.035;
    }
  }

  /** Дальность для эффектов страха игрока. */
  distanceTo(v) {
    return this.pos.distanceTo(v);
  }
}
