import { createVerticalMovement, type VerticalWorld } from './vertical-movement';
import { surfaceHeight, surfaceContains, type WalkSurface } from './vertical-routes';
import type { Obstacle } from './region-collision';

export interface NavigationPoint { x: number; y: number; z: number }
type Movement = ReturnType<typeof createVerticalMovement>;
const distance = (a: NavigationPoint, b: NavigationPoint) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);

/** Crates use broad floors, never stair treads or decorative meshes. */
export function elevatedLootAnchors(surfaces: readonly WalkSurface[], movement: Movement): NavigationPoint[] {
  return surfaces.filter(s => s.startHeight >= 2 && s.startHeight === s.endHeight && (s.maxX-s.minX)*(s.maxZ-s.minZ) >= 64).flatMap(s => {
    const result: NavigationPoint[] = [];
    for (const tx of [.25, .5, .75]) for (const tz of [.25, .5, .75]) {
      const p = { x: s.minX+(s.maxX-s.minX)*tx, y: s.startHeight, z: s.minZ+(s.maxZ-s.minZ)*tz };
      if (surfaceContains(s,p.x,p.z) && movement.canOccupy(p.x,p.y,p.z,.65,1.8)) result.push(p);
    }
    return result;
  });
}

/** Small visibility graph over actual authored floors and stair/ramp endpoints.
 * Every edge is walked through the same collision/step kernel as infantry.
 * It deliberately does not infer access to decorative roofs or teleport bots.
 */
export function createVerticalNavigator(world: VerticalWorld, groundAnchors: readonly { x: number; z: number }[] = []) {
  const movement = createVerticalMovement(world);
  const nodes: NavigationPoint[] = [];
  const add = (p: NavigationPoint) => {
    if (movement.canOccupy(p.x,p.y,p.z,.4,1.8) && Math.abs((movement.supportHeight(p.x,p.z,p.y+.01,.4,1.8)??-100)-p.y)<.02 && !nodes.some(n => distance(n,p)<.3)) nodes.push(p);
  };
  const groundAt = (p: { x: number; z: number }) => world.bounds.groundHeight?.(p.x, p.z) ?? 0;
  for (const p of groundAnchors) add({ ...p, y: groundAt(p) });
  for (const s of world.surfaces) {
    const cx=(s.minX+s.maxX)/2, cz=(s.minZ+s.maxZ)/2;
    if (s.startHeight !== s.endHeight) {
      for (const x of [s.minX-.65,s.maxX+.65]) for (const z of [s.minZ-.65,s.maxZ+.65]) add({x,y:groundAt({x,z}),z});
      for (const t of [0,.5,1]) {
        const x=s.axis==='x'?s.minX+(s.maxX-s.minX)*t:cx, z=s.axis==='z'?s.minZ+(s.maxZ-s.minZ)*t:cz;
        add({x,y:surfaceHeight(s,x,z),z});
      }
    } else {
      for (const tx of [.1,.5,.9]) for (const tz of [.1,.5,.9]) add({x:s.minX+(s.maxX-s.minX)*tx,y:s.startHeight,z:s.minZ+(s.maxZ-s.minZ)*tz});
    }
  }
  // Ground corners near authored access let bots go around the building they
  // need to enter; the rest of their ground combat movement stays unchanged.
  const access=nodes.filter(n=>Math.abs(n.y-groundAt(n))<.35);
  for(const o of world.obstacles) for(const x of [o.minX-.65,o.maxX+.65]) for(const z of [o.minZ-.65,o.maxZ+.65])
    if(access.some(n=>Math.hypot(n.x-x,n.z-z)<35)) add({x,y:groundAt({x,z}),z});
  // Interior doors and shelves can fall between the floor's nine samples.
  // Their corners supply approach/turn points on the floor they actually touch.
  // Keep this to tall walls/shelves; sampling low props, posts and every thin
  // guard would swamp this small graph. Existing floor samples cover open space.
  for (const o of world.traversalObstacles) {
    if (o.maxY-o.minY < 1.5 || Math.max(o.maxX-o.minX,o.maxZ-o.minZ) < 2 || Math.min(o.maxX-o.minX,o.maxZ-o.minZ) < .25) continue;
    for (const x of [o.minX-.55,o.maxX+.55]) for (const z of [o.minZ-.55,o.maxZ+.55]) {
      const y=movement.supportHeight(x,z,o.minY+.35,.4,1.8);
      if (y !== null && Math.abs(y-o.minY)<.36) add({x,y,z});
    }
  }
  function* canWalk(a:NavigationPoint,b:NavigationPoint, extra: readonly Obstacle[] = []): Generator<undefined, boolean> {
    const length=Math.hypot(a.x-b.x,a.z-b.z);
    if(length<.01) return Math.abs(a.y-b.y)<.05;
    const count=Math.ceil(length/.4);
    let state={...a,velocityY:0};
    for(let i=0;i<count;i++) {
      // A long edge must also yield inside its collision walk, not just between edges.
      if (i % 8 === 0) yield;
      const step=movement.move(state,(b.x-a.x)/count,(b.z-a.z)/count,0,.4,1.8,extra);
      if(!step.grounded) return false;
      state=step;
      const t=(i+1)/count;
      if(Math.hypot(state.x-(a.x+(b.x-a.x)*t),state.z-(a.z+(b.z-a.z)*t))>.12 || Math.abs(state.velocityY)>.1) return false;
    }
    return distance(state,b)<.15;
  }
  // Evaluate nearby edges lazily; districts that never need stairs pay no
  // all-pairs kernel cost at load time.
  const edges=new Map<number, {to:number;cost:number}[]>();
  const ramps = world.surfaces.filter(s => s.startHeight !== s.endHeight);
  const sharesRamp = (a: NavigationPoint, b: NavigationPoint) => ramps.some(s => [a,b].every(p =>
    surfaceContains(s,p.x,p.z) &&
    Math.abs(surfaceHeight(s,p.x,p.z)-p.y) < .05));
  const compatible = (a: NavigationPoint, b: NavigationPoint) => Math.abs(a.y-b.y)<.36 ||
    Math.abs(a.y-groundAt(a))<.05 && Math.abs(b.y-groundAt(b))<.05 || sharesRamp(a,b);
  const bins=new Map<string,number[]>();
  nodes.forEach((p,i)=>{const key=`${Math.floor(p.x/45)},${Math.floor(p.z/45)}`;const list=bins.get(key)??[];list.push(i);bins.set(key,list);});
  const neighbours=nodes.map((a,i)=>{
    const nearby:number[]=[];
    for(let x=Math.floor(a.x/45)-1;x<=Math.floor(a.x/45)+1;x++)for(let z=Math.floor(a.z/45)-1;z<=Math.floor(a.z/45)+1;z++)
      nearby.push(...(bins.get(`${x},${z}`)??[]));
    const sorted=nearby.filter(j=>j!==i && distance(a,nodes[j])<=45 && compatible(a,nodes[j])).sort((j,k)=>distance(a,nodes[j])-distance(a,nodes[k]));
    const directions=new Set<number>(),selected=new Set(sorted.slice(0,12));
    for(const j of sorted){const b=nodes[j],direction=Math.floor((Math.atan2(b.z-a.z,b.x-a.x)+Math.PI)*4/Math.PI)%8;if(!directions.has(direction)){directions.add(direction);selected.add(j);}}
    return [...selected];
  });
  function* buildOutgoing(i:number): Generator<undefined, {to:number;cost:number}[]> {
    let result=edges.get(i); if(result) return result;
    result=[];
    for(const j of neighbours[i]) {
      yield;
      const a=nodes[i], b=nodes[j];
      if(i===j || distance(a,b)>45) continue;
      // Changes of height must follow an authored slope. Level visibility
      // edges connect floor interiors and landings, including across places.
      if(!compatible(a,b)) continue;
      if(yield* canWalk(a,b)) result.push({to:j,cost:distance(a,b)});
    }
    edges.set(i,result); return result;
  }
  const edgeJobs=new Map<number,ReturnType<typeof buildOutgoing>>();
  function* outgoing(i:number): Generator<undefined, {to:number;cost:number}[]> {
    // Nearby squad members share cold edge validation as well as finished edges.
    // Otherwise every soldier repeats the same long collision walk while waiting.
    let job=edgeJobs.get(i);
    if (!job) {job=buildOutgoing(i);edgeJobs.set(i,job);}
    while (!edges.has(i)) {
      const result=job.next();
      if (result.done) {edgeJobs.delete(i);return result.value;}
      yield;
    }
    return edges.get(i)!;
  }
  const crosses=(a:NavigationPoint,b:NavigationPoint,o:Obstacle)=>{
    if(Math.min(a.y,b.y)>=(o.maxY??Infinity))return false;
    let near=0,far=1;
    for(const axis of ['x','z'] as const){const delta=b[axis]-a[axis],lo=(axis==='x'?o.minX:o.minZ)-.45,hi=(axis==='x'?o.maxX:o.maxZ)+.45;
      if(Math.abs(delta)<1e-8){if(a[axis]<lo||a[axis]>hi)return false;}
      else {near=Math.max(near,Math.min((lo-a[axis])/delta,(hi-a[axis])/delta));far=Math.min(far,Math.max((lo-a[axis])/delta,(hi-a[axis])/delta));}}
    return near<=far;
  };
  function* plan(from:NavigationPoint,to:NavigationPoint, congestion: (point: NavigationPoint) => number = () => 0, extra:readonly Obstacle[]=[]):Generator<undefined,NavigationPoint[]> {
    yield;
    if(distance(from,to)<=55 && (yield* canWalk(from,to,extra))) return [to];
    const starts:{p:NavigationPoint;i:number;d:number}[]=[],ends:typeof starts=[];
    for(const n of nodes.map((p,i)=>({p,i,d:distance(p,from)})).filter(n=>n.d<55 && compatible(n.p,from)).sort((a,b)=>a.d-b.d).slice(0,8)){yield;if(yield* canWalk(from,n.p,extra))starts.push(n);}
    for(const n of nodes.map((p,i)=>({p,i,d:distance(p,to)})).filter(n=>n.d<55 && compatible(n.p,to)).sort((a,b)=>a.d-b.d).slice(0,8)){yield;if(yield* canWalk(n.p,to,extra))ends.push(n);}
    if(!starts.length || !ends.length) return [];
    const end=new Map(ends.map(n=>[n.i,n.d])), costs=new Map(starts.map(n=>[n.i,n.d])), previous=new Map<number,number>(), open=new Set(starts.map(n=>n.i));
    let finish=-1,best=Infinity;
    while(open.size) {
      const current=[...open].reduce((a,b)=>costs.get(a)!+distance(nodes[a],to)<costs.get(b)!+distance(nodes[b],to)?a:b);open.delete(current);
      const cost=costs.get(current)!;if(cost+distance(nodes[current],to)>=best) break;
      if(end.has(current) && cost+end.get(current)!<best){finish=current;best=cost+end.get(current)!;}
      for(const edge of yield* outgoing(current)) {
        if(extra.some(o=>crosses(nodes[current],nodes[edge.to],o)))continue;
        const next=cost+edge.cost+Math.max(0,congestion(nodes[edge.to]));
        if(next<(costs.get(edge.to)??Infinity)){costs.set(edge.to,next);previous.set(edge.to,current);open.add(edge.to);}
      }
    }
    if(finish<0)return [];
    const path=[to];for(let i:number|undefined=finish;i!==undefined;i=previous.get(i))path.unshift(nodes[i]);
    return path;
  }
  function route(from:NavigationPoint,to:NavigationPoint) {
    const search=plan(from,to);let step=search.next();while(!step.done)step=search.next();return step.value;
  }
  return {route,plan};
}
