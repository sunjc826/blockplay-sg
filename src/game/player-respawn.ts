/** Available only in facility expeditions; the authority checks every destination. */
export interface RespawnZone {
  id: string; name: string; x: number; z: number;
  available: boolean; reason: string;
}
export interface PlayerRespawnView {
  zones: RespawnZone[];
  selected: string | null;
  automatic: boolean;
}
