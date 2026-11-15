import * as THREE from 'three';
import { batchRigidMeshes } from './rigid-batches';
import { createVegetationKit, isVegetationKind, VEGETATION_PROPS, type VegetationKind } from './vegetation-props';

export type StreetPropKind = VegetationKind | 'planter' | 'bench' | 'bollard' | 'cabinet' | 'vending' | 'bike-rack' | 'crate' | 'flower-pot' | 'cone' | 'stool' | 'wheelie-bin' | 'trolley' | 'picnic-table' | 'cafe-table' | 'parasol' | 'pallet-stack' | 'sack-stack' | 'drum' | 'notice-board' | 'recycling-station' | 'hawker-table' | 'tray-return' | 'chess-table' | 'letterboxes' | 'park-bin';
export type PropBehavior = 'fixed' | 'breakable' | 'movable';
export interface StreetPropSpec { kind: StreetPropKind; name: string; behavior: PropBehavior; setting: string; detail: string; width: number; depth: number; height: number }
export const STREET_PROPS: readonly StreetPropSpec[] = [
  { kind: 'planter', name: 'Rain-garden planter', behavior: 'fixed', setting: 'Promenades & plazas', detail: 'Fluted concrete, a recessed soil bed and broad tropical leaves.', width: 1.77, depth: .89, height: 1.27 },
  { kind: 'bench', name: 'Estate bench', behavior: 'fixed', setting: 'HDB courtyards & parks', detail: 'Warm timber slats on heavy terrazzo feet, with steel armrests.', width: 1.9, depth: .65, height: .96 },
  { kind: 'bollard', name: 'Reflective bollard', behavior: 'fixed', setting: 'Service lanes & entrances', detail: 'A yellow safety sleeve, reflective bands and a bolted base.', width: .42, depth: .42, height: 1.06 },
  { kind: 'cabinet', name: 'Utility cabinet', behavior: 'fixed', setting: 'Back lanes & industrial yards', detail: 'Louvred doors, a rain hood, warning plate and a concrete plinth.', width: 1.1, depth: .66, height: 1.65 },
  { kind: 'vending', name: 'Cold-drinks machine', behavior: 'fixed', setting: 'Void decks & station approaches', detail: 'Teal enamel, colourful drink rows, coin slot and a recessed collection tray.', width: 1.05, depth: .94, height: 1.91 },
  { kind: 'bike-rack', name: 'Cycle stand', behavior: 'fixed', setting: 'Park connectors & town centres', detail: 'Three steel hoops with reflective collars, anchored to a common rail.', width: 2.15, depth: .64, height: .84 },
  { kind: 'crate', name: 'Produce crate', behavior: 'breakable', setting: 'Markets & loading bays', detail: 'Open slatted timber with green produce. Breaks into planks and loose contents.', width: .86, depth: .66, height: .6 },
  { kind: 'flower-pot', name: 'Terracotta pot', behavior: 'breakable', setting: 'Shophouse five-foot ways', detail: 'A rolled clay rim and a compact shrub. Shatters into clay pieces and foliage.', width: .6, depth: .6, height: .92 },
  { kind: 'cone', name: 'Roadwork cone', behavior: 'movable', setting: 'Maintenance corners', detail: 'Orange moulded plastic, white reflective bands and a heavy rubber foot.', width: .55, depth: .55, height: .84 },
  { kind: 'stool', name: 'Kopitiam stool', behavior: 'movable', setting: 'Hawker centres & shopfronts', detail: 'A red plastic seat with a carry slot, splayed legs and cross braces.', width: .51, depth: .51, height: .46 },
  { kind: 'wheelie-bin', name: 'Estate wheelie bin', behavior: 'movable', setting: 'Service alleys & food courts', detail: 'Green moulded body, hinged lid, grab handle and two rear wheels.', width: .62, depth: .76, height: 1.06 },
  { kind: 'trolley', name: 'Delivery hand trolley', behavior: 'movable', setting: 'Shop deliveries & workshops', detail: 'Blue tubular frame, rubber grips, a toe plate and chunky wheels.', width: .62, depth: .75, height: 1.23 },
  { kind: 'picnic-table', name: 'Park picnic set', behavior: 'fixed', setting: 'Gardens & estate greens', detail: 'Timber table and paired benches on a braced steel frame.', width: 2.1, depth: 1.7, height: .76 },
  { kind: 'cafe-table', name: 'Kopitiam table', behavior: 'fixed', setting: 'Market seating corners', detail: 'Cream laminate top, green rim and a four-foot pedestal.', width: .95, depth: .95, height: .76 },
  { kind: 'parasol', name: 'Market parasol', behavior: 'fixed', setting: 'Outdoor seating & promenades', detail: 'Eight striped canvas panels, radial ribs and a weighted pole. Walk underneath the canopy.', width: 2.9, depth: 2.9, height: 2.71 },
  { kind: 'pallet-stack', name: 'Delivery pallets', behavior: 'fixed', setting: 'Loading corners & workshops', detail: 'Three staggered wooden pallets with open fork channels and end blocks.', width: 1.3, depth: 1.05, height: .42 },
  { kind: 'sack-stack', name: 'Bagged supplies', behavior: 'fixed', setting: 'Nurseries & service yards', detail: 'Offset rows of sand-coloured sacks with stitched seams and green bands.', width: 1.39, depth: .95, height: .79 },
  { kind: 'drum', name: 'Workshop drum', behavior: 'movable', setting: 'Maintenance & industrial corners', detail: 'Blue steel drum, reinforcing hoops, sealed lid and offset bung. Non-explosive.', width: .61, depth: .61, height: .9 },
  { kind: 'notice-board', name: 'Community noticeboard', behavior: 'fixed', setting: 'Estate paths & park entrances', detail: 'A framed board with layered coloured notices, two posts and a rain hood.', width: 1.35, depth: .38, height: 1.84 },
  { kind: 'recycling-station', name: 'Blue commingled recycling bin', behavior: 'fixed', setting: 'Open HDB collection points', detail: 'One blue body for mixed recyclables, a rain hood, broad opening and guidance panel. Placed outside void decks.', width: 1.32, depth: .88, height: 1.58 },
  { kind: 'hawker-table', name: 'Fixed hawker dining set', behavior: 'fixed', setting: 'Hawker dining bays', detail: 'Laminate table, steel pedestal and four anchored round stools. A clear aisle separates each dining row.', width: 2.19, depth: 1.47, height: .78 },
  { kind: 'tray-return', name: 'Tray-return rack', behavior: 'fixed', setting: 'Visible edges of hawker dining areas', detail: 'Open stainless-steel shelves, return-point header and neatly stacked trays and crockery.', width: 1.35, depth: .65, height: 1.9 },
  { kind: 'chess-table', name: 'Mosaic chess-table set', behavior: 'fixed', setting: 'Sheltered HDB communal bays', detail: 'Blue mosaic border, a playable-looking checkerboard and four concrete stools. Inspired by older estate furniture.', width: 2.3, depth: 2.3, height: .8 },
  { kind: 'letterboxes', name: 'Communal letterbox bank', behavior: 'fixed', setting: 'Residential ground-floor lobbies', detail: 'A sheltered bank of individual metal doors, posting slots, name plates and locks.', width: 2.05, depth: .48, height: 1.73 },
  { kind: 'park-bin', name: 'Hooded park litter bin', behavior: 'fixed', setting: 'Path-side rest bays', detail: 'Ground-mounted slatted casing with a rain hood and open disposal slot, separated from nearby seating.', width: .65, depth: .65, height: 1.14 },

  ...VEGETATION_PROPS,
];
export const streetPropSpec = (kind: StreetPropKind) => STREET_PROPS.find(p => p.kind === kind)!;

/** Shared geometry/material pool. One kit per world, disposed after its models. */
export function createStreetPropKit() {
  const vegetation=createVegetationKit();
  const geometries: THREE.BufferGeometry[] = [], materials = new Map<string, THREE.MeshStandardMaterial>();
  const keep = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g; };
  const cube = keep(new THREE.BoxGeometry(1, 1, 1)), cylinder = keep(new THREE.CylinderGeometry(.5, .5, 1, 12));
  const taper = keep(new THREE.BoxGeometry(1, 1, 1));
  const taperedPositions=taper.attributes.position;
  for(let i=0;i<taperedPositions.count;i++)if(taperedPositions.getY(i)<0){taperedPositions.setX(i,taperedPositions.getX(i)*.8);taperedPositions.setZ(i,taperedPositions.getZ(i)*.8);}
  taper.computeVertexNormals();
  const cone = keep(new THREE.CylinderGeometry(.08, .5, 1, 12));
  const leaf = keep(new THREE.IcosahedronGeometry(.5, 1));
  // A broad blade in XY, folded along a raised midrib. Shared by the planted props.
  const frond = keep(new THREE.BufferGeometry());
  {
    const outline=[[-.05,0],[-.3,.2],[-.46,.5],[-.32,.82],[0,1],[.32,.82],[.46,.5],[.3,.2],[.05,0]],vertices:number[]=[];
    for(let i=0;i<outline.length;i++){const a=outline[i],b=outline[(i+1)%outline.length];vertices.push(0,.46,.07,...a,0,...b,0);}
    frond.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));frond.computeVertexNormals();
  }
  const palette = { concrete: '#aaa99b', dark: '#263734', steel: '#728985', wood: '#aa7950', woodLight: '#c49865', green: '#356c44', leaf: '#5c9250', soil: '#443c30', teal: '#248887', cream: '#e6e5ce', yellow: '#e9b442', orange: '#ea682b', red: '#b74336', clay: '#ba7250', blue: '#39829e' };
  type Color = keyof typeof palette;
  // Foliage is its own material so leaves never count as ballistic cover.
  const mat = (color: Color, doubleSided=false, foliage=false) => {
    const key=`${color}:${doubleSided}:${foliage}`;let m = materials.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ color: palette[color], roughness: color === 'steel' ? .4 : .82, metalness: color === 'steel' ? .65 : 0, side:doubleSided?THREE.DoubleSide:THREE.FrontSide }); if(foliage)m.userData.visualCover=true; materials.set(key, m); }
    return m;
  };
  function build(kind: StreetPropKind) {
    const root = new THREE.Group(), spec = streetPropSpec(kind);
    root.name = spec.name; root.userData.streetProp = kind;
    const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, w: number, h: number, d: number, color: Color) => {
      const m = new THREE.Mesh(g, mat(color)); m.position.set(x,y,z); m.scale.set(w,h,d); m.castShadow = m.receiveShadow = true; root.add(m); return m;
    };
    const box = (x:number,y:number,z:number,w:number,h:number,d:number,c:Color) => add(cube,x,y,z,w,h,d,c);
    const round = (x:number,y:number,z:number,w:number,h:number,c:Color) => add(cylinder,x,y,z,w,h,w,c);
    const bar = (a:number[],b:number[],r:number,c:Color) => { const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),m=round(0,0,0,r,from.distanceTo(to),c);m.position.copy(from).add(to).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),to.sub(from).normalize());return m; };
    // A rosette of blades rooted in the soil, each leaning out along its own heading.
    const plant = (x:number,y:number,count:number,width:number,length:number) => {
      for(let i=0;i<count;i++){
        const a=i*2.4,m=new THREE.Mesh(frond,mat(i%2?'leaf':'green',true,true));
        m.position.set(x+Math.sin(a)*.03,y,Math.cos(a)*.03);m.scale.set(width,length*(.8+(i%3)*.1),width*.5);m.rotation.set(.3+(i%4)*.2,a,0,'YXZ');
        m.castShadow=m.receiveShadow=true;root.add(m);
      }
    };
    if(kind==='planter') {
      box(0,.37,0,1.65,.68,.85,'concrete');box(0,.73,0,1.5,.06,.7,'soil');
      for(let i=-5;i<=5;i++)for(const z of [-.43,.43])box(i*.14,.38,z,.035,.56,.025,'cream');
      for(const x of [-.5,0,.5])plant(x,.75,6,.3,.62);
      // Only the concrete is solid; the leaves overhang it.
      root.userData.streetPropColliders=[{min:[-.825,.03,-.425],max:[.825,.76,.425]}];
    } else if(kind==='bench') {
      for(const x of [-.67,.67])box(x,.24,0,.22,.48,.65,'concrete');
      for(let i=0;i<4;i++)box(0,.51,-.25+i*.15,1.9,.085,.12,i%2?'woodLight':'wood');
      for(const x of [-.72,.72]){box(x,.71,.29,.055,.48,.055,'steel');box(x,.69,0,.055,.045,.55,'steel');}
      for(let i=0;i<3;i++)box(0,.69+i*.11,.29,1.9,.085,.065,i%2?'wood':'woodLight');
    } else if(kind==='bollard') {
      box(0,.045,0,.42,.09,.42,'dark');round(0,.55,0,.22,1,'yellow');
      for(const y of [.68,.88])round(0,y,0,.226,.09,'cream');
      round(0,1.04,0,.24,.04,'dark');for(const x of [-.15,.15])for(const z of [-.15,.15])round(x,.1,z,.035,.025,'steel');
    } else if(kind==='cabinet') {
      box(0,.08,0,1.1,.16,.65,'concrete');box(0,.86,0,.95,1.4,.56,'steel');box(0,1.6,0,1.06,.09,.64,'dark');
      box(0,.86,.286,.018,1.3,.025,'dark');
      for(const x of [-.24,.24]) {for(let i=0;i<6;i++)box(x,.4+i*.075,.295,.32,.025,.025,'dark');box(x,1.18,.3,.15,.14,.025,'yellow');box(x+.1,.85,.31,.035,.13,.04,'dark');}
    } else if(kind==='vending') {
      box(0,.98,0,1.05,1.86,.8,'teal');box(0,.1,0,.9,.2,.7,'dark');
      box(-.12,1.2,.41,.65,.99,.035,'dark');box(0,1.79,.42,.89,.18,.035,'cream');
      for(let row=0;row<3;row++)for(let col=0;col<4;col++){round(-.36+col*.16,.84+row*.28,.45,.09,.17,(col+row)%2?'orange':'green');box(-.36+col*.16,.83+row*.28,.497,.075,.035,.008,'cream');}
      for(let row=0;row<3;row++)box(-.12,.72+row*.28,.46,.65,.025,.07,'steel');
      box(.36,1.2,.4175,.15,.5,.035,'steel');box(.36,1.33,.44,.09,.018,.02,'dark');box(.36,1.02,.445,.07,.07,.02,'yellow');
      box(-.07,.42,.42,.7,.22,.04,'dark');box(-.07,.31,.47,.74,.04,.14,'steel');
    } else if(kind==='bike-rack') {
      for(const z of [-.27,.27])box(0,.05,z,2.15,.1,.1,'dark');
      for(const x of [-.83,0,.83]){bar([x,0,-.27],[x,.8,-.27],.065,'steel');bar([x,0,.27],[x,.8,.27],.065,'steel');bar([x,.8,-.27],[x,.8,.27],.065,'steel');round(x,.66,-.27,.072,.1,'yellow');}
    } else if(kind==='crate') {
      for(let i=0;i<5;i++)box(-.34+i*.17,.065,0,.15,.09,.65,'wood');
      for(const x of [-.39,.39])for(const z of [-.28,.28])box(x,.32,z,.07,.6,.07,'woodLight');
      for(let i=0;i<3;i++){for(const z of [-.3,.3])box(0,.18+i*.18,z,.85,.12,.055,i%2?'woodLight':'wood');for(const x of [-.4,.4])box(x,.18+i*.18,0,.055,.12,.58,'wood');}
      for(let i=0;i<5;i++)add(leaf,(i%3-1)*.22,.41,Math.floor(i/3)*.24-.12,.24,.25,.24,'green');
    } else if(kind==='flower-pot') {
      // Individual clay panels become the fracture pieces; the dark soil seals the pot.
      for(let i=0;i<10;i++){const a=i*Math.PI/5,m=box(Math.sin(a)*.23,.27,Math.cos(a)*.23,.16,.48,.075,'clay');m.rotation.y=a;m.rotation.x=-.12;}
      round(0,.51,0,.59,.09,'clay');round(0,.56,0,.47,.025,'soil');plant(0,.565,8,.2,.42);
    } else if(kind==='cone') {
      box(0,.045,0,.55,.09,.55,'dark');add(cone,0,.46,0,.44,.76,.44,'orange');
      // Each band is its own frustum, 4 mm proud of the cone's slope at that height.
      const radius=(y:number)=>.22-(y-.08)*.1848/.76+.004;
      for(const [low,high] of [[.34,.5],[.58,.68]]){
        const band=new THREE.Mesh(keep(new THREE.CylinderGeometry(radius(high),radius(low),high-low,12,1,true)),mat('cream'));
        band.position.y=(low+high)/2;band.castShadow=band.receiveShadow=true;root.add(band);
      }
    } else if(kind==='stool') {
      // Two seat halves leave a real carry slot.
      for(const x of [-.115,.115])box(x,.45,0,.2,.06,.44,'red');
      for(const x of [-1,1])for(const z of [-1,1])bar([x*.22,.03,z*.22],[x*.16,.43,z*.16],.065,'red');
      for(const z of [-.2,.2])bar([-.2,.17,z],[.2,.17,z],.035,'red');
    } else if(kind==='wheelie-bin') {
      add(taper,0,.53,0,.6,.94,.65,'green');box(0,1.02,0,.62,.09,.72,'green');box(0,.66,.3,.21,.22,.025,'cream');
      bar([-.22,.95,-.37],[.22,.95,-.37],.055,'dark');
      for(const x of [-.25,.25]){const wheel=round(x,.14,-.25,.26,.09,'dark');wheel.rotation.z=Math.PI/2;}
    } else if(kind==='trolley') {
      for(const x of [-.24,.24]){bar([x,.15,.13],[x,1.2,-.15],.055,'blue');bar([x,1.2,-.15],[x,1.2,-.3],.065,'dark');const wheel=round(x,.16,.13,.3,.1,'dark');wheel.rotation.z=Math.PI/2;}
      for(const y of [.35,.65,.95])bar([-.24,y,.13-(y-.15)*.27],[.24,y,.13-(y-.15)*.27],.045,'blue');
      box(0,.1,.27,.62,.055,.36,'blue');
    }
    if(kind==='picnic-table') {
      for(let i=0;i<6;i++)box(0,.74,-.36+i*.145,2.1,.08,.125,i%2?'wood':'woodLight');
      for(const z of [-.7,.7])for(const dz of [-.08,.08])box(0,.43,z+dz,2.1,.08,.14,'wood');
      for(const x of [-.74,.74]){bar([x,.05,-.7],[x,.7,-.25],.075,'dark');bar([x,.05,.7],[x,.7,.25],.075,'dark');box(x,.36,0,.07,.07,1.7,'dark');box(x,.68,0,.07,.05,.8,'dark');}
      bar([-.74,.3,0],[.74,.3,0],.055,'steel');
    } else if(kind==='cafe-table') {
      round(0,.7,0,.95,.09,'green');round(0,.755,0,.91,.025,'cream');round(0,.36,0,.09,.7,'steel');
      for(let i=0;i<4;i++){const a=i*Math.PI/2;bar([0,.13,0],[Math.sin(a)*.37,.035,Math.cos(a)*.37],.055,'dark');}
    } else if(kind==='parasol') {
      round(0,.065,0,.55,.13,'concrete');round(0,1.32,0,.055,2.55,'wood');
      for(let i=0;i<8;i++){
        const a=i*Math.PI/4,b=(i+1)*Math.PI/4;
        const geometry=keep(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,2.65,0,Math.sin(a)*1.45,2.17,Math.cos(a)*1.45,Math.sin(b)*1.45,2.17,Math.cos(b)*1.45],3));geometry.computeVertexNormals();
        const panel=new THREE.Mesh(geometry,mat(i%2?'cream':'teal',true));panel.castShadow=panel.receiveShadow=true;root.add(panel);
        bar([0,2.61,0],[Math.sin(a)*1.43,2.15,Math.cos(a)*1.43],.018,'wood');
      }
      round(0,2.68,0,.11,.06,'wood');
      root.userData.streetPropColliders=[{min:[-.28,0,-.28],max:[.28,2.14,.28]},{min:[-1.45,2.15,-1.45],max:[1.45,2.71,1.45]}];
    } else if(kind==='pallet-stack') {
      for(let row=0;row<3;row++){
        const off=row%2?.07:-.03;
        for(const x of [-.45,0,.45])for(const z of [-.35,.35])box(x+off,.07+row*.1375,z,.16,.1,.18,'wood');
        for(let i=0;i<5;i++)box(-.5+i*.25+off,.13+row*.1375,0,.2,.055,1.05,i%2?'woodLight':'wood');
      }
    } else if(kind==='sack-stack') {
      for(let row=0;row<3;row++)for(let i=0;i<2;i++){
        const x=(i-.5)*.55+(row%2?.06:-.06),y=.14+row*.24;
        add(leaf,x,y,0,.72,.31,.95,'cream');box(x,y+.14,0,.055,.012,.61,'green');box(x,y,.42,.38,.025,.02,'wood');
      }
    } else if(kind==='drum') {
      round(0,.45,0,.58,.87,'blue');for(const y of [.07,.3,.62,.88])round(0,y,0,.605,.035,'steel');
      round(.13,.9,.09,.08,.025,'dark');round(-.14,.9,-.1,.04,.025,'steel');box(0,.47,.296,.22,.14,.012,'cream');
    } else if(kind==='notice-board') {
      for(const x of [-.52,.52])box(x,.89,0,.075,1.78,.075,'steel');
      box(0,1.31,0,1.3,.87,.1,'wood');box(0,1.31,.061,1.16,.73,.025,'cream');box(0,1.8,0,1.35,.08,.38,'green');
      for(let i=0;i<5;i++){const x=-.43+(i%3)*.34,y=1.47-Math.floor(i/3)*.32;box(x,y,.082,.25,.26,.018,i%2?'yellow':'teal');for(let j=0;j<3;j++)box(x,y+.05-j*.05,.094,.16,.013,.005,'cream');}
    } else if(kind==='recycling-station') {
      box(0,.08,0,1.3,.16,.82,'dark');box(0,.64,0,1.28,1.02,.8,'blue');
      box(0,1.14,-.3,1.3,.12,.22,'blue');box(0,1.43,-.12,1.32,.14,.62,'blue');
      for(const x of [-.59,.59])box(x,1.27,-.12,.12,.27,.62,'blue');
      box(0,.71,.407,1.05,.62,.018,'cream');box(0,.94,.419,.91,.045,.015,'blue');
      for(let row=0;row<2;row++)for(let col=0;col<4;col++){const x=-.36+col*.24;box(x,.73-row*.21,.425,.13,.14,.025,row?'green':'blue');box(x,.62-row*.21,.427,.15,.018,.028,'dark');}
      box(0,1.52,-.13,.56,.11,.04,'cream');
    } else if(kind==='hawker-table') {
      box(0,.74,0,1.35,.08,.8,'cream');box(0,.69,0,1.39,.035,.84,'green');
      round(0,.35,0,.12,.7,'dark');round(0,.035,0,.55,.07,'dark');
      // Table and seats are separate solids, so the space between them stays open.
      const solids=[{min:[-.695,0,-.42],max:[.695,.78,.42]}];root.userData.streetPropColliders=solids;
      for(const x of [-.88,.88])for(const z of [-.52,.52]){round(x,.025,z,.36,.05,'dark');round(x,.23,z,.065,.46,'dark');round(x,.47,z,.43,.07,'green');solids.push({min:[x-.215,0,z-.215],max:[x+.215,.505,z+.215]});}
    } else if(kind==='tray-return') {
      for(const x of [-.63,.63])for(const z of [-.28,.28])box(x,.91,z,.045,1.82,.045,'steel');
      for(const y of [.12,.46,.8,1.14,1.48]){box(0,y,0,1.3,.035,.63,'steel');box(0,y+.04,-.29,1.3,.08,.025,'steel');}
      // The header is fixed across the two front posts.
      box(0,1.76,.3,1.35,.28,.04,'teal');
      // Simple tray/bowl pictograms remain legible at world scale, without baked text.
      box(-.26,1.75,.326,.28,.025,.012,'cream');box(-.26,1.8,.326,.17,.06,.012,'cream');
      box(.22,1.76,.326,.32,.035,.012,'cream');
      // Stacks sit on the shelf surface (shelf centre + 1.75 cm).
      for(const y of [.1375,.4775,.8175])for(let i=0;i<3;i++){box(-.29,y+.01+i*.02,.02,.48,.02,.37,'dark');round(.29,y+.0125+i*.025,.04,.3,.025,'cream');}
    } else if(kind==='chess-table') {
      box(0,.37,0,.43,.74,.43,'concrete');box(0,.74,0,1.22,.08,1.22,'teal');
      for(let x=0;x<8;x++)for(let z=0;z<8;z++)box((x-3.5)*.125,.786,(z-3.5)*.125,.124,.012,.124,(x+z)%2?'cream':'dark');
      // Fine grout on the border and seats makes the mosaic read beyond colour.
      for(let i=-6;i<=6;i++)for(const side of [-1,1]){box(i*.09,.787,side*.56,.006,.009,.11,'cream');box(side*.56,.787,i*.09,.11,.009,.006,'cream');}
      const solids=[{min:[-.61,0,-.61],max:[.61,.792,.61]}];root.userData.streetPropColliders=solids;
      for(const [x,z] of [[-.92,0],[.92,0],[0,-.92],[0,.92]]){solids.push({min:[x-.23,0,z-.23],max:[x+.23,.51,z+.23]});box(x,.22,z,.32,.44,.32,'concrete');box(x,.46,z,.46,.08,.46,'teal');for(let i=-2;i<=2;i++){box(x+i*.08,.505,z,.005,.01,.44,'cream');box(x,.505,z+i*.08,.44,.01,.005,'cream');}}
    } else if(kind==='letterboxes') {
      for(const x of [-.8,.8])box(x,.42,0,.08,.84,.34,'steel');box(0,1.12,0,2.05,1.13,.4,'dark');
      for(let row=0;row<4;row++)for(let col=0;col<6;col++){const x=(col-2.5)*.325,y=.72+row*.26;box(x,y,.21,.31,.245,.035,'steel');box(x,y+.065,.233,.23,.02,.012,'dark');box(x-.065,y-.045,.234,.1,.035,.014,'cream');round(x+.09,y-.055,.24,.025,.025,'dark').rotation.x=Math.PI/2;}
      box(0,1.7,0,2.05,.06,.45,'steel');
    } else if(kind==='park-bin') {
      round(0,.04,0,.65,.08,'concrete');round(0,.47,0,.54,.87,'dark');
      for(let i=0;i<12;i++){const a=i*Math.PI/6,m=box(Math.sin(a)*.285,.46,Math.cos(a)*.285,.115,.75,.035,'wood');m.rotation.y=a;}
      for(const x of [-.22,.22])box(x,.98,0,.045,.28,.045,'steel');round(0,1.1,0,.65,.07,'dark');
    }
    // Breakables retain their authored fragments. Other props use merged material draws.
    // Rest the lowest real vertex on y=0. Boxes of rotated bars and round parts overstate their reach.
    root.updateMatrixWorld(true);const base=new THREE.Box3().setFromObject(root,true).min.y;
    for(const child of root.children)child.position.y-=base;
    for(const shape of root.userData.streetPropColliders??[]){shape.min[1]-=base;shape.max[1]-=base;}
    root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root,true);
    // Preserve authoring precision for collision, independent of merged Float32 vertices.
    root.userData.streetPropBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
    if(spec.behavior!=='breakable')for(const batch of batchRigidMeshes(root,{trackGeometry:keep}))batch.name='Street prop parts';
    return root;
  }
  const templates = new Map<StreetPropKind, THREE.Group>();
  return {
    create(kind:StreetPropKind) { if(isVegetationKind(kind))return vegetation.create(kind);let template=templates.get(kind);if(!template){template=build(kind);templates.set(kind,template);}return template.clone(true); },
    dispose(){vegetation.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());templates.clear();},
  };
}

/** How far each kind turns to lie down, for a fall about +x, -x, +z and -z. */
const restAngles=new Map<StreetPropKind,number[]>();
const TIP_AXES=[new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)];
/** A toppled prop settles where its middle is lowest: flat on a side for a bin,
 * on its base edge and tip for a cone. Found once per kind from the standing vertices. */
function restAngle(root:THREE.Group,kind:StreetPropKind,index:number) {
  let angles=restAngles.get(kind);
  if(!angles){
    root.updateMatrixWorld(true);
    const local=new THREE.Matrix4(),toRoot=root.matrixWorld.clone().invert(),points:THREE.Vector3[]=[],box=new THREE.Box3();
    root.traverse(node=>{
      if(!(node instanceof THREE.Mesh))return;
      local.multiplyMatrices(toRoot,node.matrixWorld);const position=node.geometry.getAttribute('position');
      for(let i=0;i<position.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(local));
    });
    const middle=box.setFromPoints(points).getCenter(new THREE.Vector3()),turn=new THREE.Quaternion(),p=new THREE.Vector3();
    angles=TIP_AXES.map(axis=>{
      const height=(degrees:number)=>{
        turn.setFromAxisAngle(axis,degrees*Math.PI/180);let low=Infinity;
        for(const point of points)low=Math.min(low,p.copy(point).applyQuaternion(turn).y);
        return p.copy(middle).applyQuaternion(turn).y-low;
      };
      let best=90;const step=height(91)<height(89)?1:-1;
      while(best+step>=50&&best+step<=150&&height(best+step)<height(best))best+=step;
      return best*Math.PI/180;
    });
    restAngles.set(kind,angles);
  }
  return angles[index];
}

/** Cosmetic, bounded floor physics. It never changes navigation or ballistic cover. */
export function createPropMotion(root: THREE.Group, kind: StreetPropKind) {
  const spec=streetPropSpec(kind), origin=root.position.clone(), rest=root.quaternion.clone();
  const parts=root.children.map((mesh,index)=>({mesh,position:mesh.position.clone(),rotation:mesh.quaternion.clone(),velocity:new THREE.Vector3(),spin:new THREE.Vector3(Math.sin(index*2.3)*4,Math.cos(index)*3,2)}));
  const velocity=new THREE.Vector3(), axis=new THREE.Vector3(), floorBounds=new THREE.Box3();let active=false,broken=false,age=0,lie=Math.PI/2;
  const hit=(direction:THREE.Vector3)=>{
    if(spec.behavior==='fixed'||broken||active||!direction.toArray().every(Number.isFinite))return false;
    active=true;age=0;
    if(spec.behavior==='breakable') {
      broken=true;const local=direction.clone().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert());
      parts.forEach((p,i)=>p.velocity.set(local.x*1.2+Math.sin(i*2.4)*1.1,1.3+(i%4)*.35,local.z*1.2+Math.cos(i*2.4)*1.1));
    }
    else {
      velocity.set(direction.x*1.5,1.1,direction.z*1.5);axis.set(direction.z,0,-direction.x);
      // Fall about whichever of the prop's own axes is nearest the push, so it lands on a side, not an edge.
      let side=0,nearest=-Infinity;const candidate=new THREE.Vector3();
      TIP_AXES.forEach((local,i)=>{const d=candidate.copy(local).applyQuaternion(rest).dot(axis);if(d>nearest){nearest=d;side=i;}});
      axis.copy(TIP_AXES[side]).applyQuaternion(rest);lie=restAngle(root,kind,side);
    }
    return true;
  };
  return { root, hit, get broken(){return broken;},get active(){return active;},
    update(dt:number){
      if(!active||!Number.isFinite(dt)||dt<=0)return;
      const step=Math.min(dt,.05);age+=step;
      if(broken){
        parts.forEach(p=>{p.velocity.y-=9.8*step;p.mesh.position.addScaledVector(p.velocity,step);p.mesh.rotation.x+=p.spin.x*step;p.mesh.rotation.z+=p.spin.z*step;
          p.mesh.updateMatrix();const mesh=p.mesh as THREE.Mesh;if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();floorBounds.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrix);
          if(floorBounds.min.y<.015){p.mesh.position.y+=.015-floorBounds.min.y;p.velocity.y=Math.abs(p.velocity.y)*.22;p.velocity.x*=.74;p.velocity.z*=.74;p.spin.multiplyScalar(.7);}
          p.mesh.position.x=THREE.MathUtils.clamp(p.mesh.position.x,-1.15,1.15);p.mesh.position.z=THREE.MathUtils.clamp(p.mesh.position.z,-1.15,1.15);
        });
      } else {
        velocity.y-=9.8*step;root.position.addScaledVector(velocity,step);
        // Pivot support rises as the body tips, keeping its lowest point above the floor.
        root.quaternion.copy(rest).premultiply(new THREE.Quaternion().setFromAxisAngle(axis,Math.min(lie,age*3)));
        // True vertices: a loose box would hold round or tilted props off the floor.
        root.updateMatrixWorld(true);floorBounds.setFromObject(root,true);if(floorBounds.min.y<origin.y){root.position.y+=origin.y-floorBounds.min.y;velocity.y=Math.abs(velocity.y)*.18;velocity.x*=.85;velocity.z*=.85;}
        root.position.x=THREE.MathUtils.clamp(root.position.x,origin.x-.8,origin.x+.8);root.position.z=THREE.MathUtils.clamp(root.position.z,origin.z-.8,origin.z+.8);
      }
      if(age>2.5)active=false;
    },
    reset(){active=broken=false;age=0;root.position.copy(origin);root.quaternion.copy(rest);parts.forEach(p=>{p.mesh.position.copy(p.position);p.mesh.quaternion.copy(p.rotation);});},
  };
}
export type PropMotion = ReturnType<typeof createPropMotion>;
