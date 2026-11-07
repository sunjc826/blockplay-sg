import { PLAYER_FACTION } from './arena-factions';
import type { FacilitySite, FacilitySnapshot } from './facilities';
import { structureCeilings, structureCoreBounds, structureNavigationAnchors, structureObstacles } from './structure-layout';
import type { StructureAppearance, StructureDefinition, StructureLayout } from './structure-types';

/** Expedition adapter. FacilitySite remains the compatible authored/save/wire
 * format for this mode; physical systems consume only the resolved layout.
 * Camp patrols still belong to expedition AI, even though they also seed navigation.
 */
export function expeditionStructure(site: FacilitySite): StructureDefinition {
  return {
    id: site.id, name: site.name, x: site.x, y: site.y, z: site.z,
    core: { model: site.kind === 'command' ? 'command-console' : 'equipment-cabinet', cover: 'external' },
    ...(site.kind === 'command' ? { props: site.camp?.props ?? [], flag: !!site.camp?.props.some(p => p.kind === 'canopy') } : {}),
    navigationAnchors: site.camp?.patrol ?? [],
    ...(site.kind === 'garage' || site.kind === 'helipad' ? { pad: {
      x: site.deployment.x, y: .04, z: site.deployment.z,
      innerRadius: site.kind === 'helipad' ? 5.5 : 2.5, outerRadius: site.kind === 'helipad' ? 5.7 : 2.65,
    } } : {}),
  };
}

export function expeditionStructureLayout(sites: readonly FacilitySite[], id = 'expedition'): StructureLayout {
  return { id, structures: sites.map(expeditionStructure) };
}

export function expeditionStructureAppearance(snapshot?: FacilitySnapshot): StructureAppearance[] {
  return (snapshot?.sites ?? []).map(s => ({
    id: s.id,
    accent: !s.health ? '#8a8e88' : s.suppressed ? '#f4cd61' : !s.owner ? '#efd077' : s.owner === PLAYER_FACTION ? '#70cfff' : '#f17c61',
    body: s.health ? '#53615d' : '#34332e', mastVisible: s.health > 0,
    barFraction: s.action?.progress ?? s.health / s.maxHealth, barVisible: s.health > 0 || !!s.action,
  }));
}

// Compatibility entry points for expedition authority, placement checks and tests.
export const facilityCoreBounds = (site: Pick<FacilitySite, 'kind' | 'x' | 'y' | 'z'>) =>
  structureCoreBounds(site, site.kind === 'command' ? 'command-console' : 'equipment-cabinet');
export const facilityObstacles = (site: FacilitySite) => structureObstacles(expeditionStructure(site));
export const facilityCeilings = (site: FacilitySite) => structureCeilings(expeditionStructure(site));
export const facilityNavigationAnchors = (site: FacilitySite) => structureNavigationAnchors(expeditionStructure(site));
