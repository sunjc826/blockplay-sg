import type { MinimapMarker } from './minimap';

/** Keep every authored schematic shape, with its original hue on the dark map. */
export function minimapColor(color: string) {
  const match = /^#([\da-f]{6})$/i.exec(color);
  if (!match) return color;
  const source = parseInt(match[1], 16), base = [19, 43, 38];
  return `#${base.map((channel, i) => Math.round(channel * .48 + ((source >> (16 - i * 8)) & 255) * .52).toString(16).padStart(2, '0')).join('')}`;
}

const LOOT_NAMES = { weapon: 'Weapon', ammo: 'Ammunition', medical: 'Medical supplies', armor: 'Armor', food: 'Food', resupply: 'Range resupply' };
const FACILITY_NAMES = { command: 'Command post', garage: 'Garage', helipad: 'Helipad', supply: 'Supply depot' };
export function minimapMarkerCategory(marker: MinimapMarker) {
  if (marker.kind === 'loot') return marker.lootType ? LOOT_NAMES[marker.lootType] : 'Supplies';
  if (marker.kind === 'facility') return marker.facilityType ? FACILITY_NAMES[marker.facilityType] : 'Facility';
  return { hunter: 'Hunter drone', control:'Control station', landmark: 'Landmark', parachute: 'Paratroopers', boat: 'Landing craft', target: 'Practice target',
    car: 'Car', helicopter: 'Helicopter', npc: 'NPC', checkpoint: 'Checkpoint / objective', scent: 'Scent reveal', ally: 'Allied contact', enemy: 'Enemy contact' }[marker.kind];
}

export interface MapLabel { id: string; name: string; x: number; y: number; priority: number; lines?: number }
/** Stable greedy placement: reserve space for priority labels, then omit collisions. */
export function minimapLabels(candidates: readonly MapLabel[], width: number, height: number) {
  const occupied: { x: number; y: number; w: number; h: number }[] = [];
  const placed = new Map<string, { x: number; y: number }>();
  for (const label of [...candidates].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    const w = Math.min(width - 48, Math.max(48, label.name.length * 5.8 + 12)), h = (label.lines ?? 1) * 13 + 5;
    for (const offset of [0, -16, 16, -32, 32]) {
      const x = Math.max(24 + w / 2, Math.min(width - 24 - w / 2, label.x));
      const y = Math.max(28, Math.min(height - 40 - h, label.y + offset));
      const box = { x: x - w / 2, y: y - 10, w, h };
      if (occupied.some(b => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y)) continue;
      occupied.push(box); placed.set(label.id, { x, y }); break;
    }
  }
  return placed;
}
