import type { HudReadout } from './cast-hud-contract';

export const exampleHud:HudReadout = {
  phase:'playing',district:'changi',degrees:315,vehicle:'on-foot',sector:'Jewel terraces',heading:'NW',objective:'Clear as many targets as you can in 90 seconds.',
  health:95,maxHealth:100,armor:20,maxArmor:50,stance:'standing',weapon:'SAR 21',carried:['SAR 21','P30'],
  magazine:20,reserve:60,spareMagazines:2,capacity:30,fireMode:'auto',weaponState:'chambered',
  belt:[{kind:'bandage',count:2,name:'Field dressing'}],selected:'bandage',seconds:45,score:1,streak:1,clock:'45s left',
  map:{jammed:false,sight:60,markers:[{kind:'target',label:'Target 2',bearing:'NE',metres:40},{kind:'loot',label:'Range resupply',bearing:'W',metres:20}]},
};
