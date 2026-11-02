/** Authored game railway corridors, shared by track builders and train clocks.
 * Stops and buffers include the whole consist, rather than just its origin. */
export interface RailRoute {
  axis: 'x' | 'z'; cross: number; min: number; max: number; railY: number;
  halfLength: number; halfWidth: number; stops: readonly number[];
  speed: number; accel: number; dwell: number;
}
export const RAIL_ROUTES = {
  queenstown: { axis: 'x', cross: 22, min: -180, max: 180, railY: 8.6, halfLength: 19, halfWidth: 1.7, stops: [0, 145, 0, -145], speed: 16, accel: 1.2, dwell: 28 },
  yishun: { axis: 'z', cross: 23, min: -195, max: 195, railY: 10.94, halfLength: 22, halfWidth: 2.61, stops: [-145, 145], speed: 12, accel: 1, dwell: 20 },
  sentosa: { axis: 'x', cross: -145, min: -200, max: 200, railY: 15.2, halfLength: 19.1, halfWidth: 2.6, stops: [0, 160, 0, -160], speed: 16, accel: 1, dwell: 18 },
  punggol: { axis: 'z', cross: 215, min: -150, max: 130, railY: 14, halfLength: 11.8, halfWidth: 1.35, stops: [108, -130], speed: 12, accel: 1, dwell: 20 },
  woodlands: { axis: 'z', cross: -24, min: -370, max: -130, railY: 1.1, halfLength: 36.75, halfWidth: 1.55, stops: [-172, -325], speed: 14, accel: .8, dwell: 40 },
} as const satisfies Record<string, RailRoute>;
export type RailDistrict = keyof typeof RAIL_ROUTES;

/** Distance along a leg, with continuous speed and a full stop at both ends. */
export function travel(u: number, distance: number, speed: number, accel: number) {
  const ramp = Math.min(speed / accel, Math.sqrt(distance / accel));
  const peak = ramp * accel, cruise = Math.max(0, distance - accel * ramp * ramp) / peak;
  const total = 2 * ramp + cruise, t = Math.max(0, Math.min(total, u));
  const s = t < ramp ? accel * t * t / 2 : t < ramp + cruise ? accel * ramp * ramp / 2 + (t - ramp) * peak : distance - accel * (total - t) ** 2 / 2;
  return { s, total };
}
export function railTimetable(route: RailRoute) {
  let at = 0;
  const legs = route.stops.map((stop, i) => {
    const next = route.stops[(i + 1) % route.stops.length];
    const duration = travel(0, Math.abs(next - stop), route.speed, route.accel).total;
    const leg = { stop, next, arrive: at, depart: at + route.dwell, end: at + route.dwell + duration };
    at = leg.end; return leg;
  });
  return { legs, period: at };
}
export function railState(route: RailRoute, time: number) {
  const { legs, period } = railTimetable(route), u = ((time % period) + period) % period;
  const leg = legs.find(leg => u < leg.end) ?? legs[legs.length - 1];
  const direction = Math.sign(leg.next - leg.stop);
  return { position: leg.stop + direction * travel(u - leg.depart, Math.abs(leg.next - leg.stop), route.speed, route.accel).s, stopped: u <= leg.depart, direction, period };
}
