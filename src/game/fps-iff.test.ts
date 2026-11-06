import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { arenaCharacterLook } from './character-looks';
import { createCharacterRig } from './character-rig';
import { characterBounds, characterPoints, createIffTracker, IFF_COLOURS, IFF_SCAN_SECONDS, projectBox, zoomedBox, type IffScope, type IffSubject } from './fps-iff';
import { scopeFov } from './weapon-optics';
import { advanceVision, createVisionState, cycleVisionPalette, iffActive, iffOnly, nvgAimingActive, stepVisionButton, toggleVision, visionGain, visionHasPicture, visionModelKey, visionViews, VISION_DEVICES } from './vision-devices';

const camera = () => {
  const c = new THREE.PerspectiveCamera(70, 16 / 9, .05, 500); c.position.set(0, 1.6, 0); c.lookAt(0, 1.6, -1);
  c.updateMatrixWorld(true); c.updateProjectionMatrix(); return c;
};
const soldier = (scene: THREE.Scene, x: number, z: number) => {
  const rig = createCharacterRig(arenaCharacterLook({ bot: true, role: 'rifle', id: `bot-${x}-${z}` }), `soldier-${x}-${z}`);
  rig.root.position.set(x, 0, z); scene.add(rig.root); scene.updateMatrixWorld(true); return rig.root;
};
const subject = (id: string, side: IffSubject['side'], root: THREE.Object3D): IffSubject =>
  ({ id, side, root, points: characterPoints(root), bounds: out => characterBounds(root, out) });

describe('IFF devices', () => {
  it('sells a plain reader and a tube with one, the tube no worse than the NV-3 it carries', () => {
    const reader = VISION_DEVICES['iff-1'], tube = VISION_DEVICES['nvg-iff'], plain = VISION_DEVICES['nvg-gen3'];
    expect(reader.kind).toBe('iff'); expect(reader.iff?.range).toBeGreaterThan(0);
    expect(visionHasPicture(reader)).toBe(false); expect(visionGain(reader, 1)).toBe(1);
    expect(tube.kind).toBe('nvg'); expect(tube.iff!.range).toBeGreaterThan(reader.iff!.range);
    for (const key of ['gain', 'noise', 'aperture', 'blur', 'halo'] as const) expect(tube[key]).toBe(plain[key]);
    expect(plain.iff).toBeUndefined();
    expect(visionModelKey(tube)).not.toBe(visionModelKey(plain));
    expect(new Set(Object.values(IFF_COLOURS)).size).toBe(3);
  });
  it('shows boxes only once the reader is lowered and warm', () => {
    const spec = VISION_DEVICES['iff-1'], state = createVisionState();
    expect(iffActive(spec, state)).toBe(false);
    toggleVision(state, spec); advanceVision(state, spec, .5);
    expect(iffActive(spec, state)).toBe(false);
    advanceVision(state, spec, 5);
    expect(iffActive(spec, state)).toBe(true);
    expect(iffActive(VISION_DEVICES['nvg-gen3'], { ...state })).toBe(false);
    toggleVision(state, spec); expect(iffActive(spec, state)).toBe(false);
  });
  it('switches the NV-3X between tube + IFF and IFF only with J, crossfading the tube', () => {
    const spec = VISION_DEVICES['nvg-iff'], state = createVisionState();
    expect(visionViews(spec)).toBe(2); expect(visionViews(VISION_DEVICES['nvg-gen3'])).toBe(1); expect(visionViews(VISION_DEVICES['iff-1'])).toBe(1);
    expect(cycleVisionPalette(state, spec)).toBe(false);
    toggleVision(state, spec); advanceVision(state, spec, 5);
    expect(state.tube).toBe(1); expect(nvgAimingActive(spec, state)).toBe(true);
    expect(cycleVisionPalette(state, spec)).toBe(true); expect(iffOnly(spec, state)).toBe(true);
    // Fades over the tube's shutdown, the boxes staying up throughout.
    advanceVision(state, spec, spec.shutdown / 2);
    expect(state.tube).toBeCloseTo(.5); expect(iffActive(spec, state)).toBe(true);
    advanceVision(state, spec, spec.shutdown);
    expect(state.tube).toBe(0); expect(nvgAimingActive(spec, state)).toBe(false); expect(iffActive(spec, state)).toBe(true);
    // Back on: the picture comes up over the warm-up, without the device restarting.
    cycleVisionPalette(state, spec); advanceVision(state, spec, spec.warmup / 2);
    expect(state.tube).toBeCloseTo(.5); expect(state.warm).toBe(1);
    // Switched off from IFF only, there is no tube picture left to die.
    cycleVisionPalette(state, spec); advanceVision(state, spec, 5); toggleVision(state, spec);
    expect(state.fading).toBe(0);
    // N back on keeps the mode the wearer left it in.
    toggleVision(state, spec); expect(iffOnly(spec, state)).toBe(true); expect(state.tube).toBe(0);
  });
  it('walks the touch button off, tube + IFF, IFF only, off', () => {
    const spec = VISION_DEVICES['nvg-iff'], state = createVisionState(), seen: string[] = [];
    for (let i = 0; i < 4; i++) { stepVisionButton(state, spec); seen.push(!state.on ? 'off' : iffOnly(spec, state) ? 'iff' : 'tube'); }
    expect(seen).toEqual(['tube', 'iff', 'off', 'tube']);
  });
});

describe('IFF boxes', () => {
  it('boxes a standing figure from feet to over its head, and leaves out tags floating above it', () => {
    const scene = new THREE.Scene(), root = soldier(scene, 0, -10);
    const tag = new THREE.Mesh(new THREE.BoxGeometry(1.6, .3, .01)); tag.position.y = 2.23; root.add(tag); scene.updateMatrixWorld(true);
    const box = characterBounds(root, new THREE.Box3());
    expect(box.min.y).toBeLessThan(.05); expect(box.max.y).toBeGreaterThan(1.75); expect(box.max.y).toBeLessThan(2.1);
    expect(box.max.x - box.min.x).toBeGreaterThan(.35); expect(box.max.x - box.min.x).toBeLessThan(1.2);
  });
  it('projects a box ahead onto the screen, keeps a far one readable, and drops one behind', () => {
    const c = camera(), near = new THREE.Box3(new THREE.Vector3(-.3, 0, -10.3), new THREE.Vector3(.3, 1.9, -9.7));
    const shown = projectBox(near, c)!;
    expect(shown.x0).toBeLessThan(0); expect(shown.x1).toBeGreaterThan(0); expect(shown.y1).toBeGreaterThan(shown.y0);
    const far = projectBox(near.clone().translate(new THREE.Vector3(0, 0, -400)), c, .04)!;
    expect(far.y1 - far.y0).toBeCloseTo(.04, 5); expect((far.x1 - far.x0) * c.aspect).toBeCloseTo(.04, 5);
    expect(projectBox(near.clone().translate(new THREE.Vector3(0, 0, 20)), c)).toBeNull();
    expect(projectBox(near.clone().translate(new THREE.Vector3(40, 0, 0)), c)).toBeNull();
  });
  it('boxes only who it can see, within range, and follows them between scans', () => {
    const scene = new THREE.Scene(), c = camera();
    const enemy = soldier(scene, -1, -12), ally = soldier(scene, 1.5, -12), hidden = soldier(scene, 6, -14), far = soldier(scene, 0, -95);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 4, .3), new THREE.MeshBasicMaterial()); wall.position.set(4.4, 2, -10); scene.add(wall);
    scene.updateMatrixWorld(true);
    // Rebuilt each frame in the engine, so the aim points are where the bodies are.
    const subjects = () => [subject('enemy', 'enemy', enemy), subject('ally', 'ally', ally), subject('hidden', 'neutral', hidden), subject('far', 'enemy', far)];
    const tracker = createIffTracker();
    const boxes = tracker.update(0, c, scene, subjects(), 80).boxes;
    expect(boxes.map(b => `${b.side}:${b.id}`).sort()).toEqual(['ally:ally', 'enemy:enemy']);
    const before = boxes.find(b => b.id === 'enemy')!;
    // Between scans the box moves with the body without a new sight check.
    enemy.position.x -= 1; scene.updateMatrixWorld(true);
    const moved = tracker.update(IFF_SCAN_SECONDS / 4, c, scene, subjects(), 80).boxes.find(b => b.id === 'enemy')!;
    expect(moved.x0).toBeLessThan(before.x0);
    // A longer reader reaches the far figure; switching off forgets everyone.
    tracker.reset();
    expect(tracker.update(0, c, scene, subjects(), 120).boxes.map(b => b.id).sort()).toEqual(['ally', 'enemy', 'far']);
  });

  /** A 4x scope held centred, as at full aim: its lens 0.2 m ahead of a view camera, a quarter of the view's height across. */
  const scoped = (main: THREE.PerspectiveCamera, magnification = 4, roll = 0): IffScope => {
    const viewCamera = new THREE.PerspectiveCamera(main.fov, main.aspect, .01, 10); viewCamera.updateMatrixWorld(true);
    const radius = .2 * Math.tan(THREE.MathUtils.degToRad(main.fov / 2)) * .25;
    const lens = new THREE.Object3D(); lens.position.set(0, 0, -.2); lens.rotation.z = roll; lens.updateMatrixWorld(true);
    const camera = main.clone(); camera.aspect = 1; camera.fov = scopeFov(main.fov, .25, magnification); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    return { camera, lens, radius, viewCamera, visibility: 1 };
  };
  it('draws a zoomed box on the lens where the magnified body is, and reads who the reticle is on', () => {
    const scene = new THREE.Scene(), c = camera(), scope = scoped(c);
    const ahead = soldier(scene, 0, -60), aside = soldier(scene, 1.4, -60);
    const flat = projectBox(characterBounds(ahead, new THREE.Box3()), c, 0)!;
    const zoomed = zoomedBox(characterBounds(ahead, new THREE.Box3()), scope)!;
    // About four times the unmagnified box, centred on the lens like the body on the reticle.
    expect((zoomed.y1 - zoomed.y0) / (flat.y1 - flat.y0)).toBeCloseTo(4, 0);
    expect(zoomed.onReticle).toBe(true);
    const side = zoomedBox(characterBounds(aside, new THREE.Box3()), scope)!;
    expect(side.onReticle).toBe(false); expect(side.x0).toBeGreaterThan(zoomed.x1);
    const tracker = createIffTracker();
    const frame = tracker.update(0, c, scene, [subject('ahead', 'ally', ahead), subject('aside', 'enemy', aside)], 80, scope);
    expect(frame.boxes.filter(b => b.zoomed).map(b => b.id).sort()).toEqual(['ahead', 'aside']);
    expect(frame.boxes.filter(b => !b.zoomed)).toHaveLength(2);
    expect(frame.aim).toBe('ally');
    expect(frame.lens).toMatchObject({ x: expect.closeTo(0, 5), y: expect.closeTo(0, 5), visibility: 1 });
    // Not looking through it: no lens, no zoomed boxes.
    expect(tracker.update(0, c, scene, [subject('ahead', 'ally', ahead)], 80, { ...scope, visibility: 0 })).toMatchObject({ lens: null, aim: null });
  });
  it('follows a rolled lens', () => {
    const scene = new THREE.Scene(), c = camera(), body = soldier(scene, 1.4, -60);
    const upright = zoomedBox(characterBounds(body, new THREE.Box3()), scoped(c))!, rolled = zoomedBox(characterBounds(body, new THREE.Box3()), scoped(c, 4, Math.PI / 2))!;
    // A quarter turn carries the box from the right of the reticle to above it, lying on its side.
    expect(upright.x0).toBeGreaterThan(0); expect(rolled.y0).toBeGreaterThan(0);
    expect((rolled.x1 - rolled.x0) * c.aspect).toBeCloseTo(upright.y1 - upright.y0, 2);
    expect(rolled.y1 - rolled.y0).toBeCloseTo((upright.x1 - upright.x0) * c.aspect, 2);
  });
});
