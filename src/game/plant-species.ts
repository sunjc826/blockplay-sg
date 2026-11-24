/**
 * Broadleaf trees and garden herbs of the Singapore Botanic Gardens, as the numbers the plant builder
 * (plant-models.ts) works from. Morphology is from the NParks pages named on each entry, read
 * 24 November 2026; what NParks does not state is authored and listed in docs/SINGAPORE-VEGETATION.md.
 * Heights are the model's own; a district scales a plant to the height it wants. Leaf sprays and herb
 * leaves are far fewer and larger than life: each drawn one stands for many.
 */
import type { LeafPattern } from './leaf-cards';

export type PlantSpecies = 'tembusu' | 'tembusu-heritage' | 'jelawai-jaha' | 'rain-tree' | 'yellow-rain-tree' | 'jelutong' | 'jelutong-young' | 'kapur' | 'torch-ginger' | 'heliconia';
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
  crown: { leaf: string; tip: string; young: string; /** How the leaves sit on a twig (leaf-cards.ts). */ foliage: LeafPattern; radius: number; sprays: number; spray: number; droop: number;
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
  crown: { foliage: 'opposite', leaf: '#6a9648', tip: '#44743a', young: '#9bb65a', radius: 1.9, sprays: 11, spray: 1.6, droop: .22, flatten: .8, flush: .14,
    accent: { colour: '#d9622b', share: .1, size: .07 } },
};
// FFW 3106 (Samanea saman): native to northern tropical South America, widely cultivated in Singapore; usually to
// 30 m in cultivation; crown symmetrically umbrella-shaped and wide-spreading, 20-30 m across, branching at
// relatively low height; bark dark brown, fissured, peeling in long strips; bipinnate leaves of small leaflets
// that fold in the early evening and on overcast days; powderpuff flowers pink above and white below.
const rainTree: TreeSpec = {
  kind: 'tree', name: 'Rain tree', scientific: 'Samanea saman', status: 'Non-native (northern tropical South America); widely cultivated in Singapore',
  source: 'https://www.nparks.gov.sg/florafaunaweb/flora/3/1/3106', seed: 107, height: 13, bole: .2,
  trunk: { colour: '#56432f', dark: '#2b2018', fissure: .6, radius: .55, taper: .6, flare: .3, flareHeight: .7, sides: 8, lean: .02 },
  limbs: { tiers: 2, perTier: 4, rise: [34, 58], turn: [6, 22], length: .56, topShare: .6, girth: .5, clusters: 3, scatter: .5, leader: false },
  crown: { foliage: 'bipinnate', leaf: '#5f9a45', tip: '#467c3a', young: '#8fb858', radius: 2.7, sprays: 9, spray: 2.3, droop: .12, flatten: .45, flush: .1,
    accent: { colour: '#e48aa8', share: .12, size: .09 } },
};
// FFW 2866 (Dyera costulata): large emergent tree to 80 m, bark dark grey, brown to black; crown distinctly tiered
// when young and irregular when mature; leathery leaves in whorls of 4-8, 5.5-42 cm long; young flush red.
// HT 2015-239, the tree at the Rain Forest entrance: 29.2 m tall, girth 4.10 m; crown lofty, dense and dome-like,
// of many ascending limbs each ending in a conical head of foliage. Neither page states buttresses.
const jelutong: TreeSpec = {
  kind: 'tree', name: 'Jelutong', scientific: 'Dyera costulata', status: 'Native to Singapore (Vulnerable)',
  source: 'https://heritagetrees.nparks.gov.sg/heritagetrees/ht-2015-239/', seed: 113, height: 29, bole: .5,
  trunk: { colour: '#4d4a45', dark: '#2a2826', fissure: .25, radius: .65, taper: .6, flare: .25, flareHeight: 1, sides: 8, lean: .01 },
  limbs: { tiers: 3, perTier: 5, rise: [30, 62], turn: [52, 76], length: .27, topShare: .5, girth: .34, clusters: 2, scatter: 1.6, leader: true },
  crown: { foliage: 'whorl', leaf: '#3d7a3e', tip: '#2c5f33', young: '#b9707a', radius: 3, sprays: 8, spray: 2.6, droop: .2, flatten: 1.2, flush: .07 },
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
    crown: { foliage: 'rosette', leaf: '#3f7a3c', tip: '#2d5e30', young: '#86a556', radius: 3.3, sprays: 10, spray: 2.6, droop: .14, flatten: .45, flush: .1 },
  },
  'rain-tree': rainTree,
  // The Bandstand's ring. SBG's heritage-landscapes page: the Bandstand lawn is "planted with a ring of Yellow Rain
  // Trees (Samanea saman), some of which were reproduced by cloning". It gives no count; the leaf colour is authored.
  'yellow-rain-tree': { ...rainTree, name: 'Yellow rain tree', seed: 109, source: 'https://sbg.nparks.gov.sg/attractions/heritage-trees-and-landscapes/',
    crown: { ...rainTree.crown, leaf: '#c3c24a', tip: '#a3ab3e', young: '#dfd968' } },
  jelutong,
  // The tiered young form FFW describes, for the forest's lower storey: level whorls of limbs up a leader.
  'jelutong-young': { ...jelutong, seed: 127, height: 15, bole: .38, source: 'https://www.nparks.gov.sg/florafaunaweb/flora/2/8/2866',
    trunk: { ...jelutong.trunk, radius: .3, flare: .15, flareHeight: .6, sides: 6 },
    limbs: { tiers: 3, perTier: 3, rise: [4, 14], turn: [0, 10], length: .26, topShare: .5, girth: .3, clusters: 1, scatter: .3, leader: true },
    crown: { ...jelutong.crown, radius: 2.6, sprays: 7, spray: 2.6, flatten: .45, flush: .04 } },
  // HT 2012-193, the tree near the Bandstand: 18 m tall, girth 3.25 m, planted July 1942 from seed E.J.H. Corner
  // collected on Malaya's east coast; Corner is quoted on the species' "beautiful, open, fine-leafed crown".
  // FFW 2862 (Dryobalanops aromatica): to about 45 m, trunk surface fissured, buttresses, broadly ovate leathery
  // leaves 4-6 by 2-4 cm; native to Sumatra, Borneo and Peninsular Malaysia. Bark colour is not stated.
  kapur: {
    kind: 'tree', name: 'Kapur', scientific: 'Dryobalanops aromatica', status: 'Non-native (Sumatra, Borneo, Peninsular Malaysia)',
    source: 'https://heritagetrees.nparks.gov.sg/heritagetrees/ht-2012-193/', seed: 131, height: 18, bole: .42,
    trunk: { colour: '#6b5544', dark: '#3d2f25', fissure: .5, radius: .52, taper: .5, flare: .25, flareHeight: .9, sides: 8, lean: .01 },
    buttress: { count: 4, height: 1.3, spread: 1.2, thickness: .14 },
    limbs: { tiers: 3, perTier: 4, rise: [18, 46], turn: [34, 58], length: .22, topShare: .55, girth: .32, clusters: 2, scatter: .9, leader: true },
    crown: { foliage: 'alternate', leaf: '#4f8a44', tip: '#3a7038', young: '#93b060', radius: 2, sprays: 12, spray: 1.25, droop: .18, flatten: .8, flush: .12 },
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
