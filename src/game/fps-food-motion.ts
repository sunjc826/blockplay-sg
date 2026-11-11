import { mix, pointIn, pose, supplyMotion, type Pose, type SupplyMotion } from './fps-healing';
import { smoothStep } from './fps-weapon-motion';

const ramp = (p: number, a: number, b: number) => smoothStep((p - a) / (b - a));
export interface FoodMotion extends SupplyMotion {
  open: number;
  bites: number;
  sip: number;
  lift: number;
  loaded: boolean;
  utensil: Pose;
  drink: Pose;
  tool: 'none' | 'spoon' | 'chopsticks';
}

/** Absolute-time choreography: seeking, interruption and replay never accumulate transforms. */
export function foodMotion(id: string, progress: number): FoodMotion {
  const p = Math.max(0, Math.min(1, progress));
  const snack = id === 'food-kaya-toast' || id === 'food-curry-puff';
  const smoking = id === 'food-smoking-corner';
  const drinkSet = id === 'food-field-ration' || smoking;
  const tingkat = id === 'food-ah-ma-tingkat';
  const soup = id === 'food-bak-kut-teh';
  const chopsticks = id === 'food-mala-da-la';
  const open = ramp(p, .16, tingkat ? .32 : .27);
  const start = snack ? .18 : tingkat ? .34 : .29;
  const end = drinkSet ? .57 : .79;
  const cycles = tingkat ? 4 : smoking ? 2 : 3;
  const work = Math.max(0, Math.min(cycles, (p - start) / (end - start) * cycles));
  const phase = work >= cycles ? 1 : work % 1;
  // Scoop/pinch, lift, a brief mouth contact, then return. Consumption occurs at contact.
  const lift = ramp(phase, .12, .43) * (1 - ramp(phase, .62, .96));
  const bites = Math.min(cycles, Math.floor(work) + (phase >= .5 ? 1 : 0));
  const sip = drinkSet ? ramp(p, .6, .68) * (1 - ramp(p, .77, .85)) : soup ? ramp(p, .8, .83) * (1 - ramp(p, .86, .9)) : 0;
  const present = ramp(p, 0, .15) * (1 - ramp(p, .9, 1));
  const hidden = pose(.16, -.65, -.42), hiddenLeft = pose(-.16, -.65, -.42);
  let item = pose(-.09, -.18, -.46, .18, -.12, -.06);
  let right: Pose, left: Pose;
  if (snack || smoking) {
    item = mix(pose(.08, -.18, -.4, .28, -.25, .12), pose(.005, -.075, -.24, .55, .1, -.18), lift);
    right = { ...pointIn(item, { x: .012, y: -.055, z: .025 }), rx: item.rx - .2, ry: item.ry, rz: item.rz };
    left = pose(-.16, -.34, -.44, -.3, .25, -.2);
  } else {
    if (soup) item = mix(item, pose(-.02, -.095, -.2, .8, 0, -.07), sip);
    left = { ...pointIn(item, { x: -.018, y: -.065, z: .025 }), rx: -.25, ry: .1, rz: -.25 };
    const scoop = { ...pointIn(item, { x: .10, y: .005, z: .015 }), rx: -.15, ry: 0, rz: -.2 };
    right = mix(scoop, pose(.1, -.11, -.28, -.1, 0, -.25), lift);
    // The free hand peels the packet seal or releases the lid before reaching for cutlery.
    if (!soup && !chopsticks) right = mix(pose(-.015 + open * .12, -.19 + Math.sin(open * Math.PI) * .07, -.4, -.3, 0, -.4 - open * .5), right, ramp(p, .26, start + .035));
  }
  const drink = mix(pose(smoking ? -.13 : .16, -.29, -.43, 0, 0, 0), pose(smoking ? -.02 : .02, smoking ? -.155 : -.085, -.18, smoking ? .12 : .85, 0, smoking ? .08 : -.18), sip);
  if (drinkSet) {
    const hand = { ...pointIn(drink, { x: smoking ? -.025 : .065, y: smoking ? -.035 : -.015, z: .025 }), rx: drink.rx, ry: 0, rz: smoking ? -.3 : .3 };
    if (smoking) left = hand;
    else right = mix(right, hand, ramp(p, .56, .6));
  }
  const base = supplyMotion('eat', p);
  return {
    ...base, item: mix(hiddenLeft, item, present), right: mix(hidden, right, present), left: mix(hiddenLeft, left, present),
    remaining: 1, action: lift, open, bites, sip, lift, loaded: work < cycles && phase >= .12 && phase < .5,
    rightGrip: snack || smoking ? .55 : .64, leftGrip: .4,
    view: { pitch: -.012 * lift * present, roll: (chopsticks ? -.008 : .004) * lift * present },
    tool: snack || smoking ? 'none' : chopsticks ? 'chopsticks' : 'spoon',
    utensil: mix(hidden, right, present), drink: mix(hidden, drink, present),
  };
}
