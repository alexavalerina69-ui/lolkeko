/**
 * РАЗЛОМ · Игрок: FPS-контроллер, статы, фонарь, шум.
 */
import * as THREE from 'three';

const EYE_STAND = 1.68;
const EYE_CROUCH = 1.02;

export class Player {
  constructor(camera, world, upgrades = {}) {
    this.camera = camera;
    this.world = world;

    // Позиция и камера
    this.pos = world.spawn.clone();
    world.clampToFloor(this.pos);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI * 0.25;
    this.pitch = 0;
    this.eyeHeight = EYE_STAND;
    this.bobPhase = 0;
    this.bobAmount = 0;

    // Статы
    this.maxHp = 100;
    this.hp = 100;
    this.maxPsyche = 100;
    this.psyche = 100;
    this.maxStamina = 100 + (upgrades.stamina || 0) * 15;
    this.stamina = this.maxStamina;
    this.maxBattery = 100 + (upgrades.battery || 0) * 20;
    this.battery = this.maxBattery;
    this.psycheResist = 1 - (upgrades.psyche || 0) * 0.1;
    this.medkitPower = 38 + (upgrades.medkit || 0) * 15;

    // Инвентарь
    this.items = { medkit: 1, battery: 1, flashbang: 1 };

    // Состояния
    this.crouching = false;
    this.sprinting = false;
    this.flashlightOn = true;
    this.noiseLevel = 0;         // 0..1 — текущая шумность
    this.alive = true;
    this.staminaDelay = 0;
    this.hurtCooldown = 0;
    this.footstepTimer = 0;
    this.onFootstep = null;      // колбэк (звук)
    this.onNoise = null;         // колбэк (событие шума для монстра)
    this.noiseEventTimer = 0;

    // Фонарь (прожектор + мягкий заполняющий свет)
    this.flashlight = new THREE.SpotLight(0xe8f2ff, 90, 34, Math.PI / 5.2, 0.42, 1.8);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.camera.near = 0.3;
    this.flashlight.shadow.camera.far = 34;
    this.flashlight.shadow.bias = -0.004;
    this.flashTarget = new THREE.Object3D();
    this.flashlight.target = this.flashTarget;

    this.fillLight = new THREE.PointLight(0x30404e, 1.6, 7, 2);

    // Мягкий свет «глаз» — чтобы абсолютная чернота не рушила картинку
    this.ambientGlow = new THREE.PointLight(0x18222c, 1.1, 12, 2);
  }

  addToScene(scene) {
    scene.add(this.flashlight);
    scene.add(this.flashTarget);
    scene.add(this.fillLight);
    scene.add(this.ambientGlow);
  }

  applyLook(dx, dy, sensitivity) {
    const s = 0.0022 * sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    const lim = Math.PI / 2 - 0.06;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  update(dt, input) {
    if (!this.alive) return;

    // ── Движение ──
    const fwd = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const strafe = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);

    this.crouching = input.isDown('KeyC') || input.isDown('ControlLeft') || input.isDown('ControlRight');
    const wantSprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    this.sprinting = wantSprint && !this.crouching && fwd > 0 && this.stamina > 2;

    let speed = this.crouching ? 1.55 : this.sprinting ? 5.45 : 3.1;

    // Ускорение/замедление
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wish = new THREE.Vector3(
      (-sin * fwd + cos * strafe),
      0,
      (-cos * fwd - sin * strafe)
    );
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

    const accel = this.vel.distanceTo(wish) > 0.1 ? 14 : 10;
    this.vel.x = THREE.MathUtils.damp(this.vel.x, wish.x, accel, dt);
    this.vel.z = THREE.MathUtils.damp(this.vel.z, wish.z, accel, dt);

    const moving = this.vel.lengthSq() > 0.4;

    // Спринт и выносливость
    if (this.sprinting && moving) {
      this.stamina = Math.max(0, this.stamina - 21 * dt);
      this.staminaDelay = 0.9;
    } else {
      this.staminaDelay = Math.max(0, this.staminaDelay - dt);
      if (this.staminaDelay <= 0) {
        this.stamina = Math.min(this.maxStamina, this.stamina + 13 * dt);
      }
    }

    // Перемещение + коллизии
    this.pos.x += this.vel.x * dt;
    this.world.resolveCollision(this.pos, 0.42);
    this.pos.z += this.vel.z * dt;
    this.world.resolveCollision(this.pos, 0.42);
    this.world.clampToFloor(this.pos);

    // Покачивание головы и шаги
    const targetBob = moving ? (this.sprinting ? 1 : this.crouching ? 0.28 : 0.62) : 0;
    this.bobAmount = THREE.MathUtils.damp(this.bobAmount, targetBob, 8, dt);
    if (moving) {
      const speedFactor = this.sprinting ? 1.65 : this.crouching ? 0.55 : 1;
      this.bobPhase += dt * 8.4 * speedFactor;
      if (Math.sin(this.bobPhase) > 0.92 && this.footstepTimer <= 0) {
        this.footstepTimer = 0.16;
        if (this.onFootstep) this.onFootstep({ sprint: this.sprinting, crouch: this.crouching });
        this._emitNoise();
      }
    }
    this.footstepTimer -= dt;

    // Высота глаз
    const targetEye = this.crouching ? EYE_CROUCH : EYE_STAND;
    this.eyeHeight = THREE.MathUtils.damp(this.eyeHeight, targetEye, 12, dt);

    // Камера
    const bobY = Math.sin(this.bobPhase * 2) * 0.028 * this.bobAmount;
    const bobX = Math.cos(this.bobPhase) * 0.022 * this.bobAmount;
    this.camera.position.set(
      this.pos.x + bobX * cos,
      this.pos.y + this.eyeHeight + bobY,
      this.pos.z - bobX * sin
    );
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);

    // Фонарь следует за взглядом
    this.flashlight.position.copy(this.camera.position);
    this.flashTarget.position.copy(this.camera.position)
      .add(new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation).multiplyScalar(10));
    this.fillLight.position.copy(this.camera.position);
    this.ambientGlow.position.copy(this.camera.position);

    // Разряд фонаря
    if (this.flashlightOn) {
      this.battery = Math.max(0, this.battery - 0.7 * dt);
      if (this.battery <= 0) {
        this.flashlightOn = false;
      }
    }
    const flick = this.psyche < 30 ? 0.82 + Math.random() * 0.18 : 1;
    this.flashlight.intensity = this.flashlightOn ? 90 * flick * (0.35 + 0.65 * (this.battery / this.maxBattery)) : 0;
    this.fillLight.intensity = this.flashlightOn ? 1.6 : 0.35;
    this.ambientGlow.intensity = 1.05;

    // ── Шум ──
    const targetNoise = this.crouching ? (moving ? 0.12 : 0) : this.sprinting ? (moving ? 1 : 0.05) : (moving ? 0.34 : 0.02);
    this.noiseLevel = THREE.MathUtils.damp(this.noiseLevel, targetNoise, 7, dt);
    this.noiseEventTimer -= dt;
    if (moving && this.noiseLevel > 0.2 && this.noiseEventTimer <= 0) {
      this.noiseEventTimer = this.sprinting ? 0.34 : 0.62;
      this._emitNoise();
    }

    // ── Психика ──
    let psycheDelta = 0.28 * this.psycheResist;          // базовое восстановление
    if (!this.flashlightOn) psycheDelta -= 1.35 * this.psycheResist;   // темнота давит
    if (this.hp < this.maxHp * 0.35) psycheDelta -= 0.85;
    this.psyche = THREE.MathUtils.clamp(this.psyche + psycheDelta * dt, 0, this.maxPsyche);

    if (this.psyche <= 0) {
      this.takeDamage(3.2 * dt, { silent: true });
    }

    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
  }

  _emitNoise() {
    if (this.onNoise) {
      this.onNoise({
        pos: this.pos.clone(),
        radius: this.crouching ? 5 : this.sprinting ? 17 : 10,
        loud: this.sprinting,
      });
    }
  }

  /** Дренаж психики от близости монстра — вызывает монстр/эффекты. */
  drainPsyche(amount) {
    this.psyche = Math.max(0, this.psyche - amount * this.psycheResist);
  }

  restorePsyche(amount) {
    this.psyche = Math.min(this.maxPsyche, this.psyche + amount);
  }

  takeDamage(n, { silent = false } = {}) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - n);
    if (!silent) {
      this.drainPsyche(6);
      if (this.onHurt) this.onHurt(n);
    }
    if (this.hp <= 0) {
      this.alive = false;
      if (this.onDeath) this.onDeath();
    }
  }

  useMedkit() {
    if (this.items.medkit <= 0 || this.hp >= this.maxHp) return false;
    this.items.medkit--;
    this.hp = Math.min(this.maxHp, this.hp + this.medkitPower);
    this.restorePsyche(8);
    return true;
  }

  useBattery() {
    if (this.items.battery <= 0 || this.battery >= this.maxBattery) return false;
    this.items.battery--;
    this.battery = Math.min(this.maxBattery, this.battery + this.maxBattery * 0.55);
    return true;
  }

  useFlashbang() {
    if (this.items.flashbang <= 0) return false;
    this.items.flashbang--;
    return true;
  }

  /** Сердечный ритм для аудио/визуала: 0..1 */
  stressLevel(monsterDistance = Infinity) {
    let s = 0;
    if (this.psyche < 45) s = Math.max(s, (45 - this.psyche) / 45 * 0.65);
    if (this.hp < 50) s = Math.max(s, (50 - this.hp) / 50 * 0.5);
    if (monsterDistance < 14) s = Math.max(s, (14 - monsterDistance) / 14);
    return Math.min(1, s);
  }

  /** Освобождение GPU-ресурсов (карты теней). */
  dispose() {
    this.flashlight.dispose();
    this.fillLight.dispose();
    this.ambientGlow.dispose();
  }
}
