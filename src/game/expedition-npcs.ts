import { itemById } from './armory-catalog';
import type { WorldZoneId, ZonePosition } from './world-zones';
import type { ZoneSector } from './zone-sectors';

export type NpcInteraction =
  | { kind: 'vendor'; catalogId: string; price: number; currency: 'credits' | 'tokens' }
  | { kind: 'dialogue'; lines: readonly string[] };

export interface ExpeditionNpc extends ZonePosition {
  id: string;
  zoneId: WorldZoneId;
  sectorId: string;
  name: string;
  role: string;
  interaction: NpcInteraction;
}

interface NpcConfigBase {
  zoneId: WorldZoneId;
  sectorId: string;
  name: string;
  role: string;
}
type NpcConfig = NpcConfigBase & (
  | { anchor: 'food'; anchorIndex?: number; interaction: { kind: 'vendor'; catalogId: string } }
  | { anchor: 'sector'; anchorIndex: number; interaction: { kind: 'dialogue'; lines: readonly string[] } }
);

/**
 * Fictional gameplay index inspired by venue overhead: heartland markets are
 * cheaper, while prime shopping and CBD frontages carry a premium. Prices are
 * rounded to ten credits so this reads as game economy, not a live rent quote.
 */
export const DISTRICT_VENDOR_PRICE_INDEX: Readonly<Partial<Record<WorldZoneId, number>>> = {
  'toa-payoh': .8,
  tampines: .85,
  geylang: .9,
  'upper-thomson': 1.05,
  chinatown: 1.1,
  'bukit-timah': 1.2,
  'raffles-place': 1.35,
  orchard: 1.55,
};

/**
 * All NPCs use this one authored registry. Adding a guide, quest giver or
 * future service does not require another placement or proximity subsystem;
 * it adds a config and one interaction handler.
 */
const NPC_CONFIGS: readonly NpcConfig[] = [
  { zoneId: 'raffles-place', sectorId: 'market-street', name: 'Market Street stallholder', role: 'Snack vendor', anchor: 'food', interaction: { kind: 'vendor', catalogId: 'food-curry-puff' } },
  { zoneId: 'chinatown', sectorId: 'smith-street', name: 'Smith Street stallholder', role: 'Hawker', anchor: 'food', interaction: { kind: 'vendor', catalogId: 'food-curry-puff' } },
  { zoneId: 'chinatown', sectorId: 'chinatown-complex', name: 'Chinatown Complex stallholder', role: 'Rice vendor', anchor: 'food', interaction: { kind: 'vendor', catalogId: 'food-chicken-rice' } },
  { zoneId: 'upper-thomson', sectorId: 'coffee-corner', name: 'Thomson stallholder', role: 'Kopi vendor', anchor: 'food', interaction: { kind: 'vendor', catalogId: 'food-kaya-toast' } },
  { zoneId: 'upper-thomson', sectorId: 'thomson-station', name: 'Food-centre stallholder', role: 'Rice vendor', anchor: 'food', interaction: { kind: 'vendor', catalogId: 'food-chicken-rice' } },
  { zoneId: 'geylang', sectorId: 'serai-market', name: 'Geylang Serai stallholder', role: 'Snack vendor', anchor: 'food', interaction: { kind: 'vendor', catalogId: 'food-curry-puff' } },
  { zoneId: 'geylang', sectorId: 'kopitiam', name: 'Lorong stallholder', role: 'Kopi vendor', anchor: 'food', interaction: { kind: 'vendor', catalogId: 'food-kaya-toast' } },
  { zoneId: 'geylang', sectorId: 'quay-stalls', name: 'Riverside stallholder', role: 'Hawker', anchor: 'food', interaction: { kind: 'vendor', catalogId: 'food-curry-puff' } },
  { zoneId: 'tampines', sectorId: 'round-market', name: 'Round Market stallholder', role: 'Rice vendor', anchor: 'food', interaction: { kind: 'vendor', catalogId: 'food-chicken-rice' } },
  { zoneId: 'toa-payoh', sectorId: 'lorong-hawker', name: 'Lorong hawker', role: 'Rice vendor', anchor: 'food', interaction: { kind: 'vendor', catalogId: 'food-chicken-rice' } },
  { zoneId: 'bukit-timah', sectorId: 'beauty-world', name: 'Beauty World stallholder', role: 'Kopi vendor', anchor: 'food', interaction: { kind: 'vendor', catalogId: 'food-kaya-toast' } },
  { zoneId: 'orchard', sectorId: 'somerset-plaza', name: 'Somerset café attendant', role: 'Café vendor', anchor: 'food', interaction: { kind: 'vendor', catalogId: 'food-kaya-toast' } },

  { zoneId: 'marina-bay', sectorId: 'civic-district', name: 'Bay route marshal', role: 'Route guide', anchor: 'sector', anchorIndex: 0,
    interaction: { kind: 'dialogue', lines: ['Checkpoint diamonds lead to connected districts.', 'Supply crates are random each expedition, but collected crates stay gone.', 'Vendors and local guides remain at their usual neighbourhood spots.'] } },
  { zoneId: 'queenstown', sectorId: 'community-court', name: 'Community volunteer', role: 'Neighbourhood guide', anchor: 'sector', anchorIndex: 0,
    interaction: { kind: 'dialogue', lines: ['The station, void decks and community court are the easiest landmarks to follow.', 'Low-threat districts have modest loot, but the random supply count is still guaranteed.', 'If you are heading east, follow the checkpoint marker rather than the road edge.'] } },
  { zoneId: 'toa-payoh', sectorId: 'dragon-playground', name: 'Playground regular', role: 'Resident', anchor: 'sector', anchorIndex: 0,
    interaction: { kind: 'dialogue', lines: ['The dragon playground marks the south side of the town centre.', 'The hawker stall is east of here, across the town hub.', 'Talk again if you need the directions repeated.'] } },
  { zoneId: 'orchard', sectorId: 'ion-frontage', name: 'Mall concierge', role: 'Local guide', anchor: 'sector', anchorIndex: 0,
    interaction: { kind: 'dialogue', lines: ['Somerset plaza has the nearest café kiosk.', 'Orchard vendors charge a prime-location premium.', 'The underpass and mall forecourts provide cover away from the boulevard.'] } },
] as const;

export function districtVendorPrice(zoneId: WorldZoneId, catalogId: string) {
  const item = itemById(catalogId);
  if (item?.category !== 'consumable') return null;
  const multiplier = DISTRICT_VENDOR_PRICE_INDEX[zoneId] ?? 1;
  return { price: Math.max(10, Math.round(item.price * multiplier / 10) * 10), currency: item.currency } as const;
}

function npcFromConfig(config: NpcConfig, sector: ZoneSector): ExpeditionNpc | null {
  const point = config.anchor === 'food' ? sector.foodAnchors?.[config.anchorIndex ?? 0] : sector.anchors[config.anchorIndex];
  if (!point) return null;
  if (config.interaction.kind === 'dialogue') return { id: `npc-${config.zoneId}-${config.sectorId}-${config.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    zoneId: config.zoneId, sectorId: config.sectorId, name: config.name, role: config.role, interaction: config.interaction, ...point };
  const item = itemById(config.interaction.catalogId), price = districtVendorPrice(config.zoneId, config.interaction.catalogId);
  if (item?.category !== 'consumable' || !price) return null;
  return { id: `npc-${config.zoneId}-${config.sectorId}-vendor`, zoneId: config.zoneId, sectorId: config.sectorId,
    name: config.name, role: config.role, interaction: { kind: 'vendor', catalogId: item.id, ...price }, ...point };
}

export function expeditionNpcs(zoneId: WorldZoneId, sectors: readonly ZoneSector[]): ExpeditionNpc[] {
  const byId = new Map(sectors.map(sector => [sector.id, sector]));
  return NPC_CONFIGS.filter(config => config.zoneId === zoneId).flatMap(config => {
    const sector = byId.get(config.sectorId); return sector ? npcFromConfig(config, sector) ?? [] : [];
  });
}

export function nearestNpc(npcs: readonly ExpeditionNpc[], player: ZonePosition, radius = 3.2): ExpeditionNpc | null {
  if (!Number.isFinite(player.x) || !Number.isFinite(player.z) || !Number.isFinite(radius) || radius <= 0) return null;
  return npcs.filter(npc => Math.hypot(npc.x - player.x, npc.z - player.z) <= Math.min(radius, 3.2))
    .sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0] ?? null;
}

export function npcInteractionPrompt(npc: ExpeditionNpc) {
  if (npc.interaction.kind === 'dialogue') return `Talk to ${npc.name}`;
  const item = itemById(npc.interaction.catalogId);
  return `Buy ${item?.name ?? 'supplies'} · ${npc.interaction.price} ${npc.interaction.currency === 'tokens' ? 'TK' : 'CR'}`;
}
