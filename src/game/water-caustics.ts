import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { WaterMaterial } from './water';
import { waterWaveField, waterNormalField } from './water-surface-field';
import { WATER_WAVES } from './water-wave-state';

/** Horizontal receiving planes in metres relative to the water. Sampling the
 * two neighbouring planes approximates focus at the actual receiver height. */
export const CAUSTIC_HEIGHTS = [-.25, -1, -2.5, .35, 1.25, 3] as const;
const TILE = 512;

const projectVertex = /* glsl */ `
  ${waterWaveField}
  ${waterNormalField}
  uniform vec3 uSun;
  uniform float receiverHeight, uCausticResponse;
  varying vec3 sourcePoint, receivingPoint;
  varying vec2 flatSource;
  varying float validRay;
  void main() {
    vec2 p=uWaveOrigin+uv*waveSpan;
    vec2 slope=ambientWaterSlope(p,waveSpan/256.0)+interactionWaterSlope(p,uWaveHeight)*uCausticResponse;
    vec3 normal=normalize(vec3(-slope.x,1.0,-slope.y));
    float height=waterSwellHeight(p)+waveHeight(p,uWaveHeight)*uCausticResponse;
    vec3 incoming=-normalize(uSun);
    bool above=receiverHeight>0.0;
    vec3 flatRay=above?reflect(incoming,vec3(0,1,0)):refract(incoming,vec3(0,1,0),1.0/1.333);
    vec3 ray=above?reflect(incoming,normal):refract(incoming,normal,1.0/1.333);
    validRay=step(.12,ray.y*sign(receiverHeight));
    float travel=(receiverHeight-height)/(sign(receiverHeight)*max(.12,abs(ray.y)));
    sourcePoint=vec3(p.x,height,p.y);
    flatSource=uv*waveSpan;
    receivingPoint=sourcePoint+ray*travel;
    vec2 projected=(receivingPoint.xz-uWaveOrigin-flatRay.xz/flatRay.y*receiverHeight)/waveSpan;
    gl_Position=vec4(projected*2.0-1.0,0.0,1.0);
  }
`;
const projectFragment = /* glsl */ `
  ${waterWaveField}
  varying vec3 sourcePoint, receivingPoint;
  varying vec2 flatSource;
  varying float validRay;
  void main() {
    if(validRay<.99 || shoreDepth(sourcePoint.xz)<=.015
      || any(lessThan(sourcePoint.xz,uWaveBounds.xy)) || any(greaterThan(sourcePoint.xz,uWaveBounds.zw))) discard;
    // Flux is the area of the source divided by the projected receiving area.
    // Folded/overlapping triangles add their light, generating the caustic itself.
    float sourceArea=abs(dFdx(flatSource.x)*dFdy(flatSource.y)-dFdy(flatSource.x)*dFdx(flatSource.y));
    float receivingArea=length(cross(dFdx(receivingPoint),dFdy(receivingPoint)));
    float flux=min(12.0,sourceArea/max(receivingArea,1e-8));
    vec2 origin=(sourcePoint.xz-uWaveOrigin)/waveSpan;
    gl_FragColor=vec4(flux,flux*origin.x,flux*origin.y,flux*sourcePoint.y);
  }
`;
const receiverVertex = /* glsl */ `
  varying vec2 vUv;
  void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}
`;
const receiverFragment = /* glsl */ `
  uniform sampler2D sceneColor, sceneDepth, caustics;
  uniform mat4 inverseViewProjection, viewProjection, view;
  uniform vec3 eye, uSun, uGlintColor;
  uniform vec2 origin, cameraRange;
  uniform float surface, light, rain;
  varying vec2 vUv;
  const float span=${WATER_WAVES.span.toFixed(1)};
  vec3 worldPosition(vec2 uv,float depth) {
    vec4 p=inverseViewProjection*vec4(uv*2.0-1.0,depth*2.0-1.0,1.0);return p.xyz/p.w;
  }
  float viewDepth(float depth) {
    return cameraRange.x*cameraRange.y/(cameraRange.y-depth*(cameraRange.y-cameraRange.x));
  }
  vec4 layer(vec2 uv,float index) {
    vec2 tile=vec2(mod(index,2.0),floor(index/2.0));
    return texture2D(caustics,(tile+clamp(uv,vec2(.5/512.0),vec2(1.0-.5/512.0)))/vec2(2,3));
  }
  float visiblePath(vec3 start,vec3 finish) {
    // Screen-depth visibility avoids projecting through intervening visible
    // walls/steps. Offscreen occluders are a documented screen-space limitation.
    for(int i=1;i<=7;i++) {
      vec3 p=mix(start,finish,float(i)/9.0);
      vec4 clip=viewProjection*vec4(p,1.0);
      vec2 uv=clip.xy/clip.w*.5+.5;
      if(clip.w<=0.0 || any(lessThan(uv,vec2(0))) || any(greaterThan(uv,vec2(1)))) continue;
      float depth=texture2D(sceneDepth,uv).r;
      float z=-(view*vec4(p,1)).z;
      if(depth<.99999 && z>viewDepth(depth)+.12) return 0.0;
    }
    return 1.0;
  }
  void main() {
    vec4 base=texture2D(sceneColor,vUv);
    float d=texture2D(sceneDepth,vUv).r;
    vec3 world=worldPosition(vUv,d);
    vec3 dx=dFdx(world),dy=dFdy(world);
    vec3 n=cross(dx,dy);n/=max(length(n),1e-6);
    if(dot(n,eye-world)<0.0)n=-n;
    float h=world.y-surface;
    if(d>=.99999 || h< -2.5 || h>3.0 || abs(h)<.025){gl_FragColor=base;return;}
    bool above=h>0.0;
    vec3 incoming=-normalize(uSun);
    vec3 ray=above?reflect(incoming,vec3(0,1,0)):refract(incoming,vec3(0,1,0),1.0/1.333);
    vec2 uv=(world.xz-origin-ray.xz/ray.y*h)/span;
    float border=min(min(uv.x,uv.y),min(1.0-uv.x,1.0-uv.y))*span;
    float fade=smoothstep(.6,3.0,border)*(1.0-smoothstep(22.0,40.0,distance(eye,world)));
    float facing=max(0.0,dot(n,-ray));
    // Dry horizontal sand cannot receive upward-reflected light.
    if(fade<=0.0 || facing<=.01){gl_FragColor=base;return;}
    vec4 field;
    if(above) {
      if(h<1.25)field=mix(layer(uv,3.0),layer(uv,4.0),clamp((h-.35)/.9,0.0,1.0));
      else field=mix(layer(uv,4.0),layer(uv,5.0),clamp((h-1.25)/1.75,0.0,1.0));
      fade*=smoothstep(.025,.12,h)*(1.0-smoothstep(2.2,3.0,h));
    }else {
      float depth=-h;
      if(depth<1.0)field=mix(layer(uv,0.0),layer(uv,1.0),clamp((depth-.25)/.75,0.0,1.0));
      else field=mix(layer(uv,1.0),layer(uv,2.0),clamp((depth-1.0)/1.5,0.0,1.0));
      fade*=smoothstep(.025,.12,depth)*exp(-depth*.35)*(1.0-smoothstep(2.0,2.5,depth));
    }
    if(field.r<.001){gl_FragColor=base;return;}
    vec3 source=vec3(origin.x+field.g/field.r*span,surface+field.a/field.r,origin.y+field.b/field.r*span);
    fade*=visiblePath(source,world)*light*(1.0-rain*.85);
    float concentration=clamp(field.r-1.0,above?0.0:-.3,5.0);
    vec3 addition=above?(base.rgb*.7+vec3(.06))*concentration*1.5:base.rgb*concentration*1.3;
    gl_FragColor=vec4(max(vec3(0),base.rgb+addition*uGlintColor*facing*fade),base.a);
  }
`;

/** Surface-derived light capture and receiver lighting, before transparent
 * water/spray. No cellular texture or independently animated caustic pattern. */
export function createWaterCaustics(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, water?: WaterMaterial) {
  let atlas: THREE.WebGLRenderTarget | undefined, grid: THREE.Mesh | undefined;
  let projector: THREE.ShaderMaterial | undefined, receiver: THREE.ShaderMaterial | undefined, quad: FullScreenQuad | undefined;
  const projectionScene=new THREE.Scene(), projectionCamera=new THREE.Camera();
  const clear=new THREE.Color();
  let enabled=false;
  function release() {
    atlas?.dispose();atlas=undefined;grid?.geometry.dispose();grid?.removeFromParent();grid=undefined;
    projector?.dispose();projector=undefined;receiver?.dispose();receiver=undefined;quad?.dispose();quad=undefined;enabled=false;
  }
  function build() {
    const u=water!.uniforms;
    atlas=new THREE.WebGLRenderTarget(TILE*2,TILE*3,{type:THREE.HalfFloatType,depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
    const uniforms:Record<string,THREE.IUniform>={receiverHeight:{value:0}};
    for(const key of ['uWaveMap','uWaveReady','uWaveHeight','uWaveOrigin','uWaveBounds','uWaterDepthMap','uWaterDepthReady','uWaterDepthBounds','uTime','uChop','uRain','uUltra','uSun','uCausticResponse'])uniforms[key]=u[key];
    projector=new THREE.ShaderMaterial({vertexShader:projectVertex,fragmentShader:projectFragment,uniforms,depthTest:false,depthWrite:false,side:THREE.DoubleSide,transparent:true,
      blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendSrcAlpha:THREE.OneFactor,blendDstAlpha:THREE.OneFactor});
    grid=new THREE.Mesh(new THREE.PlaneGeometry(2,2,256,256),projector);grid.frustumCulled=false;projectionScene.add(grid);
    receiver=new THREE.ShaderMaterial({vertexShader:receiverVertex,fragmentShader:receiverFragment,depthTest:false,depthWrite:false,uniforms:{
      sceneColor:{value:null},sceneDepth:{value:null},caustics:{value:atlas.texture},inverseViewProjection:{value:new THREE.Matrix4()},viewProjection:{value:new THREE.Matrix4()},view:{value:new THREE.Matrix4()},
      eye:{value:new THREE.Vector3()},origin:{value:new THREE.Vector2()},cameraRange:{value:new THREE.Vector2()},surface:{value:0},light:{value:0},rain:u.uRain,uSun:u.uSun,uGlintColor:u.uGlintColor,
    }});quad=new FullScreenQuad(receiver);
  }
  return {
    get enabled(){return enabled;},
    get target(){return atlas;},
    release,
    render(snapshot:THREE.WebGLRenderTarget,target:THREE.WebGLRenderTarget) {
      enabled=false;
      const u=water?.uniforms;
      if(!u || u.uWaveReady.value<.5 || u.uCausticLight.value<.001 || u.uShallowDetail.value<.5)return false;
      if(!atlas)build();
      const previous=renderer.getRenderTarget(),autoClear=renderer.autoClear,alpha=renderer.getClearAlpha(),scissor=renderer.getScissorTest(),xr=renderer.xr.enabled;
      renderer.getClearColor(clear);
      try {
        renderer.autoClear=false;renderer.xr.enabled=false;renderer.setScissorTest(false);
        renderer.setRenderTarget(atlas!);renderer.setClearColor(0,0);renderer.clear();
        for(let i=0;i<CAUSTIC_HEIGHTS.length;i++) {
          projector!.uniforms.receiverHeight.value=CAUSTIC_HEIGHTS[i];
          // A target's own viewport is in its pixels. renderer.setViewport is in canvas units, scaled by the
          // pixel ratio: at 2x it drew each tile twice the size, over its neighbours, and the receiver below
          // stretched the lower-left quarter of the picture across the frame.
          atlas!.viewport.set(i%2*TILE,Math.floor(i/2)*TILE,TILE,TILE);renderer.setRenderTarget(atlas!);
          renderer.render(projectionScene,projectionCamera);
        }
        atlas!.viewport.set(0,0,atlas!.width,atlas!.height);
        const r=receiver!.uniforms;
        r.sceneColor.value=snapshot.texture;r.sceneDepth.value=snapshot.depthTexture;
        r.inverseViewProjection.value.multiplyMatrices(camera.matrixWorld,camera.projectionMatrixInverse);
        r.viewProjection.value.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);r.view.value.copy(camera.matrixWorldInverse);
        camera.getWorldPosition(r.eye.value);r.origin.value.copy(u.uWaveOrigin.value);r.cameraRange.value.set(camera.near,camera.far);
        r.surface.value=u.uWaveHeight.value;r.light.value=u.uCausticLight.value;
        renderer.setRenderTarget(target);quad!.render(renderer);enabled=true;
        return true;
      }finally{
        renderer.setRenderTarget(previous);renderer.setClearColor(clear,alpha);renderer.setScissorTest(scissor);renderer.xr.enabled=xr;renderer.autoClear=autoClear;
      }
    },
    dispose:release,
  };
}
