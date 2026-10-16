/**
 * РАЗЛОМ · Предметы в Зоне: образцы, расходники, артефакты.
 */
import * as THREE from 'three';

const TYPES = {
  sample: {
    label: 'ОБРАЗЕЦ',
    prompt: 'изъять образец',
    emissive: 0x36e8d8,
    glow: 1.8,
  },
  battery: {
    label: 'АКБ',
    prompt: 'взять заряд АКБ',
    emissive: 0x4aa8d8,
    glow: 0.8,
  },
  medkit: {
    label: 'АПТЕЧКА',
    prompt: 'взять аптечку',
    emissive: 0xd8564a,
    glow: 0.8,
  },
  flashbang: {
    label: 'ВСПЫШКА',
    prompt: 'взять светошумовую',
    emissive: 0xd8c84a,
    glow: 0.8,
  },
  artifact: {
    label: 'АРТЕФАКТ',
    prompt: 'изъять артефакт',
    emissive: 0xb44ad8,
    glow: 2.2,
  },
};

function buildMesh(type) {
  const t = TYPES[type];
  const g = new THREE.Group();
  const emat = new THREE.MeshStandardMaterial({
    color: 0x1a2226,
    emissive: t.emissive,
    emissiveIntensity: t.glow,
    roughness: 0.4,
    metalness: 0.3,
  });

  if (type === 'sample') {
    // Светящаяся банка с образцом
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 10), emat);
    jar.position.y = 0.42;
    g.add(jar);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.19, 0.19, 0.08, 10),
      new THREE.MeshStandardMaterial({ color: 0x2c343a, roughness: 0.6, metalness: 0.6 })
    );
    cap.position.y = 0.66;
    g.add(cap);
  } else if (type === 'battery') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.18), emat);
    box.position.y = 0.28;
    g.add(box);
  } else if (type === 'medkit') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.3), emat);
    box.position.y = 0.16;
    g.add(box);
    const cross = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.05, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xf0f4f6, emissive: 0xaa2222, emissiveIntensity: 0.6 })
    );
    cross.position.y = 0.26;
    g.add(cross);
  } else if (type === 'flashbang') {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8), emat);
    cyl.position.y = 0.2;
    g.add(cyl);
  } else {
    // Артефакт — парящий октаэдр
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), emat);
    core.position.y = 0.72;
    g.add(core);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.34, 0.028, 6, 24),
      new THREE.MeshStandardMaterial({ color: 0x111111, emissive: t.emissive, emissiveIntensity: 1.2 })
    );
    ring.position.y = 0.72;
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    g.userData.spin = core;
    g.userData.ring = ring;
  }

  // Слабый источник света для образцов/артефактов
  if (type === 'sample' || type === 'artifact') {
    const pl = new THREE.PointLight(t.emissive, type === 'sample' ? 1.4 : 2.2, 5.5, 2);
    pl.position.y = 0.7;
    g.add(pl);
  }
  return g;
}

export class LootManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.items = [];
    this._time = 0;
  }

  spawn(type, pos) {
    const mesh = buildMesh(type);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.items.push({ type, mesh, pos: pos.clone(), taken: false, baseY: pos.y });
    return mesh;
  }

  populate() {
    const w = this.world;
    for (const p of w.sampleSpawns) this.spawn('sample', p);
    for (const p of w.lootSpawns.battery) this.spawn('battery', p);
    for (const p of w.lootSpawns.medkit) this.spawn('medkit', p);
    for (const p of w.lootSpawns.flashbang) this.spawn('flashbang', p);
    for (const p of w.lootSpawns.artifact) this.spawn('artifact', p);
  }

  /** Ближайший предмет в радиусе действия. */
  nearest(playerPos, maxDist = 2.1) {
    let best = null;
    let bestD = maxDist;
    for (const it of this.items) {
      if (it.taken) continue;
      const d = it.pos.distanceTo(playerPos);
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }

  take(item) {
    if (!item || item.taken) return null;
    item.taken = true;
    this.scene.remove(item.mesh);
    return item.type;
  }

  countSamplesLeft() {
    return this.items.filter((i) => i.type === 'sample' && !i.taken).length;
  }

  update(dt) {
    this._time += dt;
    for (const it of this.items) {
      if (it.taken) continue;
      const m = it.mesh;
      if (it.type === 'artifact') {
        if (m.userData.spin) {
          m.userData.spin.rotation.y += dt * 1.4;
          m.userData.spin.rotation.x += dt * 0.7;
          m.userData.spin.position.y = 0.72 + Math.sin(this._time * 1.6) * 0.09;
        }
        if (m.userData.ring) m.userData.ring.rotation.z += dt * 0.8;
      } else if (it.type === 'sample') {
        m.position.y = it.baseY + Math.sin(this._time * 1.2 + it.pos.x) * 0.028;
      }
    }
  }

  dispose() {
    for (const it of this.items) {
      this.scene.remove(it.mesh);
      it.mesh.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    this.items = [];
  }
}

export { TYPES as LOOT_TYPES };
