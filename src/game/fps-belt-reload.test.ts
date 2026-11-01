import * as THREE from 'three';
import { expect, it } from 'vitest';
import { buildServiceWeapon } from './service-weapon-models';
import { createWeaponHandling } from './fps-viewmodel';
import { FPS_WEAPONS, reloadLength } from './fps-rules';
import { disposeModel } from './armory-visuals';

function bounds(object: THREE.Object3D) {
  object.updateWorldMatrix(true, true);
  const inverse = object.matrixWorld.clone().invert(), box = new THREE.Box3();
  object.traverseVisible(node => { if (node instanceof THREE.Mesh) {
    node.geometry.computeBoundingBox();
    box.union(node.geometry.boundingBox!.clone().applyMatrix4(inverse.clone().multiply(node.matrixWorld)));
  } });
  return box;
}
function fixture(family: number) {
  const spec = FPS_WEAPONS[family], model = buildServiceWeapon(spec.id)!, parent = new THREE.Group(); parent.add(model);
  parent.position.set(.12, -.08, -.25); parent.rotation.set(.12, -.25, .2); parent.scale.setScalar(1.15);
  const sourceParent = new THREE.Group(), source = new THREE.Group(); sourceParent.add(source);
  sourceParent.position.set(-.25, -.14, .12); sourceParent.rotation.set(.1, .2, -.1); source.scale.set(.9, 1.1, 1);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(.085, .095, .072)); mesh.position.set(0, .027, -.012); source.add(mesh);
  const input = { model: source, worldToView: new THREE.Matrix4().makeRotationY(.12), shoulder: new THREE.Vector3(-.2, .32, .2) };
  const magazine = model.getObjectByName(`${spec.id}__magazine`)!, rounds = model.getObjectsByProperty('name', `${spec.id}__belt-round`);
  const cover = model.getObjectByName(`${spec.id}__feed-cover`)!, latch = model.getObjectByName(`${spec.id}__cover-latch`)!;
  model.updateWorldMatrix(true, true); magazine.updateMatrix();
  const mouth = rounds[0].position.clone().applyMatrix4(magazine.matrix.clone().invert());
  const well = bounds(magazine), sourceBounds = bounds(source);
  const normalizedMouth = mouth.clone().sub(well.getCenter(new THREE.Vector3())).divide(well.getSize(new THREE.Vector3()));
  const mouthInSource = normalizedMouth.multiply(sourceBounds.getSize(new THREE.Vector3())).add(sourceBounds.getCenter(new THREE.Vector3()));
  const lengths = rounds.slice(1).map((round, i) => round.position.distanceTo(rounds[i].position));
  const handling = createWeaponHandling(model, family);
  function render(time: number, empty = false, partial = spec.capacity, paused = false) {
    const pending = time >= .47 && time < .74;
    source.visible = time < .47;
    const reload = { source: input, magazineOut: time >= .38 && time < .74, pending, capacity: spec.capacity,
      baseCapacity: spec.capacity, saved: time / reloadLength(empty) };
    handling.update(paused ? null : time / reloadLength(empty), empty, undefined, undefined, reload,
      { rounds: time < .38 ? partial : time < .74 ? 0 : spec.capacity, capacity: spec.capacity });
    model.updateWorldMatrix(true, true);
    return reload;
  }
  return { spec, model, source, input, magazine, rounds, cover, latch, handling, lengths, mouthInSource, render,
    done: () => { handling.dispose(); disposeModel(model); disposeModel(sourceParent); } };
}

for (const family of [3, 4, 7]) {
  const name = FPS_WEAPONS[family].name;
  it(`${name}: attaches the belt to the actual carried box through projection, rotation and box fitting`, () => {
    const f = fixture(family);
    for (const pitch of [-1.1, 0, .7]) for (const time of [.47, .49, .53, .57, .60, .63, .63999]) {
      f.input.worldToView.makeScale(.86, .86, 1).multiply(new THREE.Matrix4().makeRotationX(pitch));
      f.render(time);
      const carried = f.model.getObjectByName('reload-carried-magazine')!;
      expect(carried.visible).toBe(true); expect(f.magazine.visible).toBe(false);
      const expected = carried.localToWorld(f.mouthInSource.clone());
      expect(f.rounds[0].getWorldPosition(new THREE.Vector3()).distanceTo(expected)).toBeLessThan(1e-6);
      expect(f.handling.beltReload?.carried).toBe(true);
    }
    f.render(.64); expect(f.magazine.visible).toBe(true);
    expect(f.model.getObjectByName('reload-carried-magazine')!.visible).toBe(false);
    f.done();
  });
  it(`${name}: preserves link lengths and box/hand/tray contact throughout tactical and empty reloads`, () => {
    const f = fixture(family);
    for (const empty of [false, true]) for (const partial of [0, 2, f.spec.capacity]) {
      for (let time = 0; time <= 1; time += .005) {
        f.render(time, empty, partial);
        const debug = f.handling.beltReload!;
        expect(debug.spacingError, `${time}: fixed links`).toBeLessThan(1e-6);
        if (debug.handError !== null) expect(debug.handError, `${time}: hand contact`).toBeLessThan(1e-6);
        if (debug.carried || debug.phase === 'lay-belt' || debug.phase === 'grasp-belt') {
          expect(new THREE.Vector3().fromArray(debug.firstRound!).distanceTo(new THREE.Vector3().fromArray(debug.boxAnchor))).toBeLessThan(1e-6);
        }
        f.rounds.forEach((round, i) => {
          expect(round.position.toArray().every(Number.isFinite)).toBe(true);
          if (i && round.visible && f.rounds[i - 1].visible)
            expect(Math.abs(round.position.distanceTo(f.rounds[i - 1].position) - f.lengths[i - 1])).toBeLessThan(1e-6);
        });
      }
    }
    for (const time of [.12, .16, .72, .735]) {
      f.render(time);
      const contact = f.model.getObjectByName('belt-hand-contact')!.getWorldPosition(new THREE.Vector3());
      expect(contact.distanceTo(f.latch.localToWorld(new THREE.Vector3(0, .007, 0)))).toBeLessThan(1e-6);
    }
    f.done();
  });
  it(`${name}: keeps handoff continuous and holds an interrupted carry without leaving a floating belt`, () => {
    const f = fixture(family);
    f.render(.63999); const before = f.rounds.map(round => round.position.clone());
    f.render(.64001); f.rounds.forEach((round, i) => expect(round.position.distanceTo(before[i]), `round ${i}: ${before[i].toArray()} -> ${round.position.toArray()}`).toBeLessThan(.0001));
    f.render(.55, true); const paused = f.rounds.map(round => round.position.clone());
    f.render(.55, true, f.spec.capacity, true);
    f.rounds.forEach((round, i) => expect(round.position.distanceTo(paused[i])).toBeLessThan(1e-9));
    f.handling.update(null, false, undefined, undefined, undefined, { rounds: 0, capacity: f.spec.capacity });
    expect(f.handling.beltAmmo?.visible).toBe(0);
    expect(f.model.getObjectByName('pouch-reload')!.visible).toBe(false);
    f.render(.55, true); f.rounds.forEach((round, i) => expect(round.position.distanceTo(paused[i])).toBeLessThan(1e-9));
    f.done();
  });
  it(`${name}: anchors to the physical box rather than its stowed handle/belt decorations`, () => {
    const f = fixture(family), decoration = new THREE.Mesh(new THREE.BoxGeometry(.1, .4, .1));
    decoration.name = 'stowed-belt'; decoration.position.y = 1; decoration.userData.pouchDecoration = true; f.source.add(decoration);
    f.render(.55);
    const carried = f.model.getObjectByName('reload-carried-magazine')!;
    expect(carried.getObjectByName('stowed-belt')!.visible).toBe(false);
    expect(decoration.visible).toBe(true);
    const actual = carried.worldToLocal(f.rounds[0].getWorldPosition(new THREE.Vector3()));
    expect(actual.y).toBeGreaterThan(.07); expect(actual.y).toBeLessThan(.085);
    f.done();
  });
  it(`${name}: racks with the right hand while the left supports the gun, then restores both grips`, () => {
    const f = fixture(family), right = f.model.getObjectByName('reload-hand-right')!, left = f.model.getObjectByName('reload-hand-left')!;
    const handle = f.model.getObjectByName(`${f.spec.id}__charging-handle`)!;
    f.handling.update(null, false);
    const home = right.position.clone(), rotation = right.quaternion.clone(), support = left.position.clone(), leftRotation = left.quaternion.clone();
    const handleZ = handle.position.z;
    const receiver = f.model.getObjectByName(`${f.spec.id}__receiver`)!;
    const palm = right.children[0] as THREE.Mesh, inverse = new THREE.Matrix4();
    palm.geometry.computeBoundingBox();
    // Check the path as well as the endpoints: the palm must go around the
    // solid receiver during both the reach and the return to the firing grip.
    for (let time = .80; time <= 1.32; time += .005) {
      f.render(time, true); inverse.copy(f.model.matrixWorld).invert();
      const palmBox = palm.geometry.boundingBox!.clone().applyMatrix4(inverse.clone().multiply(palm.matrixWorld));
      const receiverBox = bounds(receiver).applyMatrix4(inverse.clone().multiply(receiver.matrixWorld));
      expect(palmBox.intersectsBox(receiverBox), `${time}: palm clears receiver`).toBe(false);
    }
    for (const time of [.94, .99, 1.04, 1.10, 1.16, 1.18]) {
      f.render(time, true);
      expect(right.position.x).toBeGreaterThan(handle.position.x + .03);
      expect(right.position.z - handle.position.z).toBeCloseTo(.01, 10);
      expect(right.position.y - handle.position.y).toBeCloseTo(.01, 10);
      expect(left.position.distanceTo(support)).toBeLessThan(1e-9);
      expect(left.quaternion.angleTo(leftRotation)).toBeLessThan(1e-7);
    }
    expect(handle.position.z).toBeGreaterThan(handleZ);
    // Both the initial rack and an interrupted/restarted reload are deterministic.
    f.handling.update(null, false, undefined, .48);
    expect(right.position.x).toBeGreaterThan(handle.position.x);
    expect(right.position.z - handle.position.z).toBeCloseTo(.01, 10);
    expect(left.position.distanceTo(support)).toBeLessThan(1e-9);
    for (const time of [.94, 1]) {
      f.render(time, false);
      expect(right.position.distanceTo(home)).toBeLessThan(1e-9);
    }
    f.render(1.05, true); f.handling.update(null, false);
    expect(right.position.distanceTo(home)).toBeLessThan(1e-9);
    expect(right.quaternion.angleTo(rotation)).toBeLessThan(1e-7);
    expect(handle.position.z).toBe(handleZ);
    f.render(1.05, true);
    expect(right.position.z - handle.position.z).toBeCloseTo(.01, 10);
    f.render(reloadLength(true), true);
    expect(right.position.distanceTo(home)).toBeLessThan(1e-9);
    f.done();
  });
}
