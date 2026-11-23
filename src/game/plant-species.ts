/**
 * Broadleaf trees and garden herbs of the Singapore Botanic Gardens, as the numbers the plant builder
 * (plant-models.ts) works from. Morphology is from the NParks pages named on each entry, read
 * 24 November 2026; what NParks does not state is authored and listed in docs/SINGAPORE-VEGETATION.md.
 * Heights are the model's own; a district scales a plant to the height it wants. Leaf sprays and herb
 * leaves are far fewer and larger than life: each drawn one stands for many.
 */
export type PlantSpecies = 'tembusu' | 'tembusu-heritage' | 'jelawai-jaha' | 'torch-ginger' | 'heliconia';
interface PlantNote { name: string; scientific: string; /** As NParks states it. */ status: string; source: string; seed: number; /** Ground to crown top (m), before a district scales it. */ height: number }
export interface TreeSpec extends PlantNote {
  kind: 'tree';
  /** Share of the height that is clear trunk below the first limbs. */
  bole: number;
  trunk: { colour: string; dark: string; /** How much darker alternate strips of bark are: 0 smooth, 1 deeply fissured. */ fissure: number;
    /** Radius at the foot of the clear bole (m) and the share left at the top. */ radius: number; taper: number;
    flare: number; flareHeight: number; sides: number; /** Lean at the top as a share of height. */ lean: number };
  buttress?: { count: number; height: number; spread: number; thickness: number };
  limbs: { tiers: number; perTier: number;
    /** Degrees above level a limb leaves at and turns to by its end, lowest tier and highest. */ rise: readonly [number, number]; turn: readonly [number, number];
    /** Limb length as a share of height, and the top tier's share of that. */ length: number; topShare: number;
    girth: number; clusters: number; scatter: number; /** The trunk carries on through the crown as a leader. */ leader: boolean };
  /** One long low limb: where it leaves (m), its length, its pitch along most of its run and at its upturned end (degrees). */
  lowLimb?: { at: number; length: number; sag: number; upturn: number; girth: number };
  crown: { leaf: string; tip: string; young: string; radius: number; sprays: number; spray: number; droop: number;
    /** Below 1 flattens each leaf mass into a layer. */ flatten: number; /** Share of sprays in young leaf. */ flush: number;
    accent?: { colour: string; share: number; size: number } };
}
export interface HerbSpec extends PlantNote {
  kind: 'herb';
  stems: number; spread: number; lean: number; stem: string; stemRadius: number;
  leaf: { count: number; length: number; width: number; /** Share of the stem below the lowest leaf. */ from: number; rise: readonly [number, number];
    /** In two ranks along the stem, as gingers and heliconias carry them. */ ranked: boolean; /** Share of the leaf that is stalk. */ stalk: number;
    droop: number; colour: string; tip: string; rib: string };
  bloom: { kind: 'torch' | 'pendent'; count: number; height: number; size: number; bracts: number; colours: readonly string[] };
}
export type PlantSpec = TreeSpec | HerbSpec;

// FFW 2895: tree to 30 m, deeply fissured bark, buttress roots to 2.5 m tall, irregular shape; opposite elliptic
// leaves 5-13 by 2-5.5 cm; cream-white flowers turning yellow; berries green turning orange or red, 4.5-10 mm.
// Heritage Tree register HT 2001-26: bark dark brown and fissured, leaves light green, crown lofty and irregular.
const tembusu: TreeSpec = {
  kind: 'tree', name: 'Tembusu', scientific: 'Cyrtophyllum fragrans', status: 'Native to Singapore (Least Concern)',
  source: 'https://www.nparks.gov.sg/florafaunaweb/flora/2/8/2895', seed: 71, height: 16, bole: .3,
  trunk: { colour: '#5a4636', dark: '#2c221a', fissure: .7, radius: .42, taper: .5, flare: .35, flareHeight: .8, sides: 8, lean: .03 },
  buttress: { count: 4, height: 1.1, spread: 1, thickness: .16 },
  limbs: { tiers: 3, perTier: 3, rise: [8, 50], turn: [48, 72], length: .3, topShare: .6, girth: .45, clusters: 3, scatter: .7, leader: false },
  crown: { leaf: '#6a9648', tip: '#44743a', young: '#9bb65a', radius: 1.9, sprays: 11, spray: 1.6, droop: .22, flatten: .8, flush: .14,
    accent: { colour: '#d9622b', share: .1, size: .07 } },
};
export const PLANT_SPECS: Readonly<Record<PlantSpecies, PlantSpec>> = {
  tembusu,
  // The Lawn E tree (HT 2001-26): 20 m tall, girth 5 m at 1.6 m, over 200 years old, with a "unique lower lateral
  // branch", fenced since December 2013 and held by a dynamic support. NParks gives the limb no dimensions.
  'tembusu-heritage': { ...tembusu, seed: 73, height: 20, source: 'https://heritagetrees.nparks.gov.sg/heritagetrees/ht-2001-26/', bole: .26,
    trunk: { ...tembusu.trunk, radius: .8, flare: .3, flareHeight: 1.1 }, buttress: { count: 5, height: 1.6, spread: 1.7, thickness: .22 },
    limbs: { ...tembusu.limbs, perTier: 4, length: .34 }, crown: { ...tembusu.crown, radius: 2.5, spray: 2 },
    lowLimb: { at: 2, length: 10, sag: 2, upturn: 62, girth: .5 } },
  // Heritage Tree register HT 2001-25, the tree at the Rain Forest entrance: 38.4 m tall, girth 8 m at 1.3 m,
  // "buttresses are up to 5 m high", trunk heavily buttressed, bark pale brown with narrow cracks, crown wide,
  // flat-topped, open and tiered. FFW 3302: to 45 m; leathery glossy spoon-shaped leaves 4-14 cm, spiralled at twig ends.
  'jelawai-jaha': {
    kind: 'tree', name: 'Jelawai Jaha', scientific: 'Terminalia subspathulata', status: 'Native to Singapore (Critically Endangered)',
    source: 'https://heritagetrees.nparks.gov.sg/heritagetrees/ht-2001-25/', seed: 83, height: 38, bole: .52,
    trunk: { colour: '#a48f70', dark: '#75624a', fissure: .3, radius: 1.27, taper: .45, flare: .22, flareHeight: 2.2, sides: 9, lean: .012 },
    buttress: { count: 6, height: 5, spread: 4.4, thickness: .32 },
    limbs: { tiers: 3, perTier: 5, rise: [4, 20], turn: [-4, 10], length: .32, topShare: .6, girth: .3, clusters: 3, scatter: .6, leader: true },
    crown: { leaf: '#3f7a3c', tip: '#2d5e30', young: '#86a556', radius: 3.3, sprays: 10, spray: 2.6, droop: .14, flatten: .45, flush: .1 },
  },
  // FFW 1990: rhizomatous, upright and slightly arching at the tips, 2-6 m, forming large colonies; 14-34 leaves in
  // two ranks, lanceolate, 38-85 by 8-18 cm; an egg-shaped head of crimson-pink bracts on its own smooth green
  // stalk 60-200 cm long.
  'torch-ginger': {
    kind: 'herb', name: 'Torch ginger', scientific: 'Etlingera elatior', status: 'Non-native; grown as a landscaping ornamental',
    source: 'https://www.nparks.gov.sg/florafaunaweb/flora/1/9/1990', seed: 97, height: 3.3,
    stems: 9, spread: .8, lean: .22, stem: '#5d8a44', stemRadius: .035,
    leaf: { count: 12, length: .85, width: .2, from: .22, rise: [42, 12], ranked: true, stalk: .04, droop: .38, colour: '#4c8a3f', tip: '#386f33', rib: '#86b25c' },
    bloom: { kind: 'torch', count: 3, height: 1.1, size: .16, bracts: 6, colours: ['#d83f5e', '#f08fa4'] },
  },
  // FFW 8045 (Heliconia rostrata 'Green Tip'): about 1.5 m tall, green paddle-shaped leaves, inflorescences pendant
  // and in one plane, bracts bright red with dark-green tips and yellow edges. Heliconias are tropical American.
  heliconia: {
    kind: 'herb', name: 'Hanging lobster claw', scientific: "Heliconia rostrata 'Green Tip'", status: 'Non-native (horticultural, cultivated only)',
    source: 'https://www.nparks.gov.sg/florafaunaweb/flora/8/0/8045', seed: 101, height: 1.7,
    stems: 6, spread: .5, lean: .16, stem: '#5f8c46', stemRadius: .025,
    leaf: { count: 5, length: 1, width: .32, from: .42, rise: [62, 34], ranked: true, stalk: .32, droop: .2, colour: '#4f9040', tip: '#3a7435', rib: '#8cb85f' },
    bloom: { kind: 'pendent', count: 3, height: 0, size: .11, bracts: 7, colours: ['#d42a22', '#e6cf4a'] },
  },
};
export const PLANT_SPECIES = Object.keys(PLANT_SPECS) as PlantSpecies[];
