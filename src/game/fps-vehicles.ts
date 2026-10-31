import { terrainVehicleTilt } from './terrain-vehicle';
import { createVehiclePresentation } from './vehicle-presentation';
import { verticalVehicleObstacles } from './vertical-vehicle-obstacles';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { VEHICLE_SEATS, seatOf, gunnerId, vehicleGunRay, type SharedVehicle } from './vehicle-seats';
import * as THREE from 'three';
import { damageVehicle, fireVehicleWeapon, VEHICLE_COMBAT, vehicleCollisionDamage, vehicleDamageStage } from './vehicle-combat';
import { createVehicleEffects, vehicleDamageVisual } from './vehicle-effects';
import { disposeModel } from './armory-visuals';
import { buildVehicleModel } from './vehicle-models';
import { updateHumveeInstruments } from './humvee-cabin';
import { createVehicle, driveVehicle, flyVehicle, vehicleBounds, vehicleExit, VEHICLE_SPAWNS, type FlightObstacle, type VehicleKind, type VehicleSpawn, type VehicleWorldBounds, type VehicleExitFloor } from './vehicle-rules';
import { MARINA_BOUNDS, type Obstacle } from './marina-collision';
import { sceneFlightObstacles } from './flight-obstacles';

export function createFpsVehicles(scene: THREE.Scene, obstacles: Obstacle[], skins: Record<VehicleKind, string>, options: { spawns?: Record<VehicleKind, VehicleSpawn>; bounds?: VehicleWorldBounds; deriveFlightObstacles?: boolean; exitFloor?: VehicleExitFloor } = {}) {
  const spawns = options.spawns ?? VEHICLE_SPAWNS;
  const bounds: VehicleWorldBounds = options.bounds ?? MARINA_BOUNDS;
  const drivingObstacles = verticalVehicleObstacles({ bounds, surfaces: getWalkSurfaces(scene), traversalObstacles: getTraversalObstacles(scene) });
  const sceneObstacles = options.deriveFlightObstacles ? sceneFlightObstacles(scene) : null;
  const root = new THREE.Group(); scene.add(root);
  const states = { car: createVehicle('car', spawns.car), helicopter: createVehicle('helicopter', spawns.helicopter) };
  for(const v of Object.values(states))v.y=(bounds.groundHeight?.(v.x,v.z)??0)+.13;
  const models = { car: buildVehicleModel('car', skins.car), helicopter: buildVehicleModel('helicopter', skins.helicopter) };
  root.add(models.car, models.helicopter);
  const effects = createVehicleEffects(scene);
  const damageVisuals = { car: vehicleDamageVisual(models.car), helicopter: vehicleDamageVisual(models.helicopter) };
  const destruction: { kind: VehicleKind; point: THREE.Vector3; occupied: boolean }[] = [];
  const flashTime = { car: 0, helicopter: 0 };
  function damage(kind: VehicleKind, amount: number) {
    if (damageVehicle(states[kind], amount)) {
      const v = states[kind], point = new THREE.Vector3(v.x, v.y + 1.3, v.z);
      destruction.push({ kind, point, occupied: active === kind }); effects.explode(point);
      if (active === kind) active = null;
      notice = `${kind === 'car' ? 'Utility 01' : 'Falcon 01'} destroyed`; noticeTime = 4;
    }
    sync(0);
  }
  function hitKind(object: THREE.Object3D): VehicleKind | undefined {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
      if (o === models.car) return 'car';
      if (o === models.helicopter) return 'helicopter';
    }
  }
  function aim(point: THREE.Vector3) {
    if (!active) return;
    const model = models[active], turret = model.getObjectByName('vehicle-turret')!;
    const local = model.worldToLocal(point.clone()).sub(turret.position).normalize();
    const elevation = THREE.MathUtils.clamp(Math.asin(local.y), active === 'car' ? -.26 : -1.05, .65);
    const heading = Math.atan2(-local.x, -local.z);
    turret.rotation.set(elevation, heading, 0, 'YXZ'); model.updateMatrixWorld(true);
  }
  function fire() {
    if (!active || !canFire() || !fireVehicleWeapon(states[active])) return null;
    const kind = active, muzzle = models[kind].getObjectByName('vehicle-muzzle')!;
    const origin = muzzle.getWorldPosition(new THREE.Vector3());
    const direction = new THREE.Vector3(0, 0, -1).transformDirection(muzzle.matrixWorld);
    flashTime[kind] = .06; models[kind].getObjectByName('vehicle-muzzle-flash')!.visible = true;
    return { kind, origin, base: muzzle.parent!.getWorldPosition(new THREE.Vector3()), direction, ...VEHICLE_COMBAT[kind] };
  }
  let active: VehicleKind | null = null, notice = '', noticeTime = 0;
  let shared: SharedVehicle[] | null = null, selfId = '', localSeat = 0;
  const sharedShots = { car: 0, helicopter: 0 };
  const presentation = { car: createVehiclePresentation(), helicopter: createVehiclePresentation() };
  const visual = { car: { ...states.car }, helicopter: { ...states.helicopter } };
  let lastSnapshot: SharedVehicle[] | null = null;
  const seat = () => shared ? seatOf(shared, selfId)?.seat ?? null : active ? localSeat : null;
  const canFire = () => !!active && (shared ? gunnerId(shared.find(v => v.kind === active)!) === selfId : localSeat < 2);
  const pad = new THREE.Mesh(new THREE.RingGeometry(5.7, 5.88, 48), new THREE.MeshBasicMaterial({ color: '#d1cfaa', side: THREE.DoubleSide }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(spawns.helicopter.x, .145, spawns.helicopter.z); root.add(pad);
  const paint = new THREE.MeshBasicMaterial({ color: '#d1cfaa' });
  for (const [x, z, w, d] of [[-1, 0, .28, 2.6], [1, 0, .28, 2.6], [0, 0, 2, .28]]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w, .012, d), paint); stripe.position.set(pad.position.x + x, .145, pad.position.z + z); root.add(stripe);
  }
  const labels: Record<VehicleKind, THREE.Sprite> = {} as Record<VehicleKind, THREE.Sprite>;
  for (const kind of ['car', 'helicopter'] as const) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#15231fdd'; ctx.fillRect(0, 0, 512, 96); ctx.fillStyle = '#ebdfb4'; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(kind === 'car' ? 'UTILITY 01 · DRIVE' : 'FALCON 01 · PILOT', 256, 61);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false })); sprite.scale.set(4.5, .85, 1); labels[kind] = sprite; root.add(sprite);
    // Floating labels are UI, not cover. Sprite raycasts also require a camera,
    // which target-to-player counter-fire rays intentionally do not have.
    sprite.raycast = () => {};
  }
  function footObstacles(except?: VehicleKind) {
    return [...obstacles, ...(['car', 'helicopter'] as const).filter(kind => kind !== except && states[kind].y < (bounds.groundHeight?.(states[kind].x,states[kind].z)??0)+2).map(kind => vehicleBounds(states[kind]))];
  }
  function airObstacles(): FlightObstacle[] {
    return [
      ...obstacles.map(o => ({ ...o, minY: o.minY??0, maxY: o.maxY ?? 2.5 })),
      ...getTraversalObstacles(scene),
      ...(sceneObstacles ?? [
      { minX: -56, maxX: -24, minZ: 69, maxZ: 83, minY: 4.8, maxY: 6.9 },
      { minX: 140, maxX: 163, minZ: -108, maxZ: 78, minY: 108, maxY: 114 },
      { minX: 21, maxX: 90, minZ: -103, maxZ: -93, minY: 0, maxY: 6.5 },
      { minX: 229, maxX: 286, minZ: -281, maxZ: -253, minY: 0, maxY: 67 },
      ]),
      { ...vehicleBounds(states.car), minY: states.car.y, maxY: states.car.y+2.7 },
    ];
  }
  function nearest(player: { x: number; z: number }) {
    const kinds = (['car', 'helicopter'] as const).filter(kind => states[kind].health > 0 && states[kind].y < (bounds.groundHeight?.(states[kind].x,states[kind].z)??0)+.4 && Math.abs(states[kind].speed) <= 2 && (!shared || shared.find(v => v.kind === kind)?.occupants.includes(null)));
    return kinds.sort((a, b) => distance(player, a) - distance(player, b)).find(kind => distance(player, kind) <= (kind === 'car' ? 4.5 : 6));
  }
  function distance(player: { x: number; z: number }, kind: VehicleKind) { return Math.hypot(player.x - states[kind].x, player.z - states[kind].z); }
  function interact(player: { x: number; z: number }) {
    if (active) {
      const point = vehicleExit(states[active], footObstacles(active), bounds, options.exitFloor);
      if (!point) { notice = active === 'helicopter' ? 'Land on clear ground and slow down to exit.' : 'Brake to a stop and leave space beside the car.'; noticeTime = 3; return null; }
      states[active].speed = states[active].climb = 0; active = null; notice = ''; return { ...point, entered: false, yaw: 0 };
    }
    const kind = nearest(player);
    if (!kind) { notice = 'Approach a parked car or helicopter to enter.'; noticeTime = 3; return null; }
    active = kind; localSeat = 0; notice = ''; return { x: states[kind].x, y: states[kind].y-.13, z: states[kind].z, entered: true, yaw: states[kind].yaw };
  }
  function sync(dt: number) {
    for (const kind of ['car', 'helicopter'] as const) {
      const v = shared ? visual[kind] : states[kind], model = models[kind], previousYaw = model.rotation.y; model.position.set(v.x, v.y, v.z); model.rotation.y = v.yaw;
      labels[kind].position.set(v.x, v.y + (kind === 'car' ? 3.3 : 4.4), v.z); labels[kind].visible = active !== kind && v.health > 0;
      damageVisuals[kind](vehicleDamageStage(states[kind]));
      if (shared) { const gun = v as SharedVehicle; model.getObjectByName('vehicle-turret')!.rotation.set(gun.gunPitch, gun.gunYaw - gun.yaw, 0, 'YXZ'); }
      model.getObjectByName('vehicle-muzzle-flash')!.visible = flashTime[kind] > 0 && v.health > 0;
      if (kind === 'car') {
        const tilt=terrainVehicleTilt(bounds.groundHeight??(()=>0),v.x,v.z,v.yaw);model.rotation.set(tilt.pitch,v.yaw,tilt.roll,'YXZ');
        model.traverse(o => { if (o.name === 'vehicle-wheel') o.rotation.x -= v.speed * dt / .51; });
        updateHumveeInstruments(model, v.speed, dt > 0 ? Math.atan2(Math.sin(v.yaw - previousYaw), Math.cos(v.yaw - previousYaw)) / dt : 0, dt);
      }
      else {
        model.rotation.x = THREE.MathUtils.damp(model.rotation.x, active === kind ? -v.speed * .007 : 0, 3, dt);
        const rotor = model.getObjectByName('main-rotor')!, tail = model.getObjectByName('tail-rotor')!;
        if (active === kind || shared?.find(v => v.kind === kind)?.occupants[0]) { rotor.rotation.y += dt * 34; tail.rotation.x += dt * 51; }
      }
    }
  }
  function advanceWrecks(dt: number) {
    for (const kind of ['car', 'helicopter'] as const) {
      const v = states[kind];
      if (v.health <= 0 && v.y > .13) {
        // A wreck falls onto the highest support beneath it, never through a roof.
        const ground = airObstacles().filter(o => o.maxY <= v.y && v.x >= o.minX && v.x <= o.maxX && v.z >= o.minZ && v.z <= o.maxZ).reduce((y, o) => Math.max(y, o.maxY), .13);
        v.climb -= 9.8 * dt; v.y = Math.max(ground, v.y + v.climb * dt);
        if (v.y === ground) v.climb = 0;
      }
    }
  }
  function step(keys: ReadonlySet<string>, dt: number) {
    noticeTime = Math.max(0, noticeTime - dt); if (!noticeTime) notice = '';
    for (const kind of ['car', 'helicopter'] as const) {
      states[kind].weaponCooldown = Math.max(0, states[kind].weaponCooldown - dt);
      flashTime[kind] = Math.max(0, flashTime[kind] - dt);
    }
    advanceWrecks(dt);
    effects.step(dt, Object.values(states));
    if (!active || localSeat !== 0) { sync(dt); return 0; }
    const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
    const steer = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    const kind = active, beforeYaw = states[kind].yaw;
    const result = active === 'car' ? driveVehicle(states.car, forward, steer, keys.has(' '), dt, [...footObstacles('car'), ...drivingObstacles], bounds) : flyVehicle(states.helicopter, forward, steer, Number(keys.has(' ')) - Number(keys.has('c') || keys.has('control')), keys.has('shift'), dt, airObstacles(), bounds);
    states[active] = result.state;
    if (result.blocked) { notice = active === 'car' ? 'Route blocked · reverse or steer clear' : 'Airframe clearance · move away from the obstacle'; noticeTime = .5; }
    const collisionDamage = vehicleCollisionDamage(result.impactSpeed);
    if (collisionDamage > 0) damage(kind, collisionDamage);
    sync(dt); return states[kind].yaw - beforeYaw;
  }
  sync(0);
  return {
    root, models, states, footObstacles, interact, step, damage, hitKind, aim, fire, nearest,
    flightObstacles: () => airObstacles().slice(0, -1),
    get seat() { return seat(); },
    get canFire() { return canFire(); },
    get canUseFirearm() { return active !== null && (seat() ?? 0) >= 2; },
    get viewStates() { return shared ? Object.values(visual) : Object.values(states); },
    get viewMounted() { return active ? shared ? visual[active] : states[active] : null; },
    switchSeat() { if (active && !shared) { localSeat = (localSeat + 1) % 4; states[active].speed = states[active].climb = 0; } },
    setNotice(message: string) { notice = message; noticeTime = 3; },
    adoptShared(next: SharedVehicle[], id: string) {
      const first = shared === null, fresh = next !== lastSnapshot, at = performance.now() / 1000; shared = next; selfId = id; lastSnapshot = next;
      const shots: { kind: VehicleKind; origin: THREE.Vector3; end: THREE.Vector3 }[] = [];
      for (const v of next) {
        if (!first && states[v.kind].health > 0 && v.health <= 0) effects.explode(new THREE.Vector3(v.x, v.y + 1.3, v.z));
        if (!first && v.shots > sharedShots[v.kind] && v.shotEnd) {
          flashTime[v.kind] = .085; const ray = vehicleGunRay({ ...v });
          shots.push({ kind: v.kind, origin: new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z), end: new THREE.Vector3(v.shotEnd.x, v.shotEnd.y, v.shotEnd.z) });
        }
        sharedShots[v.kind] = v.shots; Object.assign(states[v.kind], v);
        if (fresh) presentation[v.kind].accept(v, at);
        Object.assign(visual[v.kind], presentation[v.kind].sample(at) ?? v);
      }
      active = seatOf(next, id)?.vehicle.kind ?? null; sync(0); return shots;
    },
    sharedStep(dt: number) {
      noticeTime = Math.max(0, noticeTime - dt); if (!noticeTime) notice = '';
      flashTime.car = Math.max(0, flashTime.car - dt); flashTime.helicopter = Math.max(0, flashTime.helicopter - dt);
      for (const kind of ['car', 'helicopter'] as const) Object.assign(visual[kind], presentation[kind].sample(performance.now() / 1000) ?? states[kind]);
      effects.step(dt, Object.values(states)); sync(dt);
    },
    animateEffects(dt: number) { advanceWrecks(dt); effects.step(dt, Object.values(states)); sync(0); },
    takeDestructions() { return destruction.splice(0); },
    get active() { return active; },
    get mounted() { return active ? states[active] : null; },
    hud(player: { x: number; z: number }, names: Record<string, string> = {}) {
      const near = nearest(player);
      const viewed = active ?? near;
      const nearLabel = near && shared?.find(v => v.kind === near)?.occupants[0] ? `Board ${near === 'car' ? 'Utility 01' : 'Falcon 01'}` : near === 'car' ? 'Drive Utility 01' : 'Pilot Falcon 01';
      return { vehicleSeat: seat(), vehicleCanFire: canFire(), vehicleSeats: active ? VEHICLE_SEATS.map((label, index) => { const occupant = shared?.find(v => v.kind === active)?.occupants[index] ?? (!shared && index === localSeat ? 'you' : null); return { label: active === 'helicopter' && index === 0 ? 'Pilot' : label, name: occupant ? names[occupant] ?? 'You' : 'Empty', occupied: occupant !== null, self: occupant === selfId || occupant === 'you' }; }) : [], vehicleHealth: viewed ? states[viewed].health : 0, vehicleMaxHealth: viewed ? VEHICLE_COMBAT[viewed].health : 0, vehicleAmmo: viewed ? states[viewed].ammo : 0, vehicleAmmoMax: viewed ? VEHICLE_COMBAT[viewed].ammo : 0, vehicleWeapon: viewed ? VEHICLE_COMBAT[viewed].name : '', vehicleDamage: viewed ? vehicleDamageStage(states[viewed]) : 'intact', vehicle: active || 'on-foot' as const, vehicleHeading: active ? states[active].yaw : 0, vehicleClimb: active ? states[active].climb : 0, vehiclePitch: active === 'helicopter' ? models.helicopter.rotation.x : 0, vehicleSpeed: active ? Math.abs(states[active].speed) * 3.6 : 0, altitude: active ? Math.max(0, states[active].y - .13) : 0,
        interact: active ? `E · Exit ${active}` : near ? `E · ${nearLabel} · ${Math.ceil(states[near].health)} HP` : '', vehicleNotice: notice,
        carDistance: distance(player, 'car'), helicopterDistance: distance(player, 'helicopter') };
    },
    reset() { active = null; shared = null; lastSnapshot = null; presentation.car.reset(); presentation.helicopter.reset(); selfId = ''; localSeat = 0; sharedShots.car = sharedShots.helicopter = 0; notice = ''; noticeTime = 0; destruction.length = 0; effects.reset(); flashTime.car = flashTime.helicopter = 0; for (const model of Object.values(models)) model.getObjectByName('vehicle-turret')!.rotation.set(0, 0, 0); states.car = createVehicle('car', spawns.car); states.helicopter = createVehicle('helicopter', spawns.helicopter); for(const v of Object.values(states))v.y=(bounds.groundHeight?.(v.x,v.z)??0)+.13; models.helicopter.rotation.x = 0; models.car.getObjectByName('humvee-steering-wheel')!.rotation.z = 0; sync(0); },
    dispose() { effects.dispose(); root.removeFromParent(); disposeModel(root); Object.values(labels).forEach(sprite => { sprite.material.map?.dispose(); sprite.material.dispose(); }); },
  };
}
