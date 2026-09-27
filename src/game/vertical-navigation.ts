import { createVerticalMovement, type VerticalWorld } from './vertical-movement';
import { surfaceHeight, type WalkSurface } from './vertical-routes';

export interface NavigationPoint { x: number; y: number; z: number }
type Movement = ReturnType<typeof createVerticalMovement>;
const distance = (a: NavigationPoint, b: NavigationPoint) => Math.hypot(a.x-b.x, a.y-b.y, a.z-b.z);

/** Crates use broad floors, never stair treads or decorative meshes. */
export function elevatedLootAnchors(surfaces: readonly WalkSurface[], movement: Movement): NavigationPoint[] {
  return surfaces.filter(s => s.startHeight >= 2 && s.startHeight === s.endHeight && (s.maxX-s.minX)*(s.maxZ-s.minZ) >= 64).flatMap(s => {
    const result: NavigationPoint[] = [];
    for (const tx of [.25, .5, .75]) for (const tz of [.25, .5, .75]) {
      const p = { x: s.minX+(s.maxX-s.minX)*tx, y: s.startHeight, z: s.minZ+(s.maxZ-s.minZ)*tz };
      if (movement.canOccupy(p.x,p.y,p.z,.65,1.8)) result.push(p);
    }
    return result;
  });
}

/** Small visibility graph over actual authored floors and stair/ramp endpoints.
 * Every edge is walked through the same collision/step kernel as infantry.
 * It deliberately does not infer access to decorative roofs or teleport bots.
 */
export function createVerticalNavigator(world: VerticalWorld) {
  const movement = createVerticalMovement(world);
  const nodes: NavigationPoint[] = [];
  const add = (p: NavigationPoint) => {
    if (movement.canOccupy(p.x,p.y,p.z,.4,1.8) && !nodes.some(n => distance(n,p)<.3)) nodes.push(p);
  };
  for (const s of world.surfaces) {
    const cx=(s.minX+s.maxX)/2, cz=(s.minZ+s.maxZ)/2;
    if (s.startHeight !== s.endHeight) {
      for (const x of [s.minX-.65,s.maxX+.65]) for (const z of [s.minZ-.65,s.maxZ+.65]) add({x,y:0,z});
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
  const access=nodes.filter(n=>n.y<.35);
  for(const o of world.obstacles) for(const x of [o.minX-.65,o.maxX+.65]) for(const z of [o.minZ-.65,o.maxZ+.65])
    if(access.some(n=>Math.hypot(n.x-x,n.z-z)<35)) add({x,y:0,z});
  function canWalk(a:NavigationPoint,b:NavigationPoint) {
    const length=Math.hypot(a.x-b.x,a.z-b.z);
    if(length<.01) return Math.abs(a.y-b.y)<.05;
    const count=Math.ceil(length/.4);
    let state={...a,velocityY:0};
    for(let i=0;i<count;i++) {
      const step=movement.move(state,(b.x-a.x)/count,(b.z-a.z)/count,0,.4,1.8);
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
    p.x >= s.minX-.01 && p.x <= s.maxX+.01 && p.z >= s.minZ-.01 && p.z <= s.maxZ+.01 &&
    Math.abs(surfaceHeight(s,p.x,p.z)-p.y) < .05));
  function* outgoing(i:number): Generator<undefined, {to:number;cost:number}[]> {
    let result=edges.get(i); if(result) return result;
    result=[];
    for(let j=0;j<nodes.length;j++) {
      yield;
      const a=nodes[i], b=nodes[j];
      if(i===j || distance(a,b)>45) continue;
      // Changes of height must follow an authored slope. Level visibility
      // edges connect floor interiors and landings, including across places.
      if(Math.abs(a.y-b.y)>=.05 && !sharesRamp(a,b)) continue;
      if(canWalk(a,b)) result.push({to:j,cost:distance(a,b)});
    }
    edges.set(i,result); return result;
  }
  function* plan(from:NavigationPoint,to:NavigationPoint):Generator<undefined,NavigationPoint[]> {
    yield;
    if(distance(from,to)<=55 && canWalk(from,to)) return [to];
    const starts:{p:NavigationPoint;i:number;d:number}[]=[],ends:typeof starts=[];
    for(const n of nodes.map((p,i)=>({p,i,d:distance(p,from)})).filter(n=>n.d<55 && (Math.abs(n.p.y-from.y)<.36 || sharesRamp(n.p,from))).sort((a,b)=>a.d-b.d).slice(0,16)){yield;if(canWalk(from,n.p))starts.push(n);}
    for(const n of nodes.map((p,i)=>({p,i,d:distance(p,to)})).filter(n=>n.d<55 && (Math.abs(n.p.y-to.y)<.36 || sharesRamp(n.p,to))).sort((a,b)=>a.d-b.d).slice(0,16)){yield;if(canWalk(n.p,to))ends.push(n);}
    if(!starts.length || !ends.length) return [];
    const end=new Map(ends.map(n=>[n.i,n.d])), costs=new Map(starts.map(n=>[n.i,n.d])), previous=new Map<number,number>(), open=new Set(starts.map(n=>n.i));
    let finish=-1,best=Infinity;
    while(open.size) {
      const current=[...open].reduce((a,b)=>costs.get(a)!+distance(nodes[a],to)<costs.get(b)!+distance(nodes[b],to)?a:b);open.delete(current);
      const cost=costs.get(current)!;if(cost+distance(nodes[current],to)>=best) break;
      if(end.has(current) && cost+end.get(current)!<best){finish=current;best=cost+end.get(current)!;}
      for(const edge of yield* outgoing(current)) if(cost+edge.cost<(costs.get(edge.to)??Infinity)){costs.set(edge.to,cost+edge.cost);previous.set(edge.to,current);open.add(edge.to);}
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
