/** Physical definitions only. Modes own objectives, ownership, health and logistics.
 * Positions (including props/pads/anchors) are in district/world coordinates.
 * Layouts are fixed for the lifetime of a world; changing topology requires a rebuild.
 */
export interface StructurePoint { x: number; y: number; z: number }
export type StructurePropKind = 'canopy' | 'shelter' | 'stores' | 'barricade';
export interface StructureProp extends StructurePoint { kind: StructurePropKind; yaw: number }
export interface StructureCore {
  model: 'command-console' | 'equipment-cabinet';
  /** External cores use the mode's analytical hit test, not rendered scenery rays. */
  cover: 'scene' | 'external';
}
export interface StructureDefinition extends StructurePoint {
  id: string;
  name: string;
  core?: StructureCore;
  props?: readonly StructureProp[];
  /** Optional flag/floor dressing at the assembly origin, independent of objectives. */
  flag?: boolean;
  pad?: StructurePoint & { innerRadius: number; outerRadius: number };
  navigationAnchors?: readonly StructurePoint[];
}
export interface StructureLayout {
  id: string;
  structures: readonly StructureDefinition[];
}
/** Presentation supplied by a mode; no game rules are inferred by the renderer. */
export interface StructureAppearance {
  id: string;
  accent: string;
  body: string;
  mastVisible: boolean;
  barVisible: boolean;
  barFraction: number;
}
