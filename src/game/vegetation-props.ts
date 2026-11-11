import * as THREE from 'three';
import { batchRigidMeshes } from './rigid-batches';
import type { StreetPropSpec } from './street-props';

export type VegetationKind = 'snake-pot' | 'snake-trough' | 'money-pot' | 'money-pole' | 'bird-nest-pot' | 'bird-nest-fern' | 'sword-fern' | 'rain-tree' | 'sea-almond' | 'sea-apple';
export const VEGETATION_PROPS: readonly StreetPropSpec[] = [
  {kind:'snake-pot',name:'Snake plant · clay pot',behavior:'breakable',setting:'Bright, dry residential and shop edges',detail:'Dracaena trifasciata · cultivated introduction. Upright pointed blades with transverse bands; a drained terracotta pot.',width:.72,depth:.72,height:1.4},
  {kind:'snake-trough',name:'Snake plant · concrete trough',behavior:'fixed',setting:'Maintained sun or semi-shade frontage',detail:'Three staggered clumps of Dracaena trifasciata in a heavy drained trough; keep away from wet fern beds.',width:1.65,depth:.7,height:1.35},
  {kind:'money-pot',name:'Money plant · trailing pot',behavior:'breakable',setting:'Sheltered residential gardening',detail:'Epipremnum aureum · cultivated introduction. Juvenile heart-shaped leaves and yellow marbling on short trailing vines.',width:1.16,depth:1.16,height:.8},
  {kind:'money-pole',name:'Money plant · coir pole',behavior:'movable',setting:'Maintained semi-shaded shop or home edge',detail:'Epipremnum aureum climbs a visible coir support. Kept in cultivation rather than spread into native forest.',width:.85,depth:.85,height:1.68},
  {kind:'bird-nest-pot',name:'Bird’s-nest fern · bowl',behavior:'breakable',setting:'Sheltered, watered residential planting',detail:'Native Asplenium nidus. Undivided arching straps, dark midribs and a litter-catching central nest in a clay bowl.',width:1.7,depth:1.7,height:1.15},
  {kind:'bird-nest-fern',name:'Bird’s-nest fern · rosette',behavior:'fixed',setting:'Moist semi-shaded garden beds',detail:'Native Asplenium nidus. A broad open rosette rooted in a humus mound; foliage is permeable to movement and gunfire.',width:2.3,depth:2.3,height:1.05},
  {kind:'sword-fern',name:'Broad sword fern',behavior:'fixed',setting:'Moist forest margins and maintained fern beds',detail:'Native Nephrolepis biserrata. Arching rachises carry many separate pinnae, unlike the bird’s-nest fern’s whole straps.',width:2.6,depth:2.6,height:1.3},
  {kind:'rain-tree',name:'Rain tree · fern-bearing fork',behavior:'fixed',setting:'Roomy park lawns and planted greens',detail:'Samanea saman · introduced shade tree. A low fork and wide umbrella crown with fine compound foliage; a native bird’s-nest fern rests in a supported branch crotch.',width:14.6,depth:14.6,height:10.5},
  {kind:'sea-almond',name:'Sea almond · tiered crown',behavior:'fixed',setting:'Sunny coastal greens',detail:'Native Terminalia catappa. Horizontal branch tiers, paddle-shaped leaves clustered at tips and a few senescent russet leaves.',width:10.5,depth:10.5,height:10.6},
  {kind:'sea-apple',name:'Sea apple · young tree',behavior:'fixed',setting:'Sunny coastal woodland and broad planted verges',detail:'Native Syzygium grande. An upright irregular crown and opposite leathery leaves; a younger game-scale tree, not its maximum mature height.',width:7.8,depth:7.8,height:12.5},
];
export const isVegetationKind=(kind:string):kind is VegetationKind=>VEGETATION_PROPS.some(p=>p.kind===kind);

/** Original polygon leaves, not billboard photographs. Shared templates are merged
 * by material, then instanced by the district system. No per-plant animation. */
export function createVegetationKit() {
  const geometries:THREE.BufferGeometry[]=[],materials=new Map<string,THREE.MeshStandardMaterial>(),templates=new Map<VegetationKind,THREE.Group>();
  const keep=<T extends THREE.BufferGeometry>(g:T)=>{geometries.push(g);return g;};
  const cylinder=keep(new THREE.CylinderGeometry(.4,.5,1,8)),cube=keep(new THREE.BoxGeometry(1,1,1)),crown=keep(new THREE.IcosahedronGeometry(1,1));
  const material=(color:string)=>{let m=materials.get(color);if(!m){m=new THREE.MeshStandardMaterial({color,roughness:.88,side:THREE.DoubleSide});materials.set(color,m);}return m;};
  // A folded blade in XY, with an optional cordate notch at the petiole.
  function blade(heart=false,paddle=false) {
    const points=paddle?[[-.06,0],[-.22,.24],[-.48,.6],[-.48,.85],[0,1],[.48,.85],[.48,.6],[.22,.24],[.06,0]]:heart?[[-.02,.12],[-.22,0],[-.48,.17],[-.46,.42],[0,1],[.46,.42],[.48,.17],[.22,0]]:[[-.06,0],[-.42,.2],[-.5,.52],[-.31,.85],[0,1],[.31,.85],[.5,.52],[.06,0]];
    const vertices:number[]=[];
    for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];vertices.push(0,.46,.065,...a,0,...b,0);}
    const g=keep(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
  }
  const strap=blade(),heart=blade(true),paddle=blade(false,true);
  function build(kind:VegetationKind) {
    const root=new THREE.Group(),wood=new THREE.Group(),foliage=new THREE.Group();root.add(wood,foliage);
    const spec=VEGETATION_PROPS.find(p=>p.kind===kind)!;root.name=spec.name;root.userData.streetProp=kind;
    const add=(parent:THREE.Group,g:THREE.BufferGeometry,p:number[],scale:number[],color:string)=>{const m=new THREE.Mesh(g,material(color));m.position.fromArray(p);m.scale.fromArray(scale);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
    const branch=(a:number[],b:number[],diameter:number,color='#71604a',parent=wood)=>{const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);const m=add(parent,cylinder,from.add(to).multiplyScalar(.5).toArray(),[diameter,delta.length(),diameter],color);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return m;};
    const leaf=(p:number[],w:number,h:number,yaw:number,lean:number,color='#4e8246',g=strap)=>{const m=add(foliage,g,p,[w,h,w*.5],color);m.rotation.set(lean,yaw,0,'YXZ');return m;};
    const pot=(height:number,diameter:number)=>{
      // Individual staves form bounded fracture pieces, and leave a soil inset.
      for(let i=0;i<12;i++){const a=i*Math.PI/6,m=add(wood,cube,[Math.sin(a)*diameter*.39,height*.49,Math.cos(a)*diameter*.39],[diameter*.23,height*.98,.055],'#b97959');m.rotation.set(.12,a,0,'YXZ');}
      add(wood,cylinder,[0,height-.025,0],[diameter,.09,diameter],'#cb8c63');add(wood,cylinder,[0,height+.023,0],[diameter*.8,.025,diameter*.8],'#403a29');
    };
    const nest=(x:number,y:number,z:number,size:number)=>{
      add(foliage,crown,[x,y+.09*size,z],[.22*size,.13*size,.22*size],'#655437');
      for(let i=0;i<14;i++){
        const a=i*2.399, len=size*(.72+(i%4)*.08),start=[x+Math.sin(a)*.09*size,y+.1*size,z+Math.cos(a)*.09*size];
        // One continuous folded ribbon: no pinnae or gaps in this species.
        const vertices:number[]=[],center:number[][]=[];
        for(let j=0;j<=8;j++){const t=j/8;center.push([Math.sin(a)*len*t*t*.85,len*(t-.4*t*t),Math.cos(a)*len*t*t*.85]);}
        const vertex=(j:number,side:number)=>{const t=j/8,w=size*.095*Math.sin(Math.PI*(.08+t*.92)),p=center[j];return [p[0]+Math.cos(a)*w*side,p[1]+(side===0?.016:Math.sin(j*2)*.012)*size,p[2]-Math.sin(a)*w*side];};
        for(let j=0;j<8;j++)for(const side of [-1,1])vertices.push(...vertex(j,0),...vertex(j,side),...vertex(j+1,side),...vertex(j,0),...vertex(j+1,side),...vertex(j+1,0));
        const g=keep(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();add(foliage,g,start,[1,1,1],i%3?'#5d9145':'#77a950');
        for(let j=1;j<center.length;j++)branch(center[j-1].map((v,k)=>v+start[k]),center[j].map((v,k)=>v+start[k]),.012*size,'#354f2c',foliage);
      }
    };
    if(kind==='snake-pot'||kind==='snake-trough'){
      const trough=kind==='snake-trough',base=trough?.44:.5;
      if(trough){add(wood,cube,[0,.22,0],[1.6,.44,.64],'#a8aba0');add(wood,cube,[0,.447,0],[1.46,.015,.5],'#413c2a');root.userData.streetPropColliders=[{min:[-.8,0,-.32],max:[.8,.45,.32]}];}else pot(.5,.57);
      for(const cx of trough?[-.48,0,.48]:[0])for(let i=0;i<9;i++){
        const a=i*2.4,h=.53+(i%4)*.1,p=[cx+Math.sin(a)*.12,base+.04,Math.cos(a)*.12];
        const m=leaf(p,.13,h,a,.06+(i%3)*.12,'#41684c');
        // Thin alternating transverse patches follow each blade's local surface.
        for(let j=1;j<6;j++){const band=add(foliage,cube,[0,0,0],[.09,h*.022,.006],'#98ad7c');band.position.set(0,h*(.1+j*.12),.018);band.position.applyQuaternion(m.quaternion);band.position.add(m.position);band.quaternion.copy(m.quaternion);}
      }
    }else if(kind==='money-pot'||kind==='money-pole'){
      const pole=kind==='money-pole';pot(pole?.58:.46,pole?.61:.58);
      if(pole)branch([0,.58,0],[0,1.62,0],.09,'#94724e');
      for(let vine=0;vine<(pole?2:4);vine++){
        let last=[0,pole?.61:.52,0];for(let i=0;i<6;i++){
          const a=vine*1.6+i*.95,p=pole?[Math.sin(a)*.1,.64+i*.16,Math.cos(a)*.1]:[Math.sin(a)*(.08+i*.045),.58-i*.042,Math.cos(a)*(.08+i*.045)];
          branch(last,p,.018,'#5a7741',foliage);const m=leaf(p,.21,.26,a,pole?.6:1.7,'#438149',heart);
          const patch=add(foliage,heart,p,[.08,.18,.02],'#b7bb60');patch.quaternion.copy(m.quaternion);patch.translateZ(.007);last=p;
        }
      }
    }else if(kind==='bird-nest-pot'||kind==='bird-nest-fern'){
      const potted=kind==='bird-nest-pot';if(potted)pot(.36,.64);nest(0,potted?.39:0,0,potted?.86:1.2);
      if(!potted)root.userData.streetPropColliders=[];
    }else if(kind==='sword-fern'){
      add(foliage,crown,[0,.09,0],[.24,.1,.24],'#60513b');
      for(let i=0;i<11;i++){
        const a=i*2.399,len=1+(i%3)*.12;let last=[0,.08,0];
        for(let j=1;j<=12;j++){
          const t=j/12,r=len*t*.9,y=.08+len*Math.sin(t*2.1)*.8,p=[Math.sin(a)*r,y,Math.cos(a)*r];branch(last,p,.012,'#69834c',foliage);
          for(const side of [-1,1])leaf(p,.07,.3*Math.sin(t*Math.PI*.9),a+side*1.1,1.15,i%2?'#4d8145':'#6a984f');last=p;
        }
      }
      root.userData.streetPropColliders=[];
    }else{
      const rain=kind==='rain-tree',almond=kind==='sea-almond',height=rain?6.4:almond?9.4:10.5;
      branch([0,0,0],[0,rain?3.5:height,0],rain?.8:.48);
      for(let i=0;i<5;i++){const a=i*Math.PI*2/5;branch([Math.sin(a)*.8,.02,Math.cos(a)*.8],[0,1.1,0],.24);}
      if(rain){
        for(let i=0;i<7;i++){
          const a=i*2.399,r=3.9+(i%3)*.65,p=[Math.sin(a)*r,6.9+(i%3)*.45,Math.cos(a)*r],knee=[Math.sin(a)*r*.48,5.8,Math.cos(a)*r*.48];branch([0,3.3,0],knee,.42);branch(knee,p,.28);
          add(foliage,crown,[knee[0],7.7,knee[2]],[2.4,1.05,2.1],i%2?'#527947':'#3b663e');
          for(let j=0;j<3;j++){const b=a+(j-1)*.5,q=[p[0]+Math.sin(b)*1.1,p[1]+.65,p[2]+Math.cos(b)*1.1];branch(p,q,.13);add(foliage,crown,q,[1.6,.85,1.4],j%2?'#527947':'#3b663e');
            for(let k=0;k<3;k++){const c=b+k*2,origin=[q[0]+Math.sin(c),q[1]-.4,q[2]+Math.cos(c)];for(let n=0;n<4;n++)for(const side of [-1,1])leaf([origin[0]+Math.sin(c)*n*.13,origin[1],origin[2]+Math.cos(c)*n*.13],.1,.18,c+side*.9,1.4,'#648b50');}
          }
        }
        // A real crotch supports the epiphyte; not a floating rosette.
        branch([0,3.3,0],[.65,4.3,.45],.24);nest(.45,3.98,.3,.85);
      }else if(almond){
        for(let tier=0;tier<4;tier++)for(let i=0;i<5;i++){
          const a=i*Math.PI*2/5+tier*.43,r=3.6-tier*.65,y=3.7+tier*1.7,p=[Math.sin(a)*r,y,Math.cos(a)*r];branch([0,y-.18,0],p,.18-tier*.025);
          add(foliage,crown,p,[1.1,.3,1],'#507c43');
          for(let j=0;j<7;j++)leaf([p[0]+Math.sin(j*2.4)*.25,y+.05,p[2]+Math.cos(j*2.4)*.25],.39,.69,j*2.4,1.05,j===tier?'#a66f45':'#628b49',paddle);
        }
      }else{
        for(let i=0;i<13;i++){
          const a=i*2.399,y=4.3+i*.48,r=1.3+Math.sin(i*.7)*.5,p=[Math.sin(a)*r,y,Math.cos(a)*r];branch([0,y-.8,0],p,.16);
          add(foliage,crown,p,[1.4,1.65,1.2],i%3?'#416e43':'#567d48');
          for(let j=0;j<4;j++)for(const side of [-1,1])leaf([p[0]+Math.sin(a)*(1+j*.18),p[1]-.8+j*.12,p[2]+Math.cos(a)*(1+j*.18)],.18,.4,a+side*1.1,1,'#669153');
        }
      }
      // Colliders follow wood only. Clear air beneath crowns remains navigable.
      wood.updateMatrixWorld(true);root.userData.streetPropColliders=wood.children.map(m=>{const b=new THREE.Box3().setFromObject(m);return {min:b.min.toArray(),max:b.max.toArray()};});
    }
    root.updateMatrixWorld(true);const base=new THREE.Box3().setFromObject(root,true).min.y;
    for(const group of [wood,foliage])for(const child of group.children)child.position.y-=base;
    for(const shape of root.userData.streetPropColliders??[]){shape.min[1]-=base;shape.max[1]-=base;}
    root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root);root.userData.streetPropBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
    for(const group of [wood,foliage]){
      if(spec.behavior!=='breakable')batchRigidMeshes(group,{trackGeometry:keep});
      // Flatten so existing fragment motion can handle pots, and preserve the
      // foliage/wood distinction through district instancing and cover indexing.
      for(const child of [...group.children]){if(group===foliage)child.userData.fpsEffect=true;root.add(child);}root.remove(group);
    }
    return root;
  }
  return {create(kind:VegetationKind){let template=templates.get(kind);if(!template){template=build(kind);templates.set(kind,template);}return template.clone(true);},dispose(){geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());templates.clear();}};
}
