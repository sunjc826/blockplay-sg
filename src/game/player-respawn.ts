import type { DeploymentMarker } from './deployment-overview';
/** Available only in facility expeditions; the authority checks every destination. */
export interface RespawnZone {
  id: string; name: string; x: number; z: number; y?: number;
  available: boolean; reason: string;
}
export interface PlayerRespawnView {
  zones: RespawnZone[];
  selected: string | null;
  automatic: boolean;
  markers?: readonly DeploymentMarker[];
  zoom?: number;
}
