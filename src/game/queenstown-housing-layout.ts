/** Compressed estate blocks, not surveyed addresses or public apartment access. */
export const QUEENSTOWN_HDB_BLOCKS = [
  { id: 'estate', x: -73, z: -44, storeys: 10, color: '#6d9d92', label: 'ESTATE' },
  { id: 'queens', x: -73, z: -83, storeys: 12, color: '#c58c77', label: 'QUEENS' },
  { id: 'hdb', x: 78, z: 76, storeys: 16, color: '#6d9d92', label: 'HDB' },
  { id: 'home', x: -76, z: 77, storeys: 9, color: '#c58c77', label: 'HOME' },
  { id: 'commonwealth', x: -91, z: -153, storeys: 11, color: '#729eaf', label: 'COMMONWEALTH' },
  { id: 'dawson', x: 78, z: 151, storeys: 13, color: '#6d9d92', label: 'DAWSON' },
] as const;
export const HDB_GALLERY_LEVELS = [3.4, 6.2] as const;
export const HDB_WIDTH = 59;
export const HDB_CORE_OFFSET = 33.7;

/** Shared boundaries for the concrete finish, terrain cut-outs and exterior paving. */
export function queenstownGroundFloors({x,z}:{x:number;z:number}) {
  const finish={y:0,rails:false,supports:false,color:'#c5c8c3'};
  return [
    {id:'void-deck',x,z:z+.5,width:HDB_WIDTH,depth:16,...finish},
    ...([-1,1] as const).map(side=>({id:`${side<0?'west':'east'}-entry`,x:x+side*HDB_CORE_OFFSET,z:z+3,width:8.4,depth:11,...finish})),
  ];
}
export const QUEENSTOWN_DECK_FOOTPRINTS=QUEENSTOWN_HDB_BLOCKS.flatMap(block=>queenstownGroundFloors(block).map(f=>({
  minX:f.x-f.width/2,maxX:f.x+f.width/2,minZ:f.z-f.depth/2,maxZ:f.z+f.depth/2,
})));
export const onQueenstownDeck=(x:number,z:number)=>QUEENSTOWN_DECK_FOOTPRINTS.some(f=>x>=f.minX&&x<=f.maxX&&z>=f.minZ&&z<=f.maxZ);
