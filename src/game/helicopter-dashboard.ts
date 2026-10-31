import * as THREE from 'three';
import { VEHICLE_COMBAT, vehicleDamageStage } from './vehicle-combat';
import { createVehicle, type VehicleState } from './vehicle-rules';

const dashboards = new WeakMap<THREE.Object3D, (state: VehicleState, pitch: number) => void>();

/** Two front-seat repeaters and avionics share live vehicle telemetry, not HUD screenshots. */
export function buildHelicopterDashboard() {
  const root = new THREE.Group(); root.name = 'helicopter-dashboard';
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d')!, texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const display = new THREE.Mesh(new THREE.PlaneGeometry(1.72, .35), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  display.name = 'cockpit-avionics'; display.position.set(0, 1.37, -1.609); display.rotation.x = -.18; root.add(display);
  const strip = document.createElement('canvas'); strip.width = 1024; strip.height = 128;
  const ink = strip.getContext('2d')!, repeatTexture = new THREE.CanvasTexture(strip); repeatTexture.colorSpace = THREE.SRGBColorSpace;
  const repeatMaterial = new THREE.MeshBasicMaterial({ map: repeatTexture, toneMapped: false });
  for (const x of [-.49, .49]) {
    const repeater = new THREE.Mesh(new THREE.PlaneGeometry(.44, .08), repeatMaterial);
    repeater.name = 'cockpit-status-display'; repeater.position.set(x, 1.69, -1.72); repeater.rotation.x = -.22; root.add(repeater);
  }
  let previous = '';
  dashboards.set(root, (state, pitchRadians) => {
    const spec = VEHICLE_COMBAT.helicopter, hull = Math.max(0, Math.ceil(state.health)), ammo = Math.max(0, state.ammo);
    const speed = Math.round(Math.abs(state.speed) * 3.6), altitude = Math.max(0, state.y - .13).toFixed(1);
    const heading = String((Math.round(-state.yaw * 180 / Math.PI) % 360 + 360) % 360).padStart(3, '0');
    const climb = state.climb.toFixed(1), pitch = Math.round(pitchRadians * 180 / Math.PI);
    const signature = `${hull}/${ammo}/${speed}/${altitude}/${heading}/${climb}/${pitch}`;
    if (signature === previous) return; previous = signature;
    const critical = ['critical', 'destroyed'].includes(vehicleDamageStage(state));
    const hullColor = critical ? '#ffc18a' : '#b8e9df', ammoColor = ammo ? '#dcece3' : '#ffc18a';
    ink.fillStyle = '#0b171b'; ink.fillRect(0, 0, 1024, 128);
    ink.fillStyle = hullColor; ink.font = '500 23px sans-serif'; ink.fillText(critical ? 'HULL / CAUTION' : 'HULL', 24, 30);
    ink.font = '400 49px sans-serif'; ink.fillText(`${hull} / ${spec.health}`, 24, 89);
    ink.fillStyle = '#28403f'; ink.fillRect(24, 111, 450, 3); ink.fillStyle = hullColor; ink.fillRect(24, 111, 450 * Math.max(0, Math.min(1, hull / spec.health)), 3);
    ink.fillStyle = ammoColor; ink.font = '500 23px sans-serif'; ink.fillText(ammo ? 'CHIN GUN' : 'CHIN GUN / EMPTY', 540, 30);
    ink.font = '400 49px sans-serif'; ink.fillText(`${ammo} / ${spec.ammo}`, 540, 89);
    ink.fillStyle = '#28403f'; ink.fillRect(540, 111, 450, 3); ink.fillStyle = ammoColor; ink.fillRect(540, 111, 450 * Math.max(0, Math.min(1, ammo / spec.ammo)), 3);
    ctx.fillStyle = '#09161b'; ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = '#b8e9df'; ctx.font = '22px sans-serif'; ctx.fillText('FLIGHT / FALCON 01', 24, 33); ctx.fillText('SYSTEMS', 544, 33);
    ctx.fillStyle = '#21424b'; ctx.fillRect(32, 60, 430, 155); ctx.fillStyle = '#24332c'; ctx.fillRect(32, 135 + pitch * 2, 430, 80 - pitch * 2);
    ctx.fillStyle = '#aacbc0'; ctx.fillRect(165, 133 + pitch * 2, 165, 2); ctx.font = '23px sans-serif'; ctx.fillText(`HDG ${heading}°`, 42, 92); ctx.fillText(`${speed} KM/H`, 42, 192); ctx.fillText(`ALT ${altitude} M`, 250, 192);
    ctx.fillStyle = hullColor; ctx.font = '26px sans-serif'; ctx.fillText(`HULL   ${hull} / ${spec.health}`, 544, 90);
    ctx.fillStyle = ammoColor; ctx.fillText(`GUN    ${ammo} / ${spec.ammo}`, 544, 137);
    ctx.fillStyle = '#a1bdb3'; ctx.font = '22px sans-serif'; ctx.fillText(`V/S ${Number(climb) >= 0 ? '+' : ''}${climb} M/S`, 544, 188); ctx.fillText(critical ? 'AIRFRAME CAUTION' : 'TELEMETRY / LIVE', 544, 231);
    texture.needsUpdate = repeatTexture.needsUpdate = true;
    // Plain data also supports diagnostics without retaining canvas or renderer objects.
    root.userData.telemetry = { health: hull, ammo, speed, altitude: Number(altitude), heading: Number(heading), climb: Number(climb), critical };
  });
  dashboards.get(root)!(createVehicle('helicopter', { x: 0, z: 0, yaw: 0 }), 0);
  return root;
}

export function updateHelicopterDashboard(model: THREE.Object3D, state: VehicleState) {
  const dashboard = model.getObjectByName('helicopter-dashboard');
  if (dashboard) dashboards.get(dashboard)?.(state, model.rotation.x);
}
