import { expect, it } from 'vitest';
import * as THREE from 'three';
import { createDeploymentOverview } from './deployment-overview';

it('picks the visible beam above its ground label, including an unavailable beam', () => {
  const scene=new THREE.Scene(),point={id:'locked',name:'Enemy',x:0,z:0,yaw:0,pitch:0,available:false};
  const overview=createDeploymentOverview(scene,[point]);
  const camera=new THREE.PerspectiveCamera(38,1,.08,1000);camera.position.set(0,150,300);camera.lookAt(0,130,0);camera.updateMatrixWorld(true);
  expect(overview.pick(camera,new THREE.Vector2())).toBeNull();
  overview.update(true,'');expect(overview.pick(camera,new THREE.Vector2())).toBe('locked');
  overview.update(false,'');expect(overview.pick(camera,new THREE.Vector2())).toBeNull();overview.dispose();
});

for(const [available,selected] of [[false,false],[true,false],[true,true]])it(`softly brightens and restores the ${!available?'unavailable':selected?'selected':'available'} beam without changing availability`,()=>{
  const scene=new THREE.Scene(),point={id:'p',name:'Post',x:0,z:0,yaw:0,pitch:0,available};
  const overview=createDeploymentOverview(scene,[point]),choice=selected?'p':'';
  overview.update(true,choice);
  const mesh=scene.getObjectByName('deployment-beam:p') as THREE.Mesh<THREE.CylinderGeometry,THREE.ShaderMaterial>;
  const material=mesh.material,opacity=material.uniforms.opacity.value,color=material.uniforms.color.value.clone();
  overview.update(true,choice,[point],'p',.05);
  expect(material.uniforms.opacity.value).toBeGreaterThan(opacity);
  const rising=material.uniforms.opacity.value;
  overview.update(true,choice,[point],'p',.2);
  expect(material.uniforms.opacity.value).toBeGreaterThan(rising);
  expect(material.uniforms.color.value.r+material.uniforms.color.value.g+material.uniforms.color.value.b).toBeGreaterThan(color.r+color.g+color.b);
  overview.update(true,choice,[point],null,1);
  expect(material.uniforms.opacity.value).toBeCloseTo(opacity,4);
  expect(point.available).toBe(available);overview.dispose();
});
