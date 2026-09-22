import { describe, expect, it } from 'vitest';
import { itemById } from './armory-catalog';
import { districtVendorPrice, expeditionNpcs, nearestNpc, npcInteractionPrompt, type ExpeditionNpc, type NpcInteraction } from './expedition-npcs';
import { WORLD_ZONES } from './world-zones';
import { zoneSectors } from './zone-sectors';

describe('Singapore expedition NPCs', () => {
  const npcs = WORLD_ZONES.flatMap(zone => expeditionNpcs(zone.id, zoneSectors(zone.id)));
  type NpcOfKind<K extends NpcInteraction['kind']> = ExpeditionNpc & { interaction: Extract<NpcInteraction, { kind: K }> };
  const vendors = npcs.filter((npc): npc is NpcOfKind<'vendor'> => npc.interaction.kind === 'vendor');
  const locals = npcs.filter((npc): npc is NpcOfKind<'dialogue'> => npc.interaction.kind === 'dialogue');

  it('places every NPC at an authored venue with unique identity', () => {
    expect(npcs.length).toBeGreaterThanOrEqual(14);
    expect(new Set(npcs.map(npc => npc.id)).size).toBe(npcs.length);
    for (const npc of npcs) {
      const sector = zoneSectors(npc.zoneId).find(candidate => candidate.id === npc.sectorId)!;
      const authored = [...sector.anchors, ...(sector.foodAnchors ?? [])];
      expect(authored).toContainEqual({ x: npc.x, z: npc.z });
    }
  });

  it('keeps food vendors at food venues with valid district-priced stock', () => {
    expect(vendors.length).toBeGreaterThanOrEqual(10);
    for (const vendor of vendors) {
      const sector = zoneSectors(vendor.zoneId).find(candidate => candidate.id === vendor.sectorId)!;
      expect(sector.foodAnchors).toContainEqual({ x: vendor.x, z: vendor.z });
      expect(itemById(vendor.interaction.catalogId)?.supplyType).toBe('food');
      expect(vendor.interaction.price).toBeGreaterThan(0);
      expect(npcInteractionPrompt(vendor)).toMatch(/^Buy .+ · \d+ (CR|TK)$/);
    }
  });

  it('supports non-vendor NPCs through the same interaction registry', () => {
    expect(locals.length).toBeGreaterThanOrEqual(4);
    expect(locals.some(npc => npc.zoneId === 'marina-bay')).toBe(true);
    expect(locals.some(npc => npc.zoneId === 'queenstown')).toBe(true);
    for (const local of locals) {
      expect(local.interaction.lines.length).toBeGreaterThan(0);
      expect(npcInteractionPrompt(local)).toBe(`Talk to ${local.name}`);
    }
  });

  it('charges different venue prices for the same item, with Orchard carrying the premium', () => {
    const item = 'food-kaya-toast';
    const prices = {
      geylang: districtVendorPrice('geylang', item)!.price,
      thomson: districtVendorPrice('upper-thomson', item)!.price,
      bukitTimah: districtVendorPrice('bukit-timah', item)!.price,
      orchard: districtVendorPrice('orchard', item)!.price,
    };
    expect(prices.geylang).toBeLessThan(prices.thomson);
    expect(prices.thomson).toBeLessThan(prices.bukitTimah);
    expect(prices.bukitTimah).toBeLessThan(prices.orchard);
    expect(prices.orchard).toBe(140);
  });

  it('only offers an NPC inside the shared interaction radius', () => {
    const npc = npcs[0];
    expect(nearestNpc(npcs, npc)?.id).toBe(npc.id);
    expect(nearestNpc(npcs, { x: npc.x + 4, z: npc.z })).toBeNull();
    expect(nearestNpc(npcs, { x: Number.NaN, z: npc.z })).toBeNull();
  });
});
