import { describe, expect, it } from 'vitest';
import { planRoof, roofCoverage, ROOF, type Roof } from './roof-detail';

const roof: Roof = { x: 40, z: -20, top: 30, width: 30, depth: 14, yaw: 0, height: 30 };
const bare = () => false;

describe('roof detail', () => {
  it('rings a bare roof with a parapet that stays inside its footprint', () => {
    const parts = planRoof(roof, bare), parapet = parts.filter(p => p.kind === 'parapet');
    expect(parapet).toHaveLength(4);
    for (const p of parapet) {
      expect(p.y - p.h / 2).toBeCloseTo(roof.top, 6);
      expect(Math.abs(p.x - roof.x) + p.w / 2).toBeLessThanOrEqual(roof.width / 2 + 1e-6);
      expect(Math.abs(p.z - roof.z) + p.d / 2).toBeLessThanOrEqual(roof.depth / 2 + 1e-6);
    }
  });
  it('stands plant on the roof, inside the margin, apart from each other, the same every time', () => {
    const parts = planRoof(roof, bare), plant = parts.filter(p => p.kind !== 'parapet');
    expect(plant.some(p => p.kind === 'overrun')).toBe(true);
    expect(plant.filter(p => p.kind === 'condenser').length).toBeGreaterThan(1);
    for (const p of plant) {
      expect(p.y - p.h / 2).toBeCloseTo(roof.top, 6);
      expect(Math.abs(p.x - roof.x) + p.w / 2).toBeLessThanOrEqual(roof.width / 2 - ROOF.margin + 1e-6);
      expect(Math.abs(p.z - roof.z) + p.d / 2).toBeLessThanOrEqual(roof.depth / 2 - ROOF.margin + 1e-6);
    }
    for (const a of plant) for (const b of plant) if (a !== b) expect(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.z - b.z) >= (a.d + b.d) / 2).toBe(true);
    expect(planRoof(roof, bare)).toEqual(parts);
  });
  it('leaves alone a roof that is small, or already built on', () => {
    expect(planRoof({ ...roof, width: 5 }, bare)).toEqual([]);
    expect(roofCoverage(roof, () => true)).toBe(1);
    expect(planRoof(roof, () => true)).toEqual([]);
    // A tower on half of a podium: over the limit, so the podium stays as authored.
    expect(planRoof(roof, x => x > roof.x)).toEqual([]);
  });
  it('drops the parapet on a side that meets a taller neighbour and keeps plant off what stands there', () => {
    const neighbour = (x: number) => x > roof.x + roof.width / 2;
    const parts = planRoof(roof, neighbour);
    expect(parts.filter(p => p.kind === 'parapet')).toHaveLength(3);
    const penthouse = (x: number, _y: number, z: number) => Math.abs(x - roof.x) < 2 && Math.abs(z - roof.z) < 2;
    for (const p of planRoof(roof, penthouse).filter(p => p.kind !== 'parapet')) expect(Math.abs(p.x - roof.x) < 2 && Math.abs(p.z - roof.z) < 2).toBe(false);
  });
  it('gives an authored roof slab plant but no second parapet', () => {
    const parts = planRoof({ ...roof, capped: true }, bare);
    expect(parts.some(p => p.kind === 'parapet')).toBe(false);
    expect(parts.length).toBeGreaterThan(1);
  });
  it('turns with the building and gives a low block no lift overrun or tank', () => {
    const turned = planRoof({ ...roof, yaw: Math.PI / 2 }, bare).filter(p => p.kind === 'parapet');
    expect(turned.every(p => p.yaw === Math.PI / 2)).toBe(true);
    // The long sides now run along Z.
    expect(turned.filter(p => Math.abs(Math.abs(p.x - roof.x) - (roof.depth - ROOF.parapet.thickness) / 2) < 1e-6)).toHaveLength(2);
    const low = planRoof({ ...roof, height: 8 }, bare);
    expect(low.some(p => p.kind === 'overrun' || p.kind === 'tank')).toBe(false);
  });
});

describe('ground storey bays', () => {
  it('splits bays into blank wall, doors and shopfronts in the documented shares', async () => {
    const { storefrontBay, STOREFRONT, GROUND_STOREY } = await import('./world-night-lights');
    const counts = { blank: 0, door: 0, shopfront: 0 };
    for (let i = 0; i < 1000; i++) counts[storefrontBay((i + .5) / 1000)]++;
    expect(counts.blank / 1000).toBeCloseTo(STOREFRONT.blank, 2);
    expect(counts.door / 1000).toBeCloseTo(STOREFRONT.door, 2);
    expect(counts.shopfront).toBeGreaterThan(counts.door);
    // The opening and its fascia fit under the first row of windows.
    expect(STOREFRONT.head).toBeLessThan(GROUND_STOREY);
    expect(STOREFRONT.riser).toBeLessThan(STOREFRONT.head);
  });
});

describe('wall streaks', () => {
  it('runs each streak a different length inside the stated range', async () => {
    const { streakLength, STREAKS } = await import('./world-night-lights');
    expect(streakLength(0)).toBe(STREAKS.shortest);
    expect(streakLength(1)).toBe(STREAKS.longest);
    expect(streakLength(.5)).toBeLessThan((STREAKS.shortest + STREAKS.longest) / 2);
    expect(STREAKS.darken).toBeLessThan(.2);
  });
});

describe('interior mapping', () => {
  it('carries a view ray to the back wall head on, and to a side wall, the floor or the ceiling at an angle', async () => {
    const { interiorHit } = await import('./world-night-lights');
    const size: [number, number] = [3, 2.6], middle: [number, number] = [1.5, 1.3];
    expect(interiorHit(middle, size, [0, 0, 1], 4)).toMatchObject({ surface: 'back', t: 4 });
    const right = interiorHit(middle, size, [.8, 0, .6], 4);
    expect(right.surface).toBe('side'); expect(right.point[0]).toBeCloseTo(3, 6); expect(right.point[2]).toBeLessThan(4);
    expect(interiorHit(middle, size, [-.8, 0, .6], 4).point[0]).toBeCloseTo(0, 6);
    expect(interiorHit(middle, size, [0, -.8, .6], 4).surface).toBe('floor');
    expect(interiorHit(middle, size, [0, .8, .6], 4).surface).toBe('ceiling');
  });
  it('keeps every hit inside the room, even for a ray almost along the glass', async () => {
    const { interiorHit, INTERIOR } = await import('./world-night-lights');
    for (let i = 0; i < 200; i++) {
      const a = i * 2.399, d: [number, number, number] = [Math.cos(a) * .99, Math.sin(a * 1.7) * .5, Math.abs(Math.sin(a * .31)) * .2];
      const hit = interiorHit([(i % 10) * .3 + .05, (i % 7) * .35 + .05], [3.1, 2.6], d, INTERIOR.depth);
      expect(hit.t).toBeGreaterThanOrEqual(0);
      expect(hit.point[0]).toBeGreaterThanOrEqual(-1e-6); expect(hit.point[0]).toBeLessThanOrEqual(3.1 + 1e-6);
      expect(hit.point[1]).toBeGreaterThanOrEqual(-1e-6); expect(hit.point[1]).toBeLessThanOrEqual(2.6 + 1e-6);
      expect(hit.point[2]).toBeLessThanOrEqual(INTERIOR.depth + 1e-6);
    }
  });
  it('furnishes every home and office layout inside its room, with no two pieces sharing space and something tall enough to see from the street', async () => {
    const { HOME_LAYOUTS, OFFICE_LAYOUTS, CURTAINS, BLINDS, INTERIOR, roomBox } = await import('./world-night-lights');
    expect(Object.keys(HOME_LAYOUTS).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(OFFICE_LAYOUTS)).toEqual(['openPlan', 'meeting', 'clerical', 'stockroom']);
    for (const [name, boxes] of Object.entries({ ...HOME_LAYOUTS, ...OFFICE_LAYOUTS })) for (const width of [3.1, 4.4, 6.2]) for (const depth of [INTERIOR.depth, INTERIOR.depth + INTERIOR.depthRange]) {
      const placed = boxes.map(box => ({ name: box.name, ...roomBox(box, width, depth) }));
      for (const b of placed) {
        const label = `${name} ${b.name} at ${width} x ${depth}`;
        for (let k = 0; k < 3; k++) expect(b.high[k] - b.low[k], label).toBeGreaterThan(.05);
        expect(b.low[0], label).toBeGreaterThanOrEqual(0); expect(b.high[0], label).toBeLessThanOrEqual(width);
        expect(b.low[1], label).toBeGreaterThanOrEqual(0); expect(b.high[1], label).toBeLessThanOrEqual(2.3);
        expect(b.low[2], label).toBeGreaterThanOrEqual(.5); expect(b.high[2], label).toBeLessThanOrEqual(depth);
      }
      for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
        const apart = [0, 1, 2].some(k => placed[i].high[k] <= placed[j].low[k] + 1e-9 || placed[j].high[k] <= placed[i].low[k] + 1e-9);
        expect(apart, `${name}: ${placed[i].name} and ${placed[j].name} at ${width} x ${depth}`).toBe(true);
      }
      expect(Math.max(...placed.map(b => b.high[1])), name).toBeGreaterThanOrEqual(1.8);
    }
    expect(CURTAINS.kitchen).toBe(0);
    for (const share of [...Object.values(CURTAINS), ...Object.values(BLINDS)]) { expect(share).toBeGreaterThanOrEqual(0); expect(share).toBeLessThan(1); }
  });
  it('gives every district its share of offices, and the business district its own kind', async () => {
    const { DISTRICT_INTERIORS } = await import('./district-interiors');
    const { REGION_IDS } = await import('./region-ids');
    expect(Object.keys(DISTRICT_INTERIORS).sort()).toEqual([...REGION_IDS].sort());
    for (const id of REGION_IDS) {
      const { offices, cbd } = DISTRICT_INTERIORS[id];
      expect(offices, id).toBeGreaterThanOrEqual(0); expect(offices, id).toBeLessThanOrEqual(1);
      expect(cbd, id).toBe(['marina-bay', 'raffles-place', 'orchard'].includes(id));
    }
  });
  it('furnishes hotel rooms, factory floors and schoolrooms inside their rooms, and gives them to the districts they belong in', async () => {
    const { SPECIAL_LAYOUTS, SPECIAL_HUNG, INTERIOR, roomBox, roomUse } = await import('./world-night-lights');
    type Box = import('./world-night-lights').RoomBox;
    const { DISTRICT_INTERIORS } = await import('./district-interiors');
    expect(Object.keys(SPECIAL_LAYOUTS)).toEqual(['hotel', 'factory', 'classroom']);
    expect([roomUse('hotel'), roomUse('factory'), roomUse('classroom')]).toEqual([4, 5, 6]);
    for (const [kind, layouts] of Object.entries(SPECIAL_LAYOUTS)) {
      expect(Object.keys(layouts), kind).toHaveLength(2);
      for (const [name, boxes] of Object.entries(layouts) as [string, readonly Box[]][]) {
        const hung = SPECIAL_HUNG[name as keyof typeof SPECIAL_HUNG];
        expect(hung, name).toBeGreaterThanOrEqual(0); expect(hung, name).toBeLessThan(1);
        for (const width of [3.1, 4.4, 6.2]) for (const depth of [INTERIOR.depth, INTERIOR.depth + INTERIOR.depthRange]) {
          const placed = boxes.map(box => ({ name: box.name, ...roomBox(box, width, depth) }));
          for (const b of placed) {
            const label = `${name} ${b.name} at ${width} x ${depth}`;
            for (let k = 0; k < 3; k++) expect(b.high[k] - b.low[k], label).toBeGreaterThan(.05);
            expect(b.low[0], label).toBeGreaterThanOrEqual(0); expect(b.high[0], label).toBeLessThanOrEqual(width);
            expect(b.low[1], label).toBeGreaterThanOrEqual(0); expect(b.high[1], label).toBeLessThanOrEqual(2.3);
            expect(b.low[2], label).toBeGreaterThanOrEqual(.5); expect(b.high[2], label).toBeLessThanOrEqual(depth);
          }
          for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
            const apart = [0, 1, 2].some(k => placed[i].high[k] <= placed[j].low[k] + 1e-9 || placed[j].high[k] <= placed[i].low[k] + 1e-9);
            expect(apart, `${name}: ${placed[i].name} and ${placed[j].name} at ${width} x ${depth}`).toBe(true);
          }
          expect(Math.max(...placed.map(b => b.high[1])), name).toBeGreaterThanOrEqual(1.8);
        }
      }
    }
    const given = Object.fromEntries(Object.entries(DISTRICT_INTERIORS).filter(([, interiors]) => interiors.rooms).map(([id, interiors]) => [id, Object.keys(interiors.rooms!)]));
    expect(given).toEqual({ 'marina-bay': ['hotel'], changi: ['hotel'], sentosa: ['hotel'], tuas: ['factory'], 'jurong-lake': ['classroom'], 'bukit-timah': ['classroom'] });
    for (const [id, interiors] of Object.entries(DISTRICT_INTERIORS)) {
      const total = Object.values(interiors.rooms ?? {}).reduce((sum, share) => sum + share, 0);
      expect(total, id).toBeGreaterThanOrEqual(0); expect(total, id).toBeLessThanOrEqual(1);
    }
  });
  it('marks the named hotels and the workshops so every window on them is the right kind of room', async () => {
    const marks = async (build: () => { scene: import('three').Scene }) => {
      const found = new Set<string>();
      build().scene.traverse(object => { const mark = (object as { material?: { userData?: { nightRooms?: string } } }).material?.userData?.nightRooms; if (mark) found.add(mark); });
      return [...found];
    };
    expect(await marks((await import('./changi-scene')).buildChangiScene)).toEqual(['hotel']);
    expect(await marks((await import('./sentosa-scene')).buildSentosaScene)).toEqual(['hotel']);
    expect(await marks((await import('./tuas-scene')).buildTuasScene)).toEqual(['factory']);
  });
  it('designs shop windows that fit their bays, with no two pieces sharing space and no two neighbours alike', async () => {
    const { SHOP_LAYOUTS, SHOP_WINDOWS, MALL_SHOPS, HEARTLAND_SHOPS, shopWindow, INTERIOR, roomBox } = await import('./world-night-lights');
    const names = Object.keys(SHOP_LAYOUTS);
    expect(names.slice(0, 10)).toEqual(['fashion', 'jeweller', 'electronics', 'bookshop', 'cafe', 'sports', 'beauty', 'toys', 'florist', 'bags']);
    expect(MALL_SHOPS).toEqual(names.slice(0, 10));
    expect(names.slice(10, 21)).toEqual(['medicineHall', 'teaMerchant', 'driedGoods', 'textiles', 'garlands', 'spices', 'carpets', 'perfumery', 'kopitiam', 'kueh', 'tailor']);
    expect(names.slice(21, 26)).toEqual(['provisionShop', 'clinic', 'salon', 'tuition', 'bakery']);
    expect(names.slice(26)).toEqual(['fruitStall', 'lighting', 'nursery', 'souvenirs', 'surfShop', 'bicycles']);
    for (const name of HEARTLAND_SHOPS) expect(names).toContain(name);
    // The housing towns' shops also fit Queenstown's 2.3 m shopfront bays.
    for (const [name, boxes] of Object.entries(SHOP_LAYOUTS)) for (const width of [...((HEARTLAND_SHOPS as readonly string[]).includes(name) ? [2.3] : []), SHOP_WINDOWS.bay, 3.1, 4.4, 6.2]) for (const depth of [INTERIOR.depth, INTERIOR.depth + INTERIOR.depthRange]) {
      const placed = boxes.map(box => ({ name: box.name, ...roomBox(box, width, depth) }));
      for (const b of placed) {
        const label = `${name} ${b.name} at ${width} x ${depth}`;
        for (let k = 0; k < 3; k++) expect(b.high[k] - b.low[k], label).toBeGreaterThan(.05);
        expect(b.low[0], label).toBeGreaterThanOrEqual(0); expect(b.high[0], label).toBeLessThanOrEqual(width);
        expect(b.low[1], label).toBeGreaterThanOrEqual(0); expect(b.high[1], label).toBeLessThanOrEqual(2.3);
        expect(b.low[2], label).toBeGreaterThanOrEqual(.2); expect(b.high[2], label).toBeLessThanOrEqual(depth);
      }
      for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
        const apart = [0, 1, 2].some(k => placed[i].high[k] <= placed[j].low[k] + 1e-9 || placed[j].high[k] <= placed[i].low[k] + 1e-9);
        expect(apart, `${name}: ${placed[i].name} and ${placed[j].name} at ${width} x ${depth}`).toBe(true);
      }
      // Every shop puts something in its window, for a doorway to leave out.
      expect(Math.min(...placed.map(b => b.low[2])), name).toBeLessThan(SHOP_WINDOWS.display);
    }
    // A run of bays shows every shop once before any repeats, on any building.
    for (const building of [0, 7, 96]) {
      for (const shops of [MALL_SHOPS, HEARTLAND_SHOPS, names.slice(10, 13), names.slice(13, 17)] as (typeof MALL_SHOPS)[]) {
        expect(new Set(shops.map((_, bay) => shopWindow(bay, building, shops))).size).toBe(shops.length);
        for (let bay = 0; bay < 30; bay++) expect(shopWindow(bay, building, shops)).not.toBe(shopWindow(bay + 1, building, shops));
      }
    }
    for (const share of [SHOP_WINDOWS.strip, SHOP_WINDOWS.lit]) { expect(share).toBeGreaterThan(0); expect(share).toBeLessThan(1); }
    expect(SHOP_WINDOWS.head).toBeGreaterThanOrEqual(2.6);
  });
  it('gives every shop two made-up brands it can spell in the sign font, each with a mark', async () => {
    const { SHOP_BRANDS, SHOP_FONT, SHOP_LAYOUTS } = await import('./world-night-lights');
    expect(Object.keys(SHOP_BRANDS)).toEqual(Object.keys(SHOP_LAYOUTS));
    const names = Object.values(SHOP_BRANDS).flat();
    expect(new Set(names.map(name => name.slice(2))).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[0-9] [A-Z]{5,8}$/);
      for (const letter of name) expect(SHOP_FONT[letter], `${name}: ${letter}`).toBeDefined();
    }
    for (const [glyph, rows] of Object.entries(SHOP_FONT)) expect(rows, glyph).toMatch(/^[01]{3}( [01]{3}){4}$/);
    expect(new Set(Object.values(SHOP_FONT)).size).toBe(Object.keys(SHOP_FONT).length);
  });
  it('gives the shopping belt, the heritage streets and the housing towns their own shops, on generated shopfronts and on marked walls', async () => {
    const { DISTRICT_INTERIORS } = await import('./district-interiors');
    const { SHOP_LAYOUTS, MALL_SHOPS, HEARTLAND_SHOPS } = await import('./world-night-lights');
    const { REGIONS } = await import('./regions');
    const { buildOrchardScene } = await import('./orchard-scene');
    // The heritage four, then the rest that name their own: Geylang, Upper Thomson, the resort island, the harbour and Ubin's village.
    const heritage = ['chinatown', 'kampong-glam', 'little-india', 'katong-joo-chiat', 'geylang', 'upper-thomson', 'sentosa', 'harbourfront', 'pulau-ubin'];
    for (const [id, interiors] of Object.entries(DISTRICT_INTERIORS)) {
      const heartland = ['toa-payoh', 'bishan', 'tampines', 'yishun', 'woodlands', 'punggol', 'queenstown'].includes(id);
      expect(interiors.boutiques ?? 0, id).toBe(id === 'orchard' || heritage.includes(id) || heartland ? 1 : 0);
      expect(!!interiors.shops, id).toBe(heritage.includes(id) || heartland);
      if (heartland) expect(interiors.shops, id).toEqual(HEARTLAND_SHOPS);
      for (const name of interiors.shops ?? []) expect(Object.keys(SHOP_LAYOUTS), id).toContain(name);
      if (interiors.shops) expect(new Set(interiors.shops).size, id).toBeGreaterThanOrEqual(3);
    }
    // The shared terraces hide generated shopfronts behind their own, so those carry the shops instead; so do Queenstown's shop rows and Yishun's retail wings.
    for (const id of ['little-india', 'katong-joo-chiat', 'queenstown', 'yishun', 'pulau-ubin']) {
      const built = REGIONS.find(region => region.id === id)!.build(), marked = new Set<string>();
      built.scene.traverse(object => { for (const name of (object as { material?: { userData?: { nightShopWindow?: string[] } } }).material?.userData?.nightShopWindow ?? []) marked.add(name); });
      expect(marked.size, id).toBeGreaterThanOrEqual(3);
      for (const name of marked) expect(Object.keys(SHOP_LAYOUTS), id).toContain(name);
      built.dispose();
    }
    const world = buildOrchardScene(), listed = new Set<string>();
    world.scene.traverse(object => {
      const marked = (object as { material?: { userData?: { nightShopWindow?: string[] } } }).material?.userData?.nightShopWindow;
      for (const name of marked ?? []) { expect(Object.keys(SHOP_LAYOUTS)).toContain(name); listed.add(name); }
    });
    expect([...listed].sort()).toEqual([...MALL_SHOPS].sort());
    world.dispose();
  });
  it('reflects a little head on and nearly everything at a glance', async () => {
    const { glassReflection, REFLECTION } = await import('./world-night-lights');
    expect(glassReflection(1)).toBeCloseTo(REFLECTION.headOn, 6);
    expect(glassReflection(0)).toBeCloseTo(1, 6);
    expect(glassReflection(.5)).toBeGreaterThan(glassReflection(.9));
    expect(REFLECTION.headOn).toBeLessThan(.4);
  });
});
