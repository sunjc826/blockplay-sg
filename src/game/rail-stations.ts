import type * as THREE from 'three';
import type { RailRoute } from './rail-routes';

interface StationKit {
  box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material): THREE.Mesh;
  sign(text: string, x: number, y: number, z: number, w: number, h: number, color?: string): THREE.Mesh | undefined;
}
/** Small authored terminal platforms. Kept above ground so existing streets remain clear.
 * They are scenery, like the trains; no new ground-level collision envelopes. */
export function addRailTerminals(kit: StationKit, route: RailRoute, materials: { platform: THREE.Material; roof: THREE.Material; warning: THREE.Material; dark: THREE.Material }, names: readonly [string | null, string | null]) {
  const { platform, roof, warning, dark } = materials;
  const place = (s: number, y: number, c: number, length: number, height: number, width: number, material: THREE.Material) => route.axis === 'x'
    ? kit.box(s, y, c, length, height, width, material)
    : kit.box(c, y, s, width, height, length, material);
  const stops = [Math.min(...route.stops), Math.max(...route.stops)];
  stops.forEach((s, i) => {
    const name = names[i]; if (!name) return;
    const length = route.halfLength * 2 + 6, side = route.cross + route.halfWidth + 2.2;
    place(s, route.railY + .4, side, length, .5, 3.2, platform);
    place(s, route.railY + .68, side - 1.35, length, .06, .22, warning);
    place(s, route.railY + 5.5, side, length + 2, .35, 4, roof);
    for (const end of [-1, 1]) {
      const at = s + end * (length / 2 - 2), span = route.halfWidth + 3.8;
      place(at, route.railY - .15, route.cross + span / 2, .6, .6, span, platform);
      place(at, route.railY + 3, side + 1, .22, 5, .22, dark);
    }
    const x = route.axis === 'x' ? s : side + 1.65, z = route.axis === 'x' ? side + 1.65 : s;
    const panel = kit.sign(name, x, route.railY + 4.3, z, Math.min(length - 4, 23), 1.3, '#285b59');
    if (panel && route.axis === 'z') panel.rotation.y = Math.PI / 2;
  });
  for (const s of [route.min + 2, route.max - 2]) {
    place(s, route.railY + .85, route.cross, .5, .45, route.halfWidth * 2 + .5, warning);
    for (const side of [-1, 1]) place(s, route.railY + .4, route.cross + side * route.halfWidth * .7, 1.4, .8, .3, dark);
  }
}
