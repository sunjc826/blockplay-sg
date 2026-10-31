import * as THREE from 'three';

interface Stack {
  group: THREE.Group;
  cases: THREE.InstancedMesh;
  tips: THREE.InstancedMesh;
  follower: THREE.Mesh;
  top: number; travel: number; z: number; curve: number; spread: number;
  rounds: number; capacity: number;
}
const stacks = new WeakMap<THREE.Object3D, Stack[]>();
const MAX_ROUNDS = 200;

/** Two instanced draws for all cartridges, plus one follower. No per-round physics. */
export function fitMagazineAmmo(root: THREE.Object3D, id: string, capacity?: number) {
  if (!['sar21-inspired', 'xm8-inspired', 'g36-inspired'].includes(id)) return () => {};
  const magazine = root.getObjectByName(`${id}__magazine`);
  if (!magazine) return () => {};
  const owned: Stack[] = [], hidden: [THREE.Object3D, boolean][] = [];
  const replaced: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  const resources: (THREE.BufferGeometry | THREE.Material | THREE.InstancedMesh)[] = [];
  const brass = new THREE.MeshStandardMaterial({ name: 'Cartridge brass', color: '#c5a25b', roughness: .4, metalness: .65 });
  const copper = new THREE.MeshStandardMaterial({ name: 'Cartridge copper', color: '#a86e47', roughness: .45, metalness: .6 });
  const polymer = new THREE.MeshStandardMaterial({ name: 'Magazine follower', color: '#7e8758', roughness: .75 });
  const caseGeometry = new THREE.CylinderGeometry(.0035, .0038, .032, 8);
  const tipGeometry = new THREE.CylinderGeometry(.0008, .0035, .012, 8);
  caseGeometry.rotateX(Math.PI / 2); tipGeometry.rotateX(-Math.PI / 2);
  const followerGeometry = new THREE.BoxGeometry(.019, .005, .046);
  resources.push(brass, copper, polymer, caseGeometry, tipGeometry, followerGeometry);
  function add(parent: THREE.Object3D, top: number, travel: number, z: number, curve: number, spread: number, capacity: number) {
    const group = new THREE.Group(); group.name = 'magazine-ammunition'; parent.add(group);
    const cases = new THREE.InstancedMesh(caseGeometry, brass, MAX_ROUNDS);
    const tips = new THREE.InstancedMesh(tipGeometry, copper, MAX_ROUNDS);
    cases.name = 'magazine-cartridges'; tips.name = 'magazine-cartridge-tips';
    // The matrices change only on shots/reloads. Bounds follow the magazine's
    // parent; disabling per-instance bounds also avoids stale full/empty bounds.
    for (const mesh of [cases, tips]) { mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); resources.push(mesh); }
    const follower = new THREE.Mesh(followerGeometry, polymer); follower.name = 'magazine-follower';
    group.add(cases, tips, follower);
    owned.push({ group, cases, tips, follower, top, travel, z, curve, spread, rounds: -1, capacity });
  }
  function smoke(mesh: THREE.Mesh, match: (material: THREE.Material) => boolean) {
    const original = mesh.material;
    const materials = (Array.isArray(original) ? original : [original]).map(source => {
      if (!match(source)) return source;
      const material = new THREE.MeshStandardMaterial({ name: 'Translucent magazine polymer', color: '#7a6947',
        roughness: .38, metalness: .02, transparent: true, opacity: .38, depthWrite: false,
        side: THREE.DoubleSide, forceSinglePass: true });
      resources.push(material); return material;
    });
    replaced.push([mesh, original]); mesh.material = Array.isArray(original) ? materials : materials[0];
  }
  if (id === 'sar21-inspired') {
    // The shipped GLB has offset vertices and three material groups. Change
    // only the shell; the raised ribs and rubber floorplate remain solid.
    magazine.traverse(node => {
      if (node instanceof THREE.Mesh && (Array.isArray(node.material) ? node.material : [node.material]).some(material => /parkerized/i.test(material.name)))
        smoke(node, material => /parkerized/i.test(material.name));
    });
    add(magazine, .068, .184, .239, .009, .005, 30);
  } else {
    const bodies: THREE.Mesh[] = [];
    magazine.traverse(node => { if (node instanceof THREE.Mesh && node.name === `${id}__magazine-body`) bodies.push(node); });
    for (const body of bodies) {
      const parent = body.parent!;
      body.geometry.computeBoundingBox();
      const depth = -body.geometry.boundingBox!.min.y;
      smoke(body, () => true);
      for (const node of parent.children) if (node.name === `${id}__magazine-rounds` || node.name === `${id}__magazine-top-round`) {
        hidden.push([node, node.visible]); node.visible = false;
      }
      add(parent, -.007, depth - .023, -.007, -depth * .14, .0045, depth < .15 ? 20 : 30);
    }
  }
  stacks.set(root, owned);
  for (const stack of owned) updateStack(stack, capacity ?? stack.capacity, capacity ?? stack.capacity);
  return () => {
    if (stacks.get(root) === owned) stacks.delete(root);
    owned.forEach(stack => stack.group.removeFromParent());
    hidden.forEach(([node, visible]) => node.visible = visible);
    replaced.forEach(([mesh, material]) => mesh.material = material);
    resources.forEach(resource => resource.dispose());
  };
}

const transform = new THREE.Object3D();
function updateStack(stack: Stack, rounds: number, capacity: number) {
  capacity = Math.max(1, Math.min(MAX_ROUNDS, Math.floor(capacity)));
  rounds = Math.max(0, Math.min(capacity, Math.floor(rounds)));
  if (stack.rounds === rounds && stack.capacity === capacity) return;
  stack.rounds = rounds; stack.capacity = capacity;
  const pitch = stack.travel / Math.ceil(capacity / 2);
  for (let i = 0; i < rounds; i++) {
    // Staggered columns feed alternately. The top stays at the feed lips as
    // the bottom rises, rather than leaving a gap above the remaining rounds.
    const along = i / 2 * pitch;
    transform.position.set((i % 2 ? 1 : -1) * stack.spread, stack.top - along, stack.z + stack.curve * along / stack.travel);
    transform.updateMatrix(); stack.cases.setMatrixAt(i, transform.matrix);
    transform.position.z -= .022; transform.updateMatrix(); stack.tips.setMatrixAt(i, transform.matrix);
  }
  stack.cases.count = stack.tips.count = rounds;
  stack.cases.instanceMatrix.needsUpdate = stack.tips.instanceMatrix.needsUpdate = true;
  const depth = rounds / 2 * pitch;
  stack.follower.position.set(0, stack.top - depth - .006, stack.z + stack.curve * depth / stack.travel - .005);
}

/** Counts magazine rounds only; the engine subtracts the chambered round. */
export function updateMagazineAmmo(root: THREE.Object3D, rounds: number, capacity: number) {
  for (const stack of stacks.get(root) ?? []) updateStack(stack, rounds, capacity);
}

export function magazineAmmoState(root: THREE.Object3D) {
  return (stacks.get(root) ?? []).filter(stack => {
    for (let node: THREE.Object3D | null = stack.group; node && node !== root; node = node.parent) if (!node.visible) return false;
    return true;
  }).map(stack => ({ rounds: stack.rounds, capacity: stack.capacity, followerY: stack.follower.position.y }));
}
