import { expect,it } from 'vitest';
import { mapBrief } from './cast-map-brief';
import { REGION_IDS } from '../src/game/region-ids';
import { REGION_SECTORS } from '../src/data/region-sectors';
import { REGION_STAMPS } from '../src/data/region-stamps';
import { getRegion } from '../src/game/regions';
import { zoneSectors } from '../src/game/zone-sectors';
import index from '../src/data/cast-map-index.json';
import { projectMapFurniture } from '../scripts/lib/cast-map-index';

it.each(REGION_IDS)('describes the public %s registry, including scene-placed facilities',id => {
  expect(zoneSectors(id)).toBe(REGION_SECTORS[id]);
  expect(REGION_STAMPS[id]).toEqual(getRegion(id).stamps);
  expect(projectMapFurniture(id)).toEqual(index[id]);
  const brief = mapBrief(id);
  for (const s of zoneSectors(id)) expect(brief).toContain(s.name+' ['+s.id+']');
  expect(brief.length).toBeLessThan(3000);
  expect(brief).not.toMatch(/botWeight|anchors|initialOwner|lootWeight/);
});
it('distinguishes the lake crossing, beach landings, and garden hill routes',() => {
  expect(mapBrief('jurong-lake')).toContain('causeway');
  expect(mapBrief('sentosa')).toContain('Southern beach east landing');
  expect(mapBrief('botanic-gardens')).toMatch(/Rain Forest \[rain-forest\] · E, broken cover/);
});
