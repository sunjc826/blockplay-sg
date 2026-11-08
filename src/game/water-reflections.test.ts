import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createWaterMaterial } from './water';
import { createWaterReflections } from './water-reflections';

it('mirrors the camera at the bay surface, excludes water recursion and restores render state',()=>{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1.5,.08,400);
  const material=createWaterMaterial({deep:'#123456',shallow:'#456789',sky:'#abcdef',horizon:'#888888',sun:new THREE.Vector3(0,1,0)});
  const bay=new THREE.Mesh(new THREE.PlaneGeometry(100,100),material);bay.name='marina-bay-water';bay.rotation.x=-Math.PI/2;bay.position.y=-.24;scene.add(bay);
  const rain=new THREE.Group();rain.name='rain-effects';scene.add(rain);
  camera.position.set(0,2,5);camera.lookAt(0,-.24,0);camera.updateMatrixWorld(true);
  let mirroredY=Infinity;
  const renderer={getDrawingBufferSize:(v:THREE.Vector2)=>v.set(2400,1600),getRenderTarget:()=>null,setRenderTarget:vi.fn(),
    xr:{enabled:true},shadowMap:{autoUpdate:true},state:{buffers:{depth:{setMask:vi.fn()}}},autoClear:false,clear:vi.fn(),
    render:vi.fn((_scene:THREE.Scene,c:THREE.Camera)=>{mirroredY=c.position.y;expect(bay.visible).toBe(false);expect(rain.visible).toBe(false);}),
  } as unknown as THREE.WebGLRenderer;
  const reflections=createWaterReflections(renderer,scene,camera);
  try{
    expect(reflections.render(false)).toBe(false);expect(renderer.render).not.toHaveBeenCalled();
    expect(reflections.render(true)).toBe(true);expect(mirroredY).toBeCloseTo(-2.48,6);
    expect(material.uniforms.uReflectionMap.value.image).toMatchObject({width:768,height:512});
    expect(material.uniforms.uReflectionReady.value).toBe(1);
    expect(bay.visible).toBe(true);expect(rain.visible).toBe(true);expect(renderer.xr.enabled).toBe(true);expect(renderer.shadowMap.autoUpdate).toBe(true);
    expect(reflections.render(false)).toBe(false);expect(material.uniforms.uReflectionReady.value).toBe(0);
    camera.position.y=-1;camera.updateMatrixWorld(true);expect(reflections.render(true)).toBe(false);
  }finally{reflections.dispose();bay.geometry.dispose();material.dispose();}
});
