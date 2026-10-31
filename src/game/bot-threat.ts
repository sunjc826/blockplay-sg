/** Alert memory is a reported position, never a continuously tracked actor. */
export interface ThreatPoint { x: number; y: number; z: number }
export interface BotThreat {
  id: string; point: ThreatPoint; until: number; evadeUntil: number;
  reportedAt: number; direct: boolean; cover?: ThreatPoint;
}
export const BOT_THREAT = {
  memory: 12, evade: 4, reportInterval: 1,
  nearMiss: 2.5, squadRadius: 35, squadmates: 4,
} as const;

/** Distance to the tested stretch only; a wall ends the stretch before this runs. */
export function nearBullet(point: ThreatPoint, origin: ThreatPoint, ray: ThreatPoint, reach: number, radius = BOT_THREAT.nearMiss) {
  const t = Math.max(0, Math.min(reach, (point.x - origin.x) * ray.x + (point.y - origin.y) * ray.y + (point.z - origin.z) * ray.z));
  return Math.hypot(point.x - origin.x - ray.x * t, point.y - origin.y - ray.y * t, point.z - origin.z - ray.z * t) <= radius;
}
