/**
 * Palms that grow in Singapore, as the numbers the palm builder (palm-models.ts) works from.
 * Morphology is from the NParks Flora & Fauna Web page named on each entry, read 23 November 2026;
 * figures FFW does not give are marked in docs/SINGAPORE-VEGETATION.md with where they came from.
 * Heights are game-scale younger palms, well under each species' maximum. Leaflets are far fewer
 * and wider than life (a coconut frond has 80 to 100 pairs): each drawn leaflet stands for several.
 */
export type PalmSpecies = 'coconut' | 'royal' | 'sealing-wax' | 'footstool' | 'nibong' | 'cycad' | 'tree-fern';
export interface PalmSpec {
  name: string; scientific: string;
  /** As NParks states it. */
  status: string;
  source: string;
  seed: number;
  /** Ground to where the fronds leave the trunk, tallest stem (m). */
  height: number;
  trunk: {
    colour: string; scar: string; young: string; boss: string;
    /** Radii (m) at the foot and under the crown, and how quickly one becomes the other. */
    base: number; top: number; taper: number;
    /** Extra radius at the very foot, dying away over `flareHeight` metres. */
    flare: number; flareHeight: number;
    /** Extra radius in a swelling centred `bulgeAt` of the way up. */
    bulge: number; bulgeAt: number; bulgeWidth: number;
    ringSpacing: number; maxRings: number; ridge: number; scarDepth: number; sides: number;
    /** Lean at the foot, as a share of height: least and most. */
    lean: readonly [number, number];
    /** Slender spines standing off the trunk: how many a stem shows, their length (m) and colour. */
    spines?: { count: number; length: number; colour: string };
  };
  crownshaft?: { colour: string; top: string; length: number; swell: number; neck: number };
  fruit?: { count: number; size: number; drop: number; colours: readonly string[] };
  clump?: { stems: number; spread: number; shortest: number; lean: number };
  frond: {
    leaf: string; tip: string; old: string; dead: string; rib: string;
    count: number;
    /** Degrees above horizontal the youngest and oldest fronds leave at, and how the ages between spread. */
    rise: readonly [number, number]; spread: number;
    /** Degrees the rachis curves over along its length, youngest and oldest; `curve` puts the bend toward the tip. */
    bend: readonly [number, number]; curve: number;
    length: number; segments: number; hub: number; spreadHeight: number; ribWidth: number;
    /** Share of the frond that is bare stalk. */
    petiole: number;
    pairs: number;
    /** Degrees each successive leaflet lifts out of the frond's plane: one value is a flat frond, several a plumose one. */
    planes: readonly number[];
    sweep: number; droop: number; leaflet: number; leafletWidth: number;
    yellowing: number; deadFronds: number; spear: number;
    fan?: { radius: number; arc: number; segments: number; pleat: number; joined: number; droop: number; tilt: number };
  };
}

export const PALM_SPECS: Readonly<Record<PalmSpecies, PalmSpec>> = {
  // FFW: solitary; slender grey trunk prominently ringed with leaf scars; pinnate leaves to 5 m,
  // ascending to spreading to drooping, yellowish to dark green; lanceolate leaflets 50-150 cm;
  // inflorescence from within the lower fronds; ovoid fruit to 30 cm, green or yellow ripening brown.
  coconut: {
    name: 'Coconut palm', scientific: 'Cocos nucifera', status: 'Originally Western Pacific, now pantropical; coastal, roadside and beachfront planting',
    source: 'https://www.nparks.gov.sg/florafaunaweb/flora/5/6/5618', seed: 11, height: 11,
    trunk: { colour: '#a59c89', scar: '#7b7264', young: '#a3987a', boss: '#7a6142', base: .19, top: .15, taper: .7, flare: .13, flareHeight: .55,
      bulge: 0, bulgeAt: .5, bulgeWidth: .3, ringSpacing: 1.1, maxRings: 9, ridge: .07, scarDepth: .55, sides: 8, lean: [.05, .17] },
    fruit: { count: 6, size: .16, drop: .5, colours: ['#7f9a3e', '#a9a546', '#8a6a3c'] },
    frond: { leaf: '#5a9a44', tip: '#3f7a35', old: '#b5aa4e', dead: '#8a6a41', rib: '#b9b769', count: 14, rise: [74, -42], spread: 1.15, bend: [38, 72], curve: 1.5,
      length: 4.7, segments: 7, hub: .12, spreadHeight: .6, ribWidth: .055, petiole: .16, pairs: 14, planes: [-6], sweep: 24, droop: .5,
      leaflet: 1.05, leafletWidth: .2, yellowing: .55, deadFronds: 1, spear: .5 },
  },
  // FFW: solitary; single massive trunk bulging slightly towards the middle, concrete-grey with
  // closely spaced rings; glossy green smooth crownshaft to 2 m; pinnate leaves to 3 m, plumose
  // and rather tangled; dead fronds fall whole; inflorescence below the crownshaft.
  royal: {
    name: 'Royal palm', scientific: 'Roystonea regia', status: 'Introduced (Florida, Mexico, Central America and Caribbean); avenue, roadside and coastal planting',
    source: 'https://www.nparks.gov.sg/florafaunaweb/flora/2/6/2682', seed: 23, height: 10.5,
    trunk: { colour: '#a7a59c', scar: '#84827a', young: '#a9a89b', boss: '#7d7a6c', base: .24, top: .19, taper: 1, flare: .07, flareHeight: .4,
      bulge: .055, bulgeAt: .5, bulgeWidth: .26, ringSpacing: .9, maxRings: 10, ridge: .035, scarDepth: .5, sides: 9, lean: [0, .012] },
    crownshaft: { colour: '#4f8a3d', top: '#7fae4c', length: 1.7, swell: 1.12, neck: .62 },
    frond: { leaf: '#4f9040', tip: '#38722f', old: '#9aa54c', dead: '#8a6a41', rib: '#a3b662', count: 14, rise: [78, -24], spread: 1.25, bend: [48, 86], curve: 1.35,
      length: 3.3, segments: 7, hub: .08, spreadHeight: .35, ribWidth: .05, petiole: .1, pairs: 14, planes: [38, -14, 12, -36], sweep: 30, droop: .42,
      leaflet: .82, leafletWidth: .16, yellowing: .3, deadFronds: 0, spear: .55 },
  },
  // FFW: clustering; native, Critically Endangered; distinctively red crownshaft, bright red leaf
  // sheaths about 60 cm; pinnate leaves about 1.5 m by 0.6 m with bright red stalks and midribs;
  // boat-shaped leaflets about 45 by 4 cm. The palm in the Singapore Botanic Gardens' logo.
  'sealing-wax': {
    name: 'Sealing wax palm', scientific: 'Cyrtostachys renda', status: 'Native to Singapore, Critically Endangered',
    source: 'https://www.nparks.gov.sg/florafaunaweb/flora/2/6/2618', seed: 37, height: 6.2,
    trunk: { colour: '#99a474', scar: '#6f7658', young: '#9fb068', boss: '#7a6142', base: .055, top: .045, taper: 1, flare: .015, flareHeight: .25,
      bulge: 0, bulgeAt: .5, bulgeWidth: .3, ringSpacing: .8, maxRings: 6, ridge: .06, scarDepth: .5, sides: 6, lean: [.02, .06] },
    crownshaft: { colour: '#c8281f', top: '#d8432a', length: .62, swell: 1.25, neck: .7 },
    clump: { stems: 6, spread: .75, shortest: .32, lean: .09 },
    frond: { leaf: '#4f9444', tip: '#3a7636', old: '#8fa650', dead: '#8a6a41', rib: '#cf3324', count: 8, rise: [80, 2], spread: 1, bend: [16, 46], curve: 1.3,
      length: 1.5, segments: 5, hub: .03, spreadHeight: .12, ribWidth: .022, petiole: .12, pairs: 8, planes: [24], sweep: 34, droop: .16,
      leaflet: .45, leafletWidth: .1, yellowing: .2, deadFronds: 0, spear: .5 },
  },
  // FFW: solitary; non-native (spontaneous, casual); long-stalked, spirally arranged fan leaves,
  // blades almost round in outline, regularly divided to about half their length, 1.2 m across;
  // suitable for streetscapes, roadsides, parks and gardens.
  footstool: {
    name: 'Footstool palm', scientific: 'Saribus rotundifolius', status: 'Non-native (spontaneous, casual); Borneo to New Guinea; streetscape and park planting',
    source: 'https://www.nparks.gov.sg/florafaunaweb/flora/2/6/2653', seed: 53, height: 8.2,
    trunk: { colour: '#a59b88', scar: '#80786a', young: '#a09c78', boss: '#6f5a3e', base: .13, top: .1, taper: .9, flare: .04, flareHeight: .35,
      bulge: 0, bulgeAt: .5, bulgeWidth: .3, ringSpacing: .55, maxRings: 12, ridge: .03, scarDepth: .4, sides: 8, lean: [0, .02] },
    frond: { leaf: '#52943f', tip: '#3b7633', old: '#9aa54c', dead: '#8a6a41', rib: '#7fa24c', count: 22, rise: [80, -48], spread: 1, bend: [6, 20], curve: 1.2,
      length: 1.45, segments: 3, hub: .05, spreadHeight: .3, ribWidth: .026, petiole: 1, pairs: 0, planes: [0], sweep: 0, droop: 0,
      leaflet: 0, leafletWidth: 0, yellowing: .35, deadFronds: 1, spear: 0,
      fan: { radius: .62, arc: 320, segments: 14, pleat: .05, joined: .52, droop: .3, tilt: 12 } },
  },
  // FFW 2659: tall, slender, tuft-forming palm massed with armed trunks, to 30 m; trunks up to 15 cm across, ringed,
  // up to 50 to a clump, densely armed with slender black spines 5 to 10 cm long; conspicuous armed crownshaft;
  // pinnate fronds ascending to spreading, pendulous and elegantly arched, dark to bright green, drooping leaflets;
  // globose purple to black fruit 1 cm across. FFW gives no frond length, crownshaft colour or trunk colour.
  nibong: {
    name: 'Nibong', scientific: 'Oncosperma tigillarium', status: 'Native to Singapore (Least Concern)',
    source: 'https://www.nparks.gov.sg/florafaunaweb/flora/2/6/2659', seed: 67, height: 11,
    trunk: { colour: '#7f7868', scar: '#5a5448', young: '#7d8262', boss: '#5a5040', base: .078, top: .064, taper: 1, flare: .012, flareHeight: .3,
      bulge: 0, bulgeAt: .5, bulgeWidth: .3, ringSpacing: 1.3, maxRings: 6, ridge: .05, scarDepth: .5, sides: 6, lean: [.01, .04],
      spines: { count: 12, length: .1, colour: '#17140f' } },
    crownshaft: { colour: '#6c7a55', top: '#8a9a62', length: .9, swell: 1.2, neck: .7 },
    fruit: { count: 4, size: .04, drop: .25, colours: ['#2a1d2e', '#3a2440'] },
    clump: { stems: 6, spread: 1.1, shortest: .42, lean: .05 },
    frond: { leaf: '#3f8038', tip: '#2f6630', old: '#8a9a4c', dead: '#8a6a41', rib: '#7f9a52', count: 8, rise: [72, -18], spread: 1.1, bend: [34, 78], curve: 1.3,
      length: 2.6, segments: 5, hub: .04, spreadHeight: .2, ribWidth: .03, petiole: .12, pairs: 8, planes: [-34], sweep: 18, droop: 1.5,
      leaflet: .72, leafletWidth: .1, yellowing: .25, deadFronds: 0, spear: .5 },
  },
  // Not palms, but palm-shaped, so the palm builder draws them. FFW 5651 (Cycas edentata): palm-like non-flowering
  // plant with an emergent, usually unbranched trunk to about 10 m; spiny feather-like fronds to 2.3 m of 100-200
  // glossy, stiff, leathery, narrowly boat-shaped leaflets set neatly either side of the axis; coastal.
  // FFW gives no trunk colour or girth. Each drawn leaflet stands for about eight.
  cycad: {
    name: 'Paku Raja (cycad)', scientific: 'Cycas edentata', status: 'Native to Singapore (Critically Endangered)',
    source: 'https://www.nparks.gov.sg/florafaunaweb/flora/5/6/5651', seed: 79, height: 1.7,
    trunk: { colour: '#5e5346', scar: '#3a332b', young: '#6a5c44', boss: '#8a6a3c', base: .2, top: .18, taper: 1, flare: .04, flareHeight: .3,
      bulge: 0, bulgeAt: .5, bulgeWidth: .3, ringSpacing: .22, maxRings: 8, ridge: .1, scarDepth: .6, sides: 7, lean: [0, .05] },
    frond: { leaf: '#3f7f3a', tip: '#2f6a33', old: '#7f9648', dead: '#8a6a41', rib: '#8aa456', count: 16, rise: [76, -8], spread: 1, bend: [8, 26], curve: 1.4,
      length: 2.1, segments: 4, hub: .1, spreadHeight: .2, ribWidth: .03, petiole: .14, pairs: 14, planes: [18], sweep: 12, droop: .06,
      leaflet: .26, leafletWidth: .07, yellowing: .2, deadFronds: 0, spear: 0 },
  },
  // FFW 1544 (Alsophila latebrosa): tree-like fern of a single trunk bearing several large fronds, to 4 m; plant
  // shape "Fountain (Palm-like)"; fronds bipinnate, middle pinnae up to 75 by 25 cm; forest fringes and open areas.
  // FFW gives no trunk girth or colour and no frond length. The pinnae are drawn whole, not divided again.
  'tree-fern': {
    name: 'Tree fern', scientific: 'Alsophila latebrosa', status: 'Native to Singapore (Least Concern)',
    source: 'https://www.nparks.gov.sg/florafaunaweb/flora/1/5/1544', seed: 89, height: 3,
    trunk: { colour: '#3d3128', scar: '#241c17', young: '#4f4030', boss: '#6a4f30', base: .09, top: .075, taper: 1, flare: .05, flareHeight: .3,
      bulge: 0, bulgeAt: .5, bulgeWidth: .3, ringSpacing: .4, maxRings: 8, ridge: .12, scarDepth: .5, sides: 6, lean: [.01, .07] },
    frond: { leaf: '#5d9a48', tip: '#49843c', old: '#8f9a4a', dead: '#7a5a3a', rib: '#6a5a3a', count: 11, rise: [62, -12], spread: 1, bend: [36, 74], curve: 1.3,
      length: 2.5, segments: 6, hub: .05, spreadHeight: .15, ribWidth: .028, petiole: .14, pairs: 9, planes: [-4], sweep: 8, droop: .5,
      leaflet: .68, leafletWidth: .24, yellowing: .25, deadFronds: 1, spear: .22 },
  },
};
export const PALM_SPECIES = Object.keys(PALM_SPECS) as PalmSpecies[];
