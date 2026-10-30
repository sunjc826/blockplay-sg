import * as THREE from 'three';
import { type VerticalRoute } from './vertical-routes';
import { withVerticalPlaces, type VerticalPlace } from './vertical-places';
import { QUEENSTOWN_STAMPS } from '../data/region-stamps.ts';
import type { Obstacle } from './queenstown-collision';
import { QUEENSTOWN_HDB_BLOCKS, QUEENSTOWN_HOUSING_PLACES, HDB_CORE_OFFSET } from './queenstown-housing';
import { QUEENSTOWN_BANKS, QUEENSTOWN_BANK_PATHS, QUEENSTOWN_LANDSCAPE_PLACES, QUEENSTOWN_PATHS, QUEENSTOWN_SHADE_TREES, QUEENSTOWN_SHRUB_BEDS, queenstownTerrainHeight } from './queenstown-landscape';

export const QUEENSTOWN_SPAWN = { x: -18, z: 83, yaw: -0.35 };
export const QUEENSTOWN_MAP_ROADS = [
  { points: [{x:-140,z:-122},{x:140,z:-122},{x:140,z:116},{x:-140,z:116},{x:-140,z:-122}] },
  { points: [{x:-150,z:22},{x:150,z:22}] },
  { points: [{x:-15,z:32},{x:-15,z:116}] },
  { points: [{x:-235,z:-185},{x:235,z:-185},{x:235,z:185},{x:-235,z:185},{x:-235,z:-185}] },
  { points: [{x:0,z:-122},{x:0,z:-185}] },
  { points: [{x:-15,z:116},{x:-15,z:185}] },
  { points: [{x:150,z:22},{x:235,z:22}] },
  { points: [{x:-235,z:-122},{x:-140,z:-122}] },
];
export { QUEENSTOWN_STAMPS } from '../data/region-stamps.ts';

/** Compressed heritage-inspired estate, not a surveyed model or exact present-day streets. */
export const QUEENSTOWN_VERTICAL_ROUTES: VerticalRoute[] = [];
export const QUEENSTOWN_VERTICAL_PLACES: VerticalPlace[] = [...QUEENSTOWN_HOUSING_PLACES, ...QUEENSTOWN_LANDSCAPE_PLACES];

export function buildQueenstownScene() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#bcd9e7');
  scene.fog = new THREE.Fog('#bcd9e7', 240, 650);
  scene.add(new THREE.HemisphereLight('#eff8ff', '#747454', 1.8));
  const sun = new THREE.DirectionalLight('#fff0dc', 2); sun.position.set(-70, 150, 85); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -275, right: 275, top: 230, bottom: -230, far: 650 });
  sun.shadow.normalBias = 0.2; scene.add(sun);
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], textures: THREE.Texture[] = [];
  const obstacles: Obstacle[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g; };
  const mat = (color: string) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 }); materials.push(m); return m; };
  const unit = geo(new THREE.BoxGeometry(1, 1, 1));
  const cream = mat('#ece7d6'), teal = mat('#6d9d92'), coral = mat('#c58c77'), glass = mat('#556f78'), dark = mat('#424b49');
  const concrete = mat('#b6b5a7'), grass = mat('#75915e'), leaf = mat('#487743'), white = mat('#f4f1df'), asphalt = mat('#555957');
  const red = mat('#b36655'), orange = mat('#f09a43'), wood = mat('#846b52');
  const stationBlue = mat('#668faa'), walkwayBlue = mat('#36799b');
  const paving = mat('#d6c7b2'), yellow = mat('#e2c566'), shrub = mat('#628548'), blue = mat('#729eaf');
  glass.roughness = 0.32; glass.metalness = 0.2;
  // Authored apartment panes receive occupancy lighting as whole panes, even
  // when their structure lives in the shared walkable-places renderer.
  const apartmentGlass = glass.clone(); apartmentGlass.userData.nightWindow = true; materials.push(apartmentGlass);
  stationBlue.roughness = 0.55; walkwayBlue.roughness = 0.55;
  const foliageLight = mat('#6a9050'), foliageDeep = mat('#3e693e');
  for (const foliage of [leaf, foliageLight, foliageDeep, shrub]) foliage.userData.visualCover = true;
  function box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, parent: THREE.Object3D = scene, shadow = false) {
    const mesh = new THREE.Mesh(unit, material); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function solid(x: number, z: number, w: number, d: number, maxY?: number) { obstacles.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, ...(maxY === undefined ? {} : {maxY}) }); }
  function structure(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material) {
    const mesh = box(x,y,z,w,h,d,material,scene,true);
    const collider = { minX:x-w/2, maxX:x+w/2, minZ:z-d/2, maxZ:z+d/2, minY:y-h/2, maxY:y+h/2 };
    scene.userData.traversalObstacles ??= [];
    scene.userData.traversalObstacles.push(collider);
    if (collider.minY <= .01) solid(x,z,w,d,collider.maxY);
    return mesh;
  }
  function beam(a: THREE.Vector3, b: THREE.Vector3, width: number, material: THREE.Material) {
    const middle = a.clone().add(b).multiplyScalar(0.5), direction = b.clone().sub(a);
    const mesh = box(middle.x,middle.y,middle.z,width,direction.length(),width,material,scene,true);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
    return mesh;
  }
  function sign(text: string, x: number, y: number, z: number, w = 14, h = 2) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 128;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#245d4f'; ctx.fillRect(0, 0, 768, 128); ctx.fillStyle = '#fff9e8'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 55px sans-serif'; ctx.fillText(text, 384, 66, 730);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture }); materials.push(material);
    const panel = new THREE.Mesh(geo(new THREE.PlaneGeometry(w, h)), material); panel.position.set(x, y, z); scene.add(panel); return panel;
  }
  box(0, -0.6, 0, 540, 1, 444, grass);
  // Connected outer district circuit doubles explorable area, not just backdrop size.
  for (const road of QUEENSTOWN_MAP_ROADS.slice(3)) for (let i=1;i<road.points.length;i++) {
    const a=road.points[i-1],b=road.points[i],horizontal=a.z===b.z,length=Math.hypot(a.x-b.x,a.z-b.z);
    box((a.x+b.x)/2,0,(a.z+b.z)/2,horizontal?length:14,0.12,horizontal?14:length,asphalt);
    for (const side of [-1,1]) box((a.x+b.x)/2+(horizontal?0:side*9),0.1,(a.z+b.z)/2+(horizontal?side*9:0),horizontal?length:3,0.2,horizontal?3:length,concrete);
    for (let d=6;d<length-4;d+=12) box(a.x+(b.x-a.x)*d/length,0.09,a.z+(b.z-a.z)*d/length,horizontal?5:0.18,0.02,horizontal?0.18:5,white);
  }
  // Continuous estate loop and Commonwealth Avenue-inspired central arterial.
  for (const z of [-122, 116, 22]) {
    box(0, 0, z, 300, 0.12, z === 22 ? 24 : 14, asphalt);
    for (let x = -142; x < 145; x += 12) box(x, 0.08, z, 5, 0.025, 0.18, white);
    for (const side of [-1, 1]) box(0, 0.1, z + side * (z === 22 ? 14 : 9), 300, 0.2, 3, concrete);
  }
  for (const x of [-140, 140]) {
    box(x, 0, -3, 14, 0.12, 238, asphalt);
    for (let z = -110; z < 110; z += 12) box(x, 0.08, z, 0.18, 0.025, 5, white);
  }
  // Crosswalks and an estate access lane; road widths remain navigable in drive mode.
  box(-15, 0.02, 74, 12, 0.12, 84, asphalt);
  for (const x of [-123, 118]) for (let z = 12; z <= 32; z += 3) box(x, 0.1, z, 5, 0.02, 1.5, white);
  for (const z of [-98, -10, 86]) box(0, 0.05, z, 266, 0.12, 5, concrete);
  box(-157, 0.06, 0, 5, 0.13, 266, mat('#c1ac8b'));
  const onStreet = (x: number, z: number, margin = 0) => QUEENSTOWN_MAP_ROADS.some((road, index) => road.points.slice(1).some((b, i) => {
    const a = road.points[i], half = index === 1 ? 12 : index === 2 ? 6 : 7;
    return x >= Math.min(a.x,b.x) - (a.x === b.x ? half + margin : margin) && x <= Math.max(a.x,b.x) + (a.x === b.x ? half + margin : margin) &&
      z >= Math.min(a.z,b.z) - (a.z === b.z ? half + margin : margin) && z <= Math.max(a.z,b.z) + (a.z === b.z ? half + margin : margin);
  }));
  // Cut the pedestrian links at carriageways; leave their asphalt visible.
  // Slightly raised edges read as pavement, not a second grass-coloured strip.
  for (const path of QUEENSTOWN_PATHS) {
    const alongX = path.width > path.depth, length = alongX ? path.width : path.depth;
    const count = Math.ceil(length / 2), run = length / count;
    for (let i = 0; i < count; i++) {
      const along = -length/2 + (i+.5)*run, x = path.x + (alongX ? along : 0), z = path.z + (alongX ? 0 : along);
      if (onStreet(x,z,1)) continue;
      box(x,.025,z,alongX ? run : path.width,.22,alongX ? path.depth : run,paving);
      for (const side of [-1,1]) box(x + (alongX ? 0 : side*(path.width/2-.08)),.12,z + (alongX ? side*(path.depth/2-.08) : 0),alongX ? run : .16,.08,alongX ? .16 : run,concrete);
    }
  }
  // Footpaths follow the earth slopes all the way over the crests. Their
  // movement support is the same earth plane, not floating cosmetic ramps.
  for (const path of QUEENSTOWN_BANK_PATHS) {
    const count=Math.ceil(path.length/2),run=path.length/count;
    for (let i=0;i<count;i++) {
      const offset=-path.length/2+i*run,x=path.x+(path.axis==='x'?offset:0),z=path.z+(path.axis==='z'?offset:0);
      const bx=x+(path.axis==='x'?run:0),bz=z+(path.axis==='z'?run:0);
      if(onStreet((x+bx)/2,(z+bz)/2,1)) continue;
      const a=queenstownTerrainHeight(x,z),b=queenstownTerrainHeight(bx,bz),length=Math.hypot(run,b-a);
      const strip=box((x+bx)/2,(a+b)/2+.105,(z+bz)/2,path.axis==='x'?length:2.4,.06,path.axis==='z'?length:2.4,paving);
      if(path.axis==='x')strip.rotation.z=Math.atan2(b-a,run);else strip.rotation.x=-Math.atan2(b-a,run);
    }
  }
  // Six older slab blocks share real void-deck/corridor/stair structure. All
  // solid housing geometry is authored in queenstown-housing with finite bounds.
  // The scene adds doors, grilles and services without sealing those spaces.
  for (const block of QUEENSTOWN_HDB_BLOCKS) {
    const { x, z, storeys, label } = block, height = storeys * 2.8;
    box(x, height + 3.7, z + .5, 60, .6, 17, concrete, scene, true);
    for (let floor = 0; floor < storeys; floor++) {
      const level = 3.4 + floor * 2.8, y = level + 1.4;
      // Apartment windows on the back; the south face is a recessed access
      // gallery with individual front doors, not a painted solid black strip.
      for (let dx = -22; dx < 28; dx += 5.5) {
        box(x + dx, y, z - 7.6, 2.5, 1.35, .12, apartmentGlass);
        box(x + dx + 1.8, y - .35, z - 7.8, .8, .65, .5, concrete);
        for (const offset of [-.72,.72]) box(x + dx, y + offset, z - 7.69, 2.7, .1, .28, cream);
        for (const offset of [-1.32,0,1.32]) box(x + dx + offset, y, z - 7.69, .09, 1.45, .28, cream);
      }
      for (const dx of [-22,-11,0,11,22]) {
        box(x + dx, level + 1.05, z + 4.56, 1.2, 2.1, .1, floor % 2 ? teal : wood);
        for (const edge of [-.67,.67]) box(x + dx + edge, level + 1.1, z + 4.65, .1, 2.2, .12, cream);
        box(x + dx, level + 2.18, z + 4.65, 1.44, .1, .12, cream);
        box(x + dx + .38, level + 1.02, z + 4.73, .08, .16, .09, dark);
        box(x + dx + 2.9, level + 1.55, z + 4.58, 2.2, 1.2, .1, apartmentGlass);
        for (const edge of [-1.15,0,1.15]) box(x + dx + 2.9 + edge, level + 1.55, z + 4.68, .07, 1.35, .12, cream);
        for (const dy of [1,1.55,2.1]) box(x + dx + 2.9, level + dy, z + 4.68, 2.3, .06, .12, cream);
        box(x + dx, level + 1.1, z + 8.4, 9.5, .1, .3, white);
      }
      for (const side of [-1,1]) {
        const cx = x + side * HDB_CORE_OFFSET;
        // Upper stair-tower vents continue the sheltered core up the building.
        if (floor > 1) {
          box(cx, y, z + 8.57, 4.5, 1.4, .12, dark);
          for (const dz of [-2,2]) box(cx + side * 4.28, y, z + 3 + dz, .12, 1.4, 2.4, apartmentGlass);
          for (const dy of [-.5,0,.5]) box(cx, y + dy, z + 8.66, 4.6, .08, .12, white);
          for (const edge of [-2.35,2.35]) box(cx + edge, y, z + 8.66, .1, 1.6, .12, cream);
        }
        // Raised frames/lattice retain the reviewed end-facade vocabulary.
        box(x + side * 29.6, y, z - 2, .12, 1.5, 3.2, apartmentGlass);
        box(x + side * 29.8, y - 1.1, z - 2, .55, .16, 4.5, concrete);
        box(x + side * 29.72, y, z - 2, .12, .1, 3.5, white).rotation.x = .4;
        box(x + side * 29.72, y, z - 2, .12, .1, 3.5, white).rotation.x = -.4;
      }
    }
    // A readable lift lobby, mailboxes, services and seating stay in the deck.
    box(x + 19, 1.35, z + 1.85, 2.1, 2.7, .1, glass);
    box(x + 19, 1.35, z + 1.92, .08, 2.7, .08, concrete);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 6; col++) {
      box(x + 17.25 + col * .65, .65 + row * .48, z - 3.05, .55, .38, .12, dark);
    }
    const light = mat('#eee7c7'); light.emissive.set('#dfd9b6'); light.emissiveIntensity = .65;
    for (const dx of [-19,-6,7,25]) box(x + dx, 2.8, z, 3, .06, .3, light);
    for (const level of [3.4,6.2]) for (const dx of [-19,-6,7,25]) box(x + dx, level + 2.48, z + 6.5, 3, .06, .3, light);
    for (const side of [-1,1]) sign('STAIRS  /  LIFT LOBBY', x + side * HDB_CORE_OFFSET, 2.55, z + 8.67, 7.2, .55);
    sign(label + '  /  VOID DECK', x - 14, 2.55, z + 8.63, 20, .65);
  }
  // Legacy ground-only consumers (map/spawn checks) receive the same finite
  // piers, lift shafts and stair walls, never a full rectangular block footprint.
  for (const place of QUEENSTOWN_HOUSING_PLACES) for (const f of place.fixtures ?? []) {
    if (f.solid === false || f.y - f.height / 2 > .01) continue;
    obstacles.push({ minX:f.x-f.width/2, maxX:f.x+f.width/2, minZ:f.z-f.depth/2, maxZ:f.z+f.depth/2, maxY:f.y+f.height/2 });
  }
  // Covered walkways connect open decks, estate paths and the station entrance.
  function shelter(x: number, z: number, width: number) {
    box(x, 3.05, z, width, 0.3, 4.2, concrete, scene, true);
    box(x, 0.08, z, width, 0.16, 4.4, concrete);
    for(let dx=-width/2+1;dx<width/2;dx+=2) box(x+dx,2.84,z,0.12,0.18,4,dark);
    for(const side of [-1,1]) box(x,2.8,z+side*1.7,width,0.18,0.18,dark);
    for (let dx = -width / 2 + 2; dx < width / 2; dx += 8) {
      box(x + dx, 1.5, z - 1.7, 0.2, 3, 0.2, walkwayBlue); solid(x + dx, z - 1.7, 0.25, 0.25);
    }
  }
  shelter(-76, -20, 92); shelter(62, 52, 100);
  // Elevated railway: clear underside, piers in the center median, station above.
  box(0, 7.8, 22, 360, 1.4, 9, concrete, scene, true);
  for (const z of [18, 26]) box(0, 8.7, z, 360, 0.6, 0.35, concrete);
  for (const z of [20.2, 23.8]) box(0, 8.55, z, 360, 0.1, 0.12, dark);
  for (let x = -175; x < 175; x += 2) box(x, 8.4, 22, 0.4, 0.1, 5.5, dark);
  const pierGeo=geo(new THREE.CylinderGeometry(1,1,1,12));
  for (let x = -164; x <= 170; x += 28) {
    const pier=new THREE.Mesh(pierGeo,concrete);pier.position.set(x,3.6,22);pier.scale.set(0.8,7.2,1.1);pier.castShadow=true;scene.add(pier);solid(x,22,1.6,2.2);
    box(x,7.15,22,3.2,0.65,5.5,concrete,scene,true);
  }
  for(let x=-174;x<178;x+=7) for(const z of [17.45,26.55]) box(x,7.8,z,0.035,1.35,0.04,dark);
  box(0, 9.2, 22, 74, 0.8, 19, cream, scene, true);
  for (const z of [14, 30]) for (let x = -32; x <= 32; x += 8) box(x, 11.2, z, 0.35, 4, 0.35, cream);
  for (const z of [14, 30]) {
    box(0, 9.75, z, 71, 0.15, 0.3, yellow);
    box(0, 10.25, z, 72, 0.7, 0.12, glass);
    for (let x = -35; x <= 35; x += 3.5) box(x, 10.2, z, 0.13, 1.2, 0.16, concrete);
  }
  const roofSection = new THREE.Shape(); roofSection.moveTo(-10.4, 0); roofSection.quadraticCurveTo(0, 7, 10.4, 0); roofSection.lineTo(10.4, -0.3); roofSection.quadraticCurveTo(0, 6.6, -10.4, -0.3); roofSection.closePath();
  const roofGeo = geo(new THREE.ExtrudeGeometry(roofSection, { depth: 78, bevelEnabled: false, curveSegments: 12 }));
  const stationRoof = new THREE.Mesh(roofGeo, teal); stationRoof.rotation.y = Math.PI / 2; stationRoof.position.set(-39, 13, 22); stationRoof.castShadow = true; scene.add(stationRoof);
  sign('EW19  QUEENSTOWN', 0, 10.4, 31.7, 29, 2.2);
  for (const x of [-42, 42]) {
    box(x, 4.5, 39, 6, 9, 6, stationBlue, scene, true); solid(x, 39, 6, 6);
    box(x, 6.1, 42.1, 4.7, 2.6, 0.12, glass);
    for (let y = 5; y <= 7; y += 0.45) box(x, y, 42.25, 5.3, 0.11, 0.15, concrete);
    for(let y=5;y<=7;y+=0.45) {const louver=box(x,y,42.47,5.5,0.12,0.5,dark);louver.rotation.x=-0.18;}
    for(const dx of [-2.7,0,2.7]) box(x+dx,6,42.7,0.12,2.6,0.13,stationBlue);
    box(x, 9.2, 32, 6, 0.5, 14, cream);
    // station-east.png: trailing greenery over screened service bays, blue
    // lower walls and dark doors beneath projecting louver frames.
    box(x, 1.4, 42.12, 2.2, 2.8, 0.14, dark);
    box(x + 0.7, 1.35, 42.25, 0.08, 0.25, 0.1, white);
    for (const dx of [-2.1, 2.1]) {
      box(x + dx, 2.2, 42.14, 1.05, 3.6, 0.14, dark);
      for(let y=0.6;y<3.8;y+=0.25)box(x+dx,y,42.28,1.02,0.08,0.22,concrete);
      box(x + dx, 4.25, 42.4, 1.4, 0.4, 0.5, leaf);
      for(let n=0;n<4;n++) {
        const length=0.8+(n%3)*0.55;
        box(x+dx-0.5+n*0.33,4.1-length/2,42.5+n%2*0.08,0.3,length,0.22,n%2?foliageLight:foliageDeep);
      }
    }
    // Recessed blue link sides and window bays continue around the entrance.
    for(const side of [-1,1]) {
      box(x+side*3.08,6.2,39,0.14,3.7,5.8,stationBlue);
      for(const dz of [-1.8,0,1.8]) {
        box(x+side*3.18,6.4,39+dz,0.12,2,1.3,glass);
        box(x+side*3.28,5.3,39+dz,0.2,0.18,1.5,concrete);
      }
    }
    sign('MRT', x, 3.8, 42.75, 4, 1.2);
  }
  // Runs to a timetable, stopping at EW19 (district-set-pieces).
  const train = new THREE.Group(); train.name = 'queenstown-train'; scene.add(train);
  for (let n = 0; n < 3; n++) {
    const x = n * 13 - 13;
    box(x, 10, 22, 12, 2.8, 3.2, cream, train); box(x, 9.3, 23.65, 12, 0.35, 0.06, red, train);
    for (let dx = -4; dx <= 4; dx += 2) box(x + dx, 10.25, 23.65, 1.3, 1, 0.06, glass, train);
  }
  // Low-rise neighbourhood shops and market canopy, not tourist landmarks.
  box(73, 3, -13, 65, 6, 13, cream, scene, true); solid(73, -13, 65, 13);
  const shopNames = ['KOPI', 'PROVISIONS', 'BAKERY', 'MARKET'];
  const tabletopGeo=geo(new THREE.CylinderGeometry(0.85,0.85,0.12,16));
  for (let i = 0; i < 4; i++) {
    const x = 49 + i * 16;
    box(x, 1.7, -6.4, 12, 2.9, 0.15, glass); box(x, 3.6, -4.7, 15, 0.25, 4, i % 2 ? teal : coral, scene, true);
    sign(shopNames[i], x, 4.9, -6.25, 12, 1.2);
    for (const dx of [-3, 3]) {
      const top=new THREE.Mesh(tabletopGeo,cream);top.position.set(x+dx,0.8,-1);scene.add(top);
      box(x+dx,0.4,-1,0.25,0.8,0.25,dark);solid(x+dx,-1,1.7,1.7);
      for(const side of [-1,1]) {box(x+dx+side*1.15,0.48,-1,0.55,0.12,0.55,dark);box(x+dx+side*1.15,0.23,-1,0.12,0.46,0.12,dark);}
    }
  }
  // margaret-90: blue barrel-roof neighbourhood hall and pale colonnaded frontage.
  // Reuse the authored station roof section, scaled to the compact market pavilion.
  const marketRoof = new THREE.Mesh(roofGeo, blue); marketRoof.rotation.y = Math.PI / 2;
  marketRoof.scale.set(0.67,0.48,0.88); marketRoof.position.set(38.7,6.4,-13); marketRoof.castShadow = true; scene.add(marketRoof);
  // Static market-roof: narrow standing seams follow the barrel, not flat bands.
  const ribPath=new THREE.QuadraticBezierCurve3(new THREE.Vector3(0,6.42,-19.96),new THREE.Vector3(0,9.78,-13),new THREE.Vector3(0,6.42,-6.04));
  const ribGeo=geo(new THREE.TubeGeometry(ribPath,12,0.035,4,false));
  for(let x=40;x<106;x+=2.2) {const rib=new THREE.Mesh(ribGeo,stationBlue);rib.position.x=x;scene.add(rib);}
  for (let x = 44; x < 104; x += 8) box(x,2.8,-6.2,0.45,5.6,0.7,white);
  // Community court with accurately marked game-scale basketball half circles.
  box(85, 0.08, -53, 32, 0.16, 45, red);
  box(85, 0.18, -53, 27, 0.02, 40, mat('#729888'));
  for (const x of [71.5, 98.5]) box(x, 0.2, -53, 0.15, 0.02, 40, white);
  for (const z of [-73, -53, -33]) box(85, 0.2, z, 27, 0.02, 0.15, white);
  const ringGeo = geo(new THREE.TorusGeometry(4, 0.075, 4, 32));
  const centerRing = new THREE.Mesh(ringGeo, white); centerRing.rotation.x = Math.PI / 2; centerRing.position.set(85, 0.22, -53); scene.add(centerRing);
  for (const z of [-76, -30]) { box(85, 1.6, z, 0.2, 3.2, 0.2, dark); solid(85, z, 0.4, 0.4); box(85, 3, z, 2.5, 1.4, 0.1, white); }
  // Permeable court fencing leaves the north/south entries and collectible unobstructed.
  for (const x of [66, 104]) {
    for (let z = -76; z <= -30; z += 4) { box(x, 1.4, z, 0.1, 2.8, 0.1, dark); solid(x, z, 0.15, 0.15); }
    for (const y of [0.4, 1.4, 2.6]) box(x, y, -53, 0.08, 0.07, 48, dark);
  }
  // Heritage-inspired library: low profile, red roof, long window wall and garden.
  box(23, 3.4, -103, 44, 6.8, 17, cream, scene, true); solid(23, -103, 44, 17);
  box(23, 3.4, -94.4, 35, 4.5, 0.15, glass);
  for (let x = 6; x < 42; x += 4) box(x, 3.4, -94.2, 0.2, 4.5, 0.2, white);
  for (const side of [-1, 1]) { const roof = box(23, 7.4, -103 + side * 4.3, 47, 0.45, 9.5, red, scene, true); roof.rotation.x = side * 0.15; }
  sign('QUEENSTOWN LIBRARY', 23, 5.7, -94.02, 29, 1.4);
  const crownGeo = geo(new THREE.IcosahedronGeometry(1, 1));
  const trunkGeo = geo(new THREE.CylinderGeometry(0.24,0.4,1,7));
  let treeCount = 0;
  function tree(x: number, z: number, height = 7, mature = false, base = 0) {
    treeCount++;
    const thickness = mature ? 1.6 : 1;
    const trunk=new THREE.Mesh(trunkGeo,wood);trunk.position.set(x,base+height/2,z);trunk.scale.set(thickness,height,thickness);trunk.castShadow=true;scene.add(trunk);solid(x,z,.8*thickness,.8*thickness,base+height);
    const phase=(x*0.73+z*0.37),palette=[leaf,foliageLight,foliageDeep];
    for (let j = 0; j < 4; j++) {
      const angle=phase+j*Math.PI/2,spread=1.6+(j%2)*0.7,px=x+Math.cos(angle)*spread,pz=z+Math.sin(angle)*spread,py=base+height+(j%2)*0.7;
      beam(new THREE.Vector3(x,base+height*0.63,z),new THREE.Vector3(px,py-0.5,pz),0.22,wood);
      const crown=new THREE.Mesh(crownGeo,palette[j%3]);crown.position.set(px,py,pz);crown.scale.set(2.6+(j%2)*0.5,1.8+(j%3)*0.25,2.8);crown.rotation.y=angle;crown.castShadow=true;scene.add(crown);
    }
  }
  for (let z = -126; z <= 126; z += 21) for (const x of [-170, 168]) {
    if (x===168 && Math.abs(z-22)<10) continue; // new eastern road connector
    tree(x, z, 6 + Math.abs(z % 3));
  }
  for (const [x, z] of [[-116,-103],[-125,-64],[-115,62],[119,79],[114,-97],[2,-75],[49,-85],[-29,92]]) tree(x, z);
  // Dense roadside canopy and planted pocket spaces still leave road and deck routes clear.
  for (const x of [-122, -100, -77, -54, 58, 82, 108, 123]) tree(x, -111, 6.5);
  for (const x of [-115, -91, -65, 61, 88, 117]) tree(x, 48, 6);
  for (const x of [-124, 124]) for (const z of [-83, -44, 63, 91]) tree(x, z, 7.5);
  for (const [x,z] of QUEENSTOWN_SHADE_TREES) if (!onStreet(x,z,1)) tree(x,z,7.5,true);
  for (const bank of QUEENSTOWN_BANKS.slice(0,5)) {
    // Plant on the diagonal flank, outside both full-width crest crossings.
    const x=bank.x+Math.min(4,bank.width/8)+2,z=bank.z+Math.min(5,bank.depth/8)+2;
    tree(x,z,7,false,queenstownTerrainHeight(x,z));
  }
  // Loose ellipsoid clusters have an irregular silhouette rather than solid
  // green boxes. No movement collider: these beds conceal, but rounds pass.
  const shrubGeo = geo(new THREE.IcosahedronGeometry(1,1));
  for (const bed of QUEENSTOWN_SHRUB_BEDS) {
    if (onStreet(bed.x,bed.z,2)) continue;
    const horizontal = bed.width > bed.depth;
    for (let i = 0; i < 5; i++) {
      const offset = (i-2)*1.3;
      const bush = new THREE.Mesh(shrubGeo, i%2 ? shrub : foliageLight);
      const x=bed.x+(horizontal?offset:0),z=bed.z+(horizontal?0:offset);
      bush.position.set(x,queenstownTerrainHeight(x,z)+bed.height*.48,z);
      bush.scale.set(horizontal?1.5:1.1,bed.height*.55,horizontal?1.1:1.5);
      bush.rotation.y=i*.7; bush.castShadow=bush.receiveShadow=true; scene.add(bush);
    }
  }
  // Short masonry seats beside the field paths provide actual crouch cover.
  // Broken lengths leave exits in every direction; they never fence a lawn.
  for (const [x,z,alongX] of [[-207,-9,1],[-180,-9,1],[-207,89,1],[-180,89,1],
    [168,-107,1],[204,-107,1],[168,-11,1],[204,-11,1],[166,99,1],[204,99,1],
    [-128,-98,0],[-128,-26,0],[-128,48,0],[-128,102,0],[129,-80,0],[129,-18,0],[129,48,0],[129,138,0]] as const) {
    structure(x,.66,z,alongX ? 6 : .65,1.32,alongX ? .65 : 6,concrete);
    box(x,1.35,z,alongX ? 6.2 : .8,.08,alongX ? .8 : 6.2,cream);
  }
  function bench(x: number, z: number) {
    box(x, 0.6, z, 3, 0.16, 0.8, wood); box(x, 1, z - 0.4, 3, 0.65, 0.12, wood);
    for (const dx of [-1, 1]) box(x + dx, 0.28, z, 0.15, 0.56, 0.65, dark);
    solid(x, z, 3, 0.95);
  }
  for (const [x,z] of [[-112,-13],[-43,-13],[55,58],[110,58],[52,-87],[-160,92],[-160,-55]]) bench(x,z);
  for (const [x,z] of [[-120,42],[-100,42],[-78,42],[-57,42],[60,42],[80,42],[100,42],[120,42],[9,-88],[22,-88]]) {
    box(x, 0.3, z, 8, 0.6, 1.8, concrete); box(x, 0.8, z, 7.6, 0.7, 1.5, shrub); solid(x,z,8,1.8);
  }
  // Small estate playground and sheltered community pavilion in the western pocket.
  box(-50, 0.12, 57, 24, 0.22, 18, paving);
  box(-52, 0.26, 56, 17, 0.06, 12, blue);
  for (const dx of [-2, 2]) for (const dz of [-2, 2]) { box(-52 + dx, 1.6, 56 + dz, 0.22, 3.2, 0.22, yellow); solid(-52 + dx,56 + dz,0.3,0.3); }
  box(-52, 1.8, 56, 4.4, 0.2, 4.4, coral); box(-52, 3.3, 56, 5, 0.3, 5, teal);
  const slide = box(-52, 1.1, 61, 1.4, 0.12, 5.8, yellow); slide.rotation.x = 0.3;
  solid(-52,60,1.8,5);
  for (let i = 0; i < 4; i++) box(-49.5, 0.45 + i * 0.35, 53 + i * 0.65, 1.3, 0.16, 0.6, teal);
  shelter(15, -63, 24); bench(10,-62); bench(20,-62);
  sign('COMMUNITY GARDEN',15,2.5,-60.8,17,1.1);
  // stirling-90: warm red covered links and teal rails, distinct from station blue.
  for (const side of [-1,1]) { const canopy = box(15,3.4,-63+side,25,0.16,2.2,coral); canopy.rotation.x = side*0.13; }
  for (const z of [-66,-60]) { box(15,1.05,z,22,0.1,0.12,teal); for (let x=5;x<=25;x+=2) box(x,0.6,z,0.09,1.2,0.09,teal); }
  // margaret-0 and library-270: planted verges, pale kerbs and red parallel paths.
  // These frame the spawn approach without narrowing its twelve-unit lane.
  for (const x of [-25,-5]) {
    box(x,0.08,85,2.4,0.14,48,coral);
    for (const z of [66,78,90,102]) {
      box(x+(x< -15?-3:3),0.45,z,2.1,0.8,5,shrub); solid(x+(x< -15?-3:3),z,2.1,5);
      for (const dz of [-1.5,0,1.5]) box(x+(x< -15?-3:3),0.92,z+dz,0.35,0.25,0.35,orange);
    }
    box(x,3.3,72,0.14,6.6,0.14,dark); box(x,6.6,72,0.7,0.12,0.5,white); solid(x,72,0.25,0.25);
  }
  sign('MRT  ↑   ESTATE  ←',-3,2.5,92,10,1.2);
  box(-3,1.2,92,0.18,2.4,0.18,dark); solid(-3,92,0.25,0.25);
  // Newer Dawson towers form solid buildings in the expanded district.
  // margaret-0/90 and library-270 inform white fins, gray recesses, planted podiums.
  for (const [x,z,height] of [[-210,-75,90],[208,-75,105],[208,72,84],[95,-155,100]]) {
    structure(x,height/2,z,25,height,22,white);
    for (let dx=-9;dx<=9;dx+=6) {
      box(x+dx,height/2,z+11.1,3.8,height-4,0.15,glass);
      box(x+dx+2.2,height/2,z+11.5,0.55,height,1,concrete);
    }
    for (let y=6;y<height;y+=3.2) box(x,y,z+11.8,25,0.25,1.4,white);
    for(let y=10;y<height;y+=3.2) {
      box(x,y,z-11.15,24,0.22,0.9,concrete);
      for(const side of [-1,1]) {
        box(x+side*12.65,y,z,0.22,0.25,22,white);
        for(let dz=-7;dz<=7;dz+=4.7) box(x+side*12.55,y+1.25,z+dz,0.15,1.8,2.8,glass);
      }
      for(let dx=-9;dx<=9;dx+=6) box(x+dx,y+1.25,z-11.2,3.5,1.8,0.15,glass);
    }
    for(const side of [-1,1]) {
      structure(x+side*12.85,height/2,z,0.6,height,2,concrete);
      box(x,3.7,z+side*11.3,20,6.5,0.15,dark);
      for(let dx=-10;dx<=10;dx+=5) structure(x+dx,3.7,z+side*11.75,0.75,7.4,1.1,white);
      for(let y=1;y<6.5;y+=0.5) box(x, y,z+side*11.5,19,0.12,0.35,concrete);
    }
    structure(x,7,z,32,2,29,concrete); box(x,8.2,z,31,0.6,28,shrub);
  }
  // A sheltered western residential garden and eastern civic forecourt create
  // destinations between the old estate circuit and the new outer district road.
  box(-194,0.08,-143,44,0.15,45,paving); shelter(-194,-153,36);
  for (const side of [-1,1]) { const roof=box(-194,3.45,-153+side*1.1,38,0.16,2.5,red); roof.rotation.x=side*0.12; }
  for (const x of [-211,-177]) { tree(x,-130,8); bench(x,-141); }
  for (const x of [-212,-176]) for (const z of [-165,-117]) tree(x,z,7);
  sign('COMMONWEALTH GARDENS',-194,3.3,-150.6,28,1.4);
  // commonwealth-close-90: segmented pale garden benches around a planted pocket.
  for (let i=0;i<6;i++) {
    const a=i*Math.PI/7,x=-194+Math.cos(a)*8,z=-131+Math.sin(a)*5;
    const seat=box(x,0.55,z,3,0.25,1.2,cream);seat.rotation.y=-a;
    box(x,0.22,z,1.8,0.45,0.75,blue);solid(x,z,3,1.5);
  }
  box(184,0.07,132,69,0.15,60,paving);
  shelter(184,108,58); bench(161,127); bench(207,127);
  for (const x of [158,210]) for (const z of [109,150]) tree(x,z,7.5);
  // Mei Ling courtyard references show gateway roofs, palms and open shop colonnades.
  for (const x of [-7,7]) { box(x,3.2,-162,0.7,6.4,0.7,cream); solid(x,-162,0.8,0.8); }
  for(const x of [-6.3,6.3]) for(let y=3.5;y<6.4;y+=0.23) box(x,y,-162,0.8,0.12,3.4,wood);
  for(let x=-7;x<=7;x+=1.4) box(x,6.35,-162,0.14,0.2,7.7,wood);
  for (const side of [-1,1]) { const roof=box(0,6.7,-162+side*2,18,0.25,4.4,coral,scene,true);roof.rotation.x=side*0.14; }
  sign('QUEENSTOWN DISTRICT',0,5.7,-159.7,14,1.1);
  // tanglin-market-road-90/180: older two-storey service row contrasts with
  // modern tower podiums. Shop identities and placement remain generic.
  box(-197,3.7,45,45,7.4,13,cream,scene,true);solid(-197,45,45,13);
  for (const side of [-1,1]) {const roof=box(-197,7.7,45+side*3.5,47,0.24,7.4,red);roof.rotation.x=side*0.15;}
  shelter(-197,54,44);
  for(let x=-214;x<=-178;x+=9) {
    box(x,5.6,51.6,3.5,1.8,0.15,glass);box(x+2.5,4.5,51.9,1.2,0.8,0.7,concrete);
    box(x,1.6,51.6,4.6,3.2,0.15,teal);
  }
  sign('NEIGHBOURHOOD SHOPS',-197,3.9,51.85,33,1.1);
  box(-197,0.09,69,44,0.15,21,paving);bench(-210,67);bench(-184,67);
  // Southern garden loop, community exercise posts and shaded outdoor seating.
  box(-93,0.08,149,60,0.15,37,paving); shelter(-96,137,48);
  for (const x of [-115,-95,-75]) { bench(x,145); tree(x,164,7); }
  for (const x of [-112,-100,-88,-76]) {
    box(x,1.3,155,0.16,2.6,0.16,blue); box(x+1.5,1.3,155,0.16,2.6,0.16,blue);
    box(x+0.75,2.6,155,1.7,0.12,0.12,yellow); solid(x+0.75,155,1.9,0.4);
  }
  // Boundary planting and lamps preserve the full 14-unit outer road clearance.
  for (let x=-215;x<=215;x+=24) for (const z of [-202,202]) tree(x,z,7);
  for (let z=-166;z<=166;z+=24) for (const x of [-252,252]) tree(x,z,7.5);
  for (let x=-210;x<=210;x+=42) for (const z of [-175,175]) {
    if (x===0 && z===-175) continue; // northern gateway road connector
    box(x,3.5,z,0.15,7,0.15,dark);box(x,7,z,1,0.15,0.6,white);solid(x,z,0.25,0.25);
  }
  // Bus waiting areas and street furniture: playable open shelters rather than solid boxes.
  for (const x of [-88, 85]) {
    box(x, 0.12, 4, 19, 0.24, 5, paving);
    box(x, 3.2, 3, 18, 0.3, 4, walkwayBlue, scene, true);
    for (const dx of [-7,7]) { box(x+dx,1.55,2,0.22,3.1,0.22,concrete); solid(x+dx,2,0.3,0.3); }
    bench(x,2); box(x+10,1.8,4,0.12,3.6,0.12,dark); box(x+10,3,4,1.2,0.9,0.12,orange);
    sign('BUS',x+10,3,4.08,1.1,0.65);
  }
  for (let x = -114; x < 130; x += 40) {
    box(x, 4, 6, 0.16, 8, 0.16, dark); box(x, 8, 5, 0.2, 0.2, 2, dark); solid(x, 6, 0.3, 0.3);
  }
  // Reviewed station images: planted curb strips, yellow/black bollards and metal guards.
  for (const x of [-31, 31]) {
    box(x, 0.3, 39, 11, 0.6, 2.6, concrete); box(x, 0.8, 39, 10.5, 0.7, 2.3, leaf); solid(x, 39, 11, 2.6);
    for (const dx of [-6.5, 6.5]) { box(x + dx, 0.5, 43, 0.22, 1, 0.22, dark); box(x + dx, 0.75, 43, 0.25, 0.15, 0.25, orange); solid(x + dx, 43, 0.3, 0.3); }
  }
  // estate-south.png: paved parking apron and double yellow edge lines.
  box(-75, 0.08, 99, 70, 0.12, 15, mat('#a99789'));
  for (let x = -105; x <= -46; x += 6) box(x, 0.16, 97, 0.12, 0.02, 9, white);
  for (const z of [106, 106.4]) box(-75, 0.16, z, 70, 0.02, 0.13, orange);
  // Parked vehicles stay wholly within marked bays, outside the estate loop.
  for (const [x,paint] of [[-99,teal],[-81,white],[-57,blue]] as const) {
    box(x,0.65,97,2.2,0.9,4.6,paint,scene,true); box(x,1.28,97,1.9,0.75,2.5,glass); box(x,1.68,97,2,0.12,2.6,paint);
    for (const dx of [-1.1,1.1]) for (const dz of [-1.4,1.4]) box(x+dx,0.38,97+dz,0.25,0.6,0.65,dark);
    solid(x,97,2.4,4.6);
  }
  for (const [x,z] of [[-115,90],[114,55],[-40,-16],[52,-90]]) { box(x,0.6,z,0.7,1.2,0.7,teal); box(x,1.22,z,0.8,0.1,0.8,dark); solid(x,z,0.8,0.8); }
  sign('QUEENSTOWN · ESTATE LOOP', -53, 3.2, 101, 34, 2);
  const car = new THREE.Group(); scene.add(car);
  box(0, 0.7, 0, 1.8, 0.65, 3.4, coral, car, true); box(0, 1.18, 0.1, 1.5, 0.62, 1.65, glass, car); box(0, 1.51, 0.1, 1.6, 0.13, 1.85, cream, car);
  box(0, 0.65, -1.74, 1.55, 0.2, 0.08, white, car);
  const wheelGeo = geo(new THREE.CylinderGeometry(0.36, 0.36, 0.24, 10));
  for (const x of [-0.94, 0.94]) for (const z of [-1.05, 1.05]) { const wheel = new THREE.Mesh(wheelGeo, dark); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.38, z); car.add(wheel); }
  car.visible = false;
  const stampGeo = geo(new THREE.TorusGeometry(1.15, 0.16, 5, 20));
  const stamps = QUEENSTOWN_STAMPS.map(point => { const stamp = new THREE.Mesh(stampGeo, orange); stamp.position.set(point.x, 2.2, point.z); scene.add(stamp); return stamp; });
  for (const stamp of stamps) stamp.userData.coverMetricIgnore = true;
  scene.userData.referenceFeatures = ['station-east', 'estate-north', 'estate-south', 'stirling-90', 'stirling-270-retry', 'margaret-0', 'margaret-90', 'library-270'];
  scene.userData.detailFeatures = ['open-deck-lobbies', 'station-platform-edges', 'bus-shelters', 'playground', 'community-pavilion', 'court-fence', 'parked-cars', 'layered-roadside-planting'];
  scene.userData.qualityFeatures=['rounded-viaduct-piers','projecting-station-louvers','framed-lattice-galleries','barrel-roof-seams','round-kopi-tables','four-sided-tower-facades','branched-canopies','gateway-louver-panels'];
  scene.userData.materialRoughness={glass:glass.roughness,plaster:cream.roughness,paintedMetal:stationBlue.roughness};
  scene.userData.authoredMeshCount = scene.children.filter(child => child instanceof THREE.Mesh).length;
  scene.userData.landscape = { trees: treeCount, addedTrees: QUEENSTOWN_SHADE_TREES.length+5, shrubBeds: QUEENSTOWN_SHRUB_BEDS.length, pavementLinks: QUEENSTOWN_PATHS.length+QUEENSTOWN_BANK_PATHS.length, earthBanks: QUEENSTOWN_LANDSCAPE_PLACES.length };
  // Batch static details while leaving car, train and collectible animation independent.
  const batches = new Map<string, THREE.Mesh[]>(), instances: THREE.InstancedMesh[] = [];
  for (const child of [...scene.children]) {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material) || stamps.includes(child)) continue;
    // Keep gameplay meaning on the mesh: thermal vision swaps its material.
    if (child.material.userData.visualCover) child.userData.visualCover = true;
    const key = `${child.geometry.uuid}:${child.material.uuid}:${child.castShadow}:${child.receiveShadow}`;
    const batch = batches.get(key) ?? []; batch.push(child); batches.set(key, batch);
  }
  for (const batch of batches.values()) {
    if (batch.length < 2) continue;
    const mesh = new THREE.InstancedMesh(batch[0].geometry, batch[0].material, batch.length);
    if (batch[0].userData.visualCover) mesh.userData.visualCover = true;
    mesh.castShadow = batch[0].castShadow; mesh.receiveShadow = batch[0].receiveShadow;
    batch.forEach((item, i) => { item.updateMatrix(); mesh.setMatrixAt(i, item.matrix); scene.remove(item); });
    mesh.computeBoundingSphere(); scene.add(mesh); instances.push(mesh);
  }
  const world = withVerticalPlaces({ scene, obstacles, car, stamps,
    animate(time: number) { stamps.forEach((stamp, i) => { stamp.rotation.y = time * 0.7; stamp.position.y = 2.2 + Math.sin(time * 2 + i) * 0.2; }); },
    dispose() { instances.forEach(mesh => mesh.dispose()); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); sun.shadow.dispose(); },
  }, QUEENSTOWN_HOUSING_PLACES);
  withVerticalPlaces(world, QUEENSTOWN_LANDSCAPE_PLACES);
  // Terrain proximity uses the shared walk planes, never a hill's enclosing box.
  const landscapeRoot = scene.children.at(-1)!;
  landscapeRoot.name = 'Queenstown walkable landscape';
  landscapeRoot.traverse(node => { if (node instanceof THREE.Mesh) node.userData.terrain = true; });
  return world;
}
