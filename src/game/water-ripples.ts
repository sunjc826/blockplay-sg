import * as THREE from 'three';
import type { WaterMaterial } from './water';
import { RIPPLE_LIFE, RIPPLE_SPEED } from './water';
import type { WorldDetail } from './environment-quality';

/** Raised annular crests, in one instanced draw. The water shader still supplies
 * the underlying wave normals; this geometry gives close ripples real relief. */
export function createWaterRipples(scene: THREE.Scene, materials: ReadonlySet<WaterMaterial>, surface: (x:number,z:number)=>number|null, exposed:(x:number,z:number)=>number) {
  const limit=128, geometry=new THREE.BufferGeometry(),positions:number[]=[],indices:number[]=[],edge:number[]=[];
  // A crest joins the surrounding surface at both edges, instead of a tube
  // sitting on top of it. Five radial samples give the wave a rounded ridge.
  for(let i=0;i<=48;i++)for(let j=0;j<=4;j++){
    const angle=i/48*Math.PI*2,t=j/4,r=1+(t-.5)*.08;
    positions.push(Math.cos(angle)*r,Math.sin(t*Math.PI)**2*.04,Math.sin(angle)*r);edge.push(Math.sin(t*Math.PI));
    if(i<48&&j<4){const a=i*5+j,b=a+5;indices.push(a,b,a+1,b,b+1,a+1);}
  }
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('crestFade',new THREE.Float32BufferAttribute(edge,1));geometry.setIndex(indices);geometry.computeVertexNormals();
  const fades=new THREE.InstancedBufferAttribute(new Float32Array(limit),1);fades.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('rippleFade',fades);
  const material=new THREE.MeshStandardMaterial({color:'#6d999d',roughness:.22,metalness:.2,transparent:true,opacity:.45,depthWrite:false});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float crestFade;attribute float rippleFade;varying float vRippleFade;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRippleFade=rippleFade*crestFade;');
    shader.fragmentShader='varying float vRippleFade;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vRippleFade;');
  };material.customProgramCacheKey=()=> 'raised-water-ripples-v1';
  const mesh=new THREE.InstancedMesh(geometry,material,limit);mesh.name='water-ripple-crests';mesh.count=0;mesh.visible=false;mesh.frustumCulled=false;mesh.renderOrder=2;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.userData.fpsEffect=true;mesh.userData.noShadowCast=true;mesh.raycast=()=>{};scene.add(mesh);
  const eye=new THREE.Vector3(),dummy=new THREE.Object3D();
  const hash=(x:number,z:number)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);};
  return {
    mesh,
    update(camera:THREE.Camera, detail:WorldDetail,reduced:boolean,rain:number){
      mesh.count=0;mesh.visible=false;if(detail==='low'||reduced)return;
      camera.getWorldPosition(eye);let count=0;
      const add=(x:number,z:number,radius:number,height:number,fade:number)=>{
        if(count>=limit||radius<.035||fade<.015||Math.hypot(x-eye.x,z-eye.z)>28)return;
        const y=surface(x,z);if(y===null||exposed(x,z)>y+.15)return;
        // A ring crossing a quay/deck is suppressed rather than drawn over land.
        for(const [dx,dz]of [[radius,0],[-radius,0],[0,radius],[0,-radius]]){const h=surface(x+dx,z+dz);if(h===null||exposed(x+dx,z+dz)>h+.15)return;}
        dummy.position.set(x,y+.004,z);dummy.scale.set(radius,height/.04,radius);dummy.updateMatrix();mesh.setMatrixAt(count,dummy.matrix);fades.setX(count++,fade);
      };
      let clock=0;
      for(const water of materials){
        clock=water.uniforms.uTime.value;
        for(const r of water.uniforms.uRipples.value as THREE.Vector4[]){
          const age=clock-r.z;if(r.w<=0||age<0||age>RIPPLE_LIFE)continue;
          const fade=Math.min(1,age/.08)*Math.exp(-age*1.1)*Math.min(1,r.w);
          for(let i=0;i<2;i++){const a=age-i*.16;if(a>0)add(r.x,r.y,a*RIPPLE_SPEED,.035*Math.min(2,r.w)*Math.exp(-a),fade*(i? .6:1));}
        }
      }
      if(rain>.03&&materials.size){
        const reach=detail==='ultra'?7:5, budget=detail==='ultra'?112:64;
        for(let x=Math.floor(eye.x)-reach;x<=Math.floor(eye.x)+reach&&count<budget;x++)for(let z=Math.floor(eye.z)-reach;z<=Math.floor(eye.z)+reach&&count<budget;z++){
          const seed=hash(x,z);if(seed>rain*.65)continue;
          const age=(clock*.9+seed*7)%1;if(age>.65)continue;
          add(x+.25+seed*.5,z+.25+hash(z,x)*.5,.04+age*.3,.012*(1-age),Math.sin(age/.65*Math.PI)*.45);
        }
      }
      mesh.count=count;mesh.visible=count>0;mesh.instanceMatrix.needsUpdate=true;fades.needsUpdate=true;
    },
    dispose(){mesh.removeFromParent();mesh.dispose();geometry.dispose();material.dispose();},
  };
}
