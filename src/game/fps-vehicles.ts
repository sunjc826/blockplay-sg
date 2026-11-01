import { animateDragonBoat } from './dragon-boat-model';
import { isDragonBoat } from './marina-water';
import { createVehicleImpactMotion, createEmptyImpactPose } from './vehicle-impact';
import { WORLD_VEHICLES } from './world-vehicles';
import { terrainVehicleTilt } from './terrain-vehicle';
import { createVehiclePresentation } from './vehicle-presentation';
import { verticalVehicleObstacles } from './vertical-vehicle-obstacles';
import { getWalkSurfaces, getTraversalObstacles } from './vertical-routes';
import { VEHICLE_SEATS, seatOf, gunnerId, vehicleGunRay, type SharedVehicle } from './vehicle-seats';
import * as THREE from 'three';
import { damageVehicle, fireVehicleWeapon, VEHICLE_COMBAT, vehicleCollisionDamage, vehicleDamageStage, vehicleExitDamage } from './vehicle-combat';
import { createVehicleEffects, vehicleDamageVisual } from './vehicle-effects';
import { disposeModel } from './armory-visuals';
import { buildVehicleModel } from './vehicle-models';
import { updateHumveeInstruments } from './humvee-cabin';
import { updateHelicopterDashboard } from './helicopter-dashboard';
import { VEHICLE_KINDS, vehicleName, paddleVehicle, createVehicle, vehicleSpeed, stopVehicle, driveVehicle, flyVehicle, vehicleBounds, vehicleExit, VEHICLE_SPAWNS, type FlightObstacle, type VehicleKind, type VehicleSpawns, type MotorVehicleKind, type VehicleState, type VehicleWorldBounds, type VehicleExitFloor } from './vehicle-rules';
import { MARINA_BOUNDS, type Obstacle } from './marina-collision';
import { sceneFlightObstacles } from './flight-obstacles';

export function createFpsVehicles(scene: THREE.Scene, obstacles: Obstacle[], skins: Record<MotorVehicleKind, string>, options: { spawns?: VehicleSpawns; bounds?: VehicleWorldBounds; deriveFlightObstacles?: boolean; exitFloor?: VehicleExitFloor; reducedMotion?: () => boolean } = {}) {
  const spawns: VehicleSpawns = options.spawns ?? { car: VEHICLE_SPAWNS.car, helicopter: VEHICLE_SPAWNS.helicopter };
  const keyed = <T>(make: (kind: VehicleKind) => T) => Object.fromEntries(VEHICLE_KINDS.map(kind=>[kind,make(kind)])) as Record<VehicleKind,T>;
  const freshState = (kind: VehicleKind): VehicleState => ({ ...createVehicle(kind,spawns[kind]), despawned: !spawns[kind] });
  const bounds: VehicleWorldBounds = options.bounds ?? MARINA_BOUNDS;
  const drivingObstacles = verticalVehicleObstacles({ bounds, surfaces: getWalkSurfaces(scene), traversalObstacles: getTraversalObstacles(scene) });
  const sceneObstacles = options.deriveFlightObstacles ? sceneFlightObstacles(scene) : null;
  const root = new THREE.Group(); scene.add(root);
  const states = keyed(freshState);
  for(const v of Object.values(states))if(!isDragonBoat(v.kind))v.y=(bounds.groundHeight?.(v.x,v.z)??0)+.13;
  const models = keyed(kind=>buildVehicleModel(kind, isDragonBoat(kind) ? undefined : skins[kind]));
  root.add(...Object.values(models));
  const effects = createVehicleEffects(scene);
  const damageVisuals = keyed(kind=>vehicleDamageVisual(models[kind]));
  const destruction: { kind: VehicleKind; point: THREE.Vector3; occupied: boolean }[] = [];
  const wreckTime = keyed(()=>0);
  const flashTime = keyed(()=>0);
  const impacts = keyed(()=>createVehicleImpactMotion());
  let helicopterPitch = 0;
  function damage(kind: VehicleKind, amount: number) {
    if (states[kind].despawned) return;
    if (damageVehicle(states[kind], amount)) {
      const v = states[kind], point = new THREE.Vector3(v.x, v.y + 1.3, v.z);
      destruction.push({ kind, point, occupied: active === kind }); if (!isDragonBoat(kind)) effects.explode(point);
      if (active === kind) active = null;
      notice = `${vehicleName(kind)} destroyed`; noticeTime = 4;
    }
    sync(0);
  }
  function hitKind(object: THREE.Object3D): VehicleKind | undefined {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
      for(const kind of VEHICLE_KINDS) if(o===models[kind]) return kind;
    }
  }
  function aim(point: THREE.Vector3) {
    if (!active || isDragonBoat(active)) return;
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
  const sharedShots = keyed(()=>0);
  const presentation = keyed(()=>createVehiclePresentation());
  const visual = keyed(kind=>({...states[kind]}));
  let lastSnapshot: SharedVehicle[] | null = null;
  const seat = () => shared ? seatOf(shared, selfId)?.seat ?? null : active ? localSeat : null;
  const canFire = () => !!active && !isDragonBoat(active) && (shared ? gunnerId(shared.find(v => v.kind === active)!) === selfId : localSeat < 2);
  const pad = new THREE.Mesh(new THREE.RingGeometry(5.7, 5.88, 48), new THREE.MeshBasicMaterial({ color: '#d1cfaa', side: THREE.DoubleSide }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(spawns.helicopter.x, .145, spawns.helicopter.z); root.add(pad);
  const paint = new THREE.MeshBasicMaterial({ color: '#d1cfaa' });
  for (const [x, z, w, d] of [[-1, 0, .28, 2.6], [1, 0, .28, 2.6], [0, 0, 2, .28]]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w, .012, d), paint); stripe.position.set(pad.position.x + x, .145, pad.position.z + z); root.add(stripe);
  }
  const labels: Record<VehicleKind, THREE.Sprite> = {} as Record<VehicleKind, THREE.Sprite>;
  for (const kind of VEHICLE_KINDS) {
    if(!spawns[kind]) continue;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#15231fdd'; ctx.fillRect(0, 0, 512, 96); ctx.fillStyle = '#ebdfb4'; ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${vehicleName(kind).toUpperCase()} · ${isDragonBoat(kind) ? 'PADDLE' : kind === 'car' ? 'DRIVE' : 'PILOT'}`, 256, 61);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false })); sprite.scale.set(4.5, .85, 1); labels[kind] = sprite; root.add(sprite);
    // Floating labels are UI, not cover. Sprite raycasts also require a camera,
    // which target-to-player counter-fire rays intentionally do not have.
    sprite.raycast = () => {};
  }
  function footObstacles(except?: VehicleKind) {
    return [...obstacles, ...VEHICLE_KINDS.filter(kind => kind !== except && !states[kind].despawned && states[kind].y < (bounds.groundHeight?.(states[kind].x,states[kind].z)??0)+2).map(kind => vehicleBounds(states[kind]))];
  }
  function airObstacles(includeCar = true): FlightObstacle[] {
    return [
      ...obstacles.map(o => ({ ...o, minY: o.minY??0, maxY: o.maxY ?? 2.5 })),
      ...getTraversalObstacles(scene),
      ...(sceneObstacles ?? [
      { minX: -56, maxX: -24, minZ: 69, maxZ: 83, minY: 4.8, maxY: 6.9 },
      { minX: 140, maxX: 163, minZ: -108, maxZ: 78, minY: 108, maxY: 114 },
      { minX: 21, maxX: 90, minZ: -103, maxZ: -93, minY: 0, maxY: 6.5 },
      { minX: 229, maxX: 286, minZ: -281, maxZ: -253, minY: 0, maxY: 67 },
      ]),
      ...(includeCar && !states.car.despawned ? [{ ...vehicleBounds(states.car), minY: states.car.y, maxY: states.car.y+2.7 }] : []),
    ];
  }
  function nearest(player: { x: number; z: number }) {
    const kinds = VEHICLE_KINDS.filter(kind => (!isDragonBoat(kind) || (()=>{const exit=vehicleExit(states[kind],footObstacles(kind),bounds,options.exitFloor);return exit && Math.hypot(player.x-exit.x,player.z-exit.z)<2;})()) && !states[kind].despawned && states[kind].health > 0 && states[kind].y < (bounds.groundHeight?.(states[kind].x,states[kind].z)??0)+.4 && vehicleSpeed(states[kind]) <= 2 && (!shared || shared.find(v => v.kind === kind)?.occupants.includes(null)));
    return kinds.sort((a, b) => distance(player, a) - distance(player, b)).find(kind => distance(player, kind) <= (kind === 'car' ? 4.5 : 6));
  }
  function distance(player: { x: number; z: number }, kind: VehicleKind) { return states[kind].despawned ? Infinity : Math.hypot(player.x - states[kind].x, player.z - states[kind].z); }
  function interact(player: { x: number; z: number }) {
    if (active) {
      const point = vehicleExit(states[active], footObstacles(active), bounds, options.exitFloor);
      if (!point) { notice = isDragonBoat(active) ? 'Slow to a stop beside a landing to disembark.' : active === 'helicopter' ? 'Land on clear ground and slow down to exit.' : 'Leave clear ground beside the car to exit.'; noticeTime = 3; return null; }
      const exitDamage = vehicleExitDamage(states[active]);
      if (active === 'helicopter') stopVehicle(states[active]);
      active = null; notice = ''; return { ...point, entered: false, yaw: 0, exitDamage };
    }
    const kind = nearest(player);
    if (!kind) { notice = 'Approach a parked vehicle or a boat landing to board.'; noticeTime = 3; return null; }
    active = kind; localSeat = 0; notice = ''; return { x: states[kind].x, y: states[kind].y-.13, z: states[kind].z, entered: true, yaw: states[kind].yaw, exitDamage: 0 };
  }
  function sync(dt: number) {
    for (const kind of VEHICLE_KINDS) {
      const v = shared ? visual[kind] : states[kind], model = models[kind], previousYaw = model.rotation.y; model.position.set(v.x, v.y, v.z); model.rotation.y = v.yaw;
      if (v.health > 0 && !states[kind].despawned) impacts[kind].accept(v.impact, v.yaw);
      else impacts[kind].reset(v.impact?.serial ?? 0);
      impacts[kind].advance(dt);
      const jolt = impacts[kind].sample(options.reducedMotion?.()).body;
      model.position.y += jolt.heave;
      model.visible = !states[kind].despawned;
      if(labels[kind]) {labels[kind].position.set(v.x, v.y + (isDragonBoat(kind) ? 2.5 : kind === 'car' ? 3.3 : 4.4), v.z); labels[kind].visible = !states[kind].despawned && active !== kind && v.health > 0;}
      damageVisuals[kind](vehicleDamageStage(states[kind]));
      if (shared) { const gun = v as SharedVehicle; model.getObjectByName('vehicle-turret')!.rotation.set(gun.gunPitch, gun.gunYaw - gun.yaw, 0, 'YXZ'); }
      model.getObjectByName('vehicle-muzzle-flash')!.visible = flashTime[kind] > 0 && v.health > 0;
      if(isDragonBoat(kind)) animateDragonBoat(model,v.speed,dt,options.reducedMotion?.());
      else if (kind === 'car') {
        const tilt=terrainVehicleTilt(bounds.groundHeight??(()=>0),v.x,v.z,v.yaw);model.rotation.set(tilt.pitch + jolt.pitch,v.yaw,tilt.roll + jolt.roll,'YXZ');
        model.traverse(o => { if (o.name === 'vehicle-wheel') o.rotation.x -= v.speed * dt / .51; });
        updateHumveeInstruments(model, v.speed, dt > 0 ? Math.atan2(Math.sin(v.yaw - previousYaw), Math.cos(v.yaw - previousYaw)) / dt : 0, dt);
      }
      else {
        helicopterPitch = THREE.MathUtils.damp(helicopterPitch, active === kind ? -v.speed * .007 : 0, 3, dt);
        model.rotation.set(helicopterPitch + jolt.pitch, v.yaw, jolt.roll, 'YXZ');
        updateHelicopterDashboard(model, states.helicopter);
        const rotor = model.getObjectByName('main-rotor')!, tail = model.getObjectByName('tail-rotor')!;
        if (active === kind || shared?.find(v => v.kind === kind)?.occupants[0]) { rotor.rotation.y += dt * 34; tail.rotation.x += dt * 51; }
      }
    }
  }
  function advanceWrecks(dt: number) {
    for (const kind of VEHICLE_KINDS) {
      const v = states[kind];
      wreckTime[kind] = v.health <= 0 ? wreckTime[kind] + dt : 0;
      if (v.health <= 0 && wreckTime[kind] >= WORLD_VEHICLES.despawnSeconds) v.despawned = true;
      if (v.despawned) continue;
      if (v.health <= 0 && !isDragonBoat(kind) && v.y > .13) {
        // A wreck falls onto the highest support beneath it, never through a roof.
        const ground = airObstacles().filter(o => o.maxY <= v.y && v.x >= o.minX && v.x <= o.maxX && v.z >= o.minZ && v.z <= o.maxZ).reduce((y, o) => Math.max(y, o.maxY), .13);
        v.climb -= 9.8 * dt; v.y = Math.max(ground, v.y + v.climb * dt);
        if (v.y === ground) v.climb = 0;
      }
    }
  }
  function step(keys: ReadonlySet<string>, dt: number) {
    noticeTime = Math.max(0, noticeTime - dt); if (!noticeTime) notice = '';
    for (const kind of VEHICLE_KINDS) {
      states[kind].weaponCooldown = Math.max(0, states[kind].weaponCooldown - dt);
      flashTime[kind] = Math.max(0, flashTime[kind] - dt);
    }
    advanceWrecks(dt);
    effects.step(dt, Object.values(states));
    // An abandoned Humvee brakes over time instead of freezing at the exit point.
    if ((active !== 'car' || localSeat !== 0) && !states.car.despawned && vehicleSpeed(states.car) > .001) {
      const result = driveVehicle(states.car, 0, 0, true, dt, [...footObstacles('car'), ...drivingObstacles], bounds);
      states.car = result.state;
      const collisionDamage = vehicleCollisionDamage(result.impactSpeed);
      if (collisionDamage > 0) damage('car', collisionDamage);
    }
    for(const kind of VEHICLE_KINDS) if(isDragonBoat(kind) && !states[kind].despawned && (active!==kind || localSeat!==0)) states[kind]=paddleVehicle(states[kind],0,0,false,dt,0,Object.values(states).filter(v=>v.kind!==kind&&!v.despawned).map(vehicleBounds)).state;
    if (!active || localSeat !== 0) { sync(dt); return 0; }
    const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
    const steer = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    const kind = active, beforeYaw = states[kind].yaw;
    const result = isDragonBoat(active) ? paddleVehicle(states[active],forward,steer,keys.has(' '),dt,0,Object.values(states).filter(v=>v.kind!==active&&!v.despawned).map(vehicleBounds)) : active === 'car' ? driveVehicle(states.car, forward, steer, keys.has(' '), dt, [...footObstacles('car'), ...drivingObstacles], bounds) : flyVehicle(states.helicopter, forward, steer, Number(keys.has(' ')) - Number(keys.has('c') || keys.has('control')), keys.has('shift'), dt, airObstacles(), bounds);
    states[active] = result.state;
    if (result.blocked) { notice = isDragonBoat(active) ? 'Water route blocked · reverse or steer clear' : active === 'car' ? 'Route blocked · reverse or steer clear' : 'Airframe clearance · move away from the obstacle'; noticeTime = .5; }
    const collisionDamage = vehicleCollisionDamage(result.impactSpeed);
    if (collisionDamage > 0) damage(kind, collisionDamage);
    sync(dt); return states[kind].yaw - beforeYaw;
  }
  sync(0);
  return {
    root, models, states, footObstacles, interact, step, damage, hitKind, aim, fire, nearest,
    flightObstacles: () => airObstacles(false),
    restoreTravel(state: VehicleState, seatIndex: number) {
      states[state.kind] = structuredClone(state); impacts[state.kind].reset(state.impact?.serial ?? 0); active = state.kind; localSeat = seatIndex; sync(0);
    },
    omit(kinds: readonly VehicleKind[]) { for (const kind of kinds) states[kind].despawned = true; sync(0); },
    get seat() { return seat(); },
    get canFire() { return canFire(); },
    get canUseFirearm() { return active !== null && (seat() ?? 0) >= 2; },
    get viewStates() { return shared ? Object.values(visual) : Object.values(states); },
    get impactView() { return active ? impacts[active].sample(options.reducedMotion?.()) : createEmptyImpactPose(); },
    get viewMounted() { return active ? shared ? visual[active] : states[active] : null; },
    switchSeat() { if (active && !shared) { localSeat = (localSeat + 1) % 4; stopVehicle(states[active]); } },
    setNotice(message: string) { notice = message; noticeTime = 3; },
    adoptShared(next: SharedVehicle[], id: string) {
      const first = shared === null, fresh = next !== lastSnapshot, at = performance.now() / 1000; shared = next; selfId = id; lastSnapshot = next;
      const shots: { kind: VehicleKind; origin: THREE.Vector3; end: THREE.Vector3 }[] = [];
      for (const kind of VEHICLE_KINDS) if (!next.some(v => v.kind === kind)) states[kind].despawned = true;
      for (const v of next) {
        if (first || states[v.kind].despawned || v.health > 0 && states[v.kind].health <= 0 ||
          Math.hypot(v.x - states[v.kind].x, v.y - states[v.kind].y, v.z - states[v.kind].z) > 30)
          impacts[v.kind].reset(v.impact?.serial ?? 0);
        if (!first && !isDragonBoat(v.kind) && states[v.kind].health > 0 && v.health <= 0) effects.explode(new THREE.Vector3(v.x, v.y + 1.3, v.z));
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
      for (const kind of VEHICLE_KINDS) Object.assign(visual[kind], presentation[kind].sample(performance.now() / 1000) ?? states[kind]);
      effects.step(dt, Object.values(states)); sync(dt);
    },
    animateEffects(dt: number) { advanceWrecks(dt); effects.step(dt, Object.values(states)); sync(0); },
    takeDestructions() { return destruction.splice(0); },
    get active() { return active; },
    get mounted() { return active ? states[active] : null; },
    hud(player: { x: number; z: number }, names: Record<string, string> = {}) {
      const near = nearest(player);
      const viewed = active ?? near;
      const nearLabel = near && isDragonBoat(near) ? `Board ${vehicleName(near)}` : near && shared?.find(v => v.kind === near)?.occupants[0] ? `Board ${vehicleName(near)}` : near === 'car' ? 'Drive Utility 01' : 'Pilot Falcon 01';
      return { vehicleSeat: seat(), vehicleCanFire: canFire(), vehicleSeats: active ? VEHICLE_SEATS.map((label, index) => { const occupant = shared?.find(v => v.kind === active)?.occupants[index] ?? (!shared && index === localSeat ? 'you' : null); return { label: isDragonBoat(active!) ? index===0?'Steerer':`Paddler ${index}` : active === 'helicopter' && index === 0 ? 'Pilot' : label, name: occupant ? names[occupant] ?? 'You' : 'Empty', occupied: occupant !== null, self: occupant === selfId || occupant === 'you' }; }) : [], vehicleHealth: viewed ? states[viewed].health : 0, vehicleMaxHealth: viewed ? VEHICLE_COMBAT[viewed].health : 0, vehicleAmmo: viewed ? states[viewed].ammo : 0, vehicleAmmoMax: viewed ? VEHICLE_COMBAT[viewed].ammo : 0, vehicleWeapon: viewed ? VEHICLE_COMBAT[viewed].name : '', vehicleDamage: viewed ? vehicleDamageStage(states[viewed]) : 'intact', vehicle: active || 'on-foot' as const, vehicleHeading: active ? states[active].yaw : 0, vehicleClimb: active ? states[active].climb : 0, vehiclePitch: active === 'helicopter' ? models.helicopter.rotation.x : 0, vehicleSpeed: active ? vehicleSpeed(states[active]) * 3.6 : 0, altitude: active ? Math.max(0, states[active].y - .13) : 0,
        interact: active ? `E · ${isDragonBoat(active) ? 'Disembark' : 'Exit'} ${vehicleName(active)}` : near ? `E · ${nearLabel} · ${Math.ceil(states[near].health)} HP` : '', vehicleNotice: notice,
        carDistance: distance(player, 'car'), helicopterDistance: distance(player, 'helicopter') };
    },
    reset() { impacts.car.reset(); impacts.helicopter.reset(); helicopterPitch = 0; active = null; shared = null; lastSnapshot = null; presentation.car.reset(); presentation.helicopter.reset(); selfId = ''; localSeat = 0; sharedShots.car = sharedShots.helicopter = 0; notice = ''; noticeTime = 0; destruction.length = 0; wreckTime.car = wreckTime.helicopter = 0; effects.reset(); flashTime.car = flashTime.helicopter = 0; for (const model of Object.values(models)) model.getObjectByName('vehicle-turret')!.rotation.set(0, 0, 0); for(const kind of VEHICLE_KINDS){states[kind]=freshState(kind);impacts[kind].reset();presentation[kind].reset();wreckTime[kind]=flashTime[kind]=sharedShots[kind]=0;} for(const v of Object.values(states))if(!isDragonBoat(v.kind))v.y=(bounds.groundHeight?.(v.x,v.z)??0)+.13; models.helicopter.rotation.x = 0; models.car.getObjectByName('humvee-steering-wheel')!.rotation.z = 0; sync(0); },
    dispose() { effects.dispose(); root.removeFromParent(); disposeModel(root); Object.values(labels).forEach(sprite => { sprite.material.map?.dispose(); sprite.material.dispose(); }); },
  };
}
