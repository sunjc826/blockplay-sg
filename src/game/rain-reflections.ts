import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export interface WetGround {
  surface?: (x: number, z: number) => number | null;
  exposed: (x: number, z: number) => number;
  wetness: number;
  time: number;
}

/** Conservative 2 m cells: all corners must be exposed paving at one height.
 * World-cell caching avoids resampling the district on every camera movement. */
export function createWetGroundMask(surface: NonNullable<WetGround['surface']>, exposed: WetGround['exposed']) {
  const side = 96, step = 2, span = side * step, data = new Float32Array(side * side * 4);
  const texture = new THREE.DataTexture(data, side, side, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  const bounds = new THREE.Vector4(0, 0, 1 / span, 1 / span), cache = new Map<string, number | null>();
  let lastX = Infinity, lastZ = Infinity;
  return {
    texture, bounds,
    update(eye: THREE.Vector3) {
      const x = Math.floor(eye.x / 12) * 12 - span / 2, z = Math.floor(eye.z / 12) * 12 - span / 2;
      if (x === lastX && z === lastZ) return false;
      lastX = x; lastZ = z; bounds.set(x, z, 1 / span, 1 / span);
      if (cache.size > 24000) cache.clear();
      for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
        const wx = x + (i + .5) * step, wz = z + (j + .5) * step, key = `${wx}:${wz}`;
        if (!cache.has(key)) {
          let height = surface(wx, wz);
          if (height !== null) for (const [dx, dz] of [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
            const h = surface(wx + dx, wz + dz);
            if (h === null || Math.abs(h - height) > .06 || exposed(wx + dx, wz + dz) > h + .12) { height = null; break; }
          }
          cache.set(key, height);
        }
        const height = cache.get(key)!, k = (j * side + i) * 4;
        data[k] = height ?? 0; data[k + 3] = height === null ? 0 : 1;
      }
      texture.needsUpdate = true; return true;
    },
    dispose() { texture.dispose(); cache.clear(); },
  };
}

const vertexShader = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;

/** Half-resolution SSR from the existing world colour/depth. No extra scene draw.
 * Only exposed ground receives it, with soft screen-edge and range rejection. */
export function createRainReflections(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, ground: WetGround) {
  const mask = createWetGroundMask(ground.surface!, ground.exposed), eye = new THREE.Vector3(), size = new THREE.Vector2();
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const uniforms = {
    tScene: { value: null as THREE.Texture | null }, tDepth: { value: null as THREE.Texture | null },
    tGround: { value: mask.texture }, groundBounds: { value: mask.bounds },
    projection: { value: new THREE.Matrix4() }, inverseProjection: { value: new THREE.Matrix4() }, cameraWorld: { value: new THREE.Matrix4() },
    texel: { value: new THREE.Vector2() }, wetness: { value: 0 }, clock: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, depthTest: false, depthWrite: false,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tScene,tDepth,tGround;
      uniform mat4 projection,inverseProjection,cameraWorld;
      uniform vec4 groundBounds;
      uniform vec2 texel;
      uniform float wetness,clock;
      vec3 viewAt(vec2 uv){vec4 p=inverseProjection*vec4(uv*2.0-1.0,texture2D(tDepth,uv).r*2.0-1.0,1.0);return p.xyz/p.w;}
      vec2 project(vec3 p){vec4 c=projection*vec4(p,1.0);return c.xy/c.w*.5+.5;}
      void main(){
        gl_FragColor=vec4(0.0);
        if(texture2D(tDepth,vUv).r>.999999) return;
        vec3 p=viewAt(vUv),world=(cameraWorld*vec4(p,1.0)).xyz;
        vec2 guv=(world.xz-groundBounds.xy)*groundBounds.zw;
        if(any(lessThan(guv,vec2(0.0)))||any(greaterThan(guv,vec2(1.0)))) return;
        vec4 ground=texture2D(tGround,guv);
        if(ground.a<.5||abs(world.y-ground.r)>.08||length(p)>85.0) return;
        // Neighbour depth rejects raised geometry and vertical pavement edges.
        vec3 n=normalize(cross(dFdx(p),dFdy(p)));
        if(dot(n,-p)<0.0)n=-n;
        if((mat3(cameraWorld)*n).y<.94) return;
        // Flat paving uses a stable normal rather than magnifying depth quantization.
        n=vec3(cameraWorld[0].y,cameraWorld[1].y,cameraWorld[2].y);
        // Fine surface distortion; no full-screen wobble or persistent history.
        float ripple=sin(world.x*7.0+world.z*5.0+clock*5.0)*.004;
        n=normalize(n+vec3(ripple,0.0,ripple*.7));
        vec3 direction=reflect(normalize(p),n),start=p+n*.07;
        float previous=0.0,hitDistance=0.0;vec2 hitUv=vec2(0.0);bool found=false;
        for(int i=0;i<48;i++){
          float distanceAlong=.25+float(i)*.4+float(i*i)*.022;
          vec3 q=start+direction*distanceAlong;
          if(q.z>-.08)break;
          vec2 uv=project(q);
          if(any(lessThan(uv,vec2(.003)))||any(greaterThan(uv,vec2(.997))))break;
          float depth=texture2D(tDepth,uv).r;
          vec3 seen=viewAt(uv);float gap=seen.z-q.z;
          if(depth<.999999&&gap>0.0&&distanceAlong>1.0){
            float lo=previous,hi=distanceAlong;
            for(int j=0;j<5;j++){float mid=(lo+hi)*.5;vec3 r=start+direction*mid;vec2 ru=project(r);if(viewAt(ru).z-r.z>0.0)hi=mid;else lo=mid;}
            vec3 qh=start+direction*hi;hitUv=project(qh);vec3 surface=viewAt(hitUv);
            // Reject self-reflections and depth discontinuities instead of smearing them.
            if(abs(surface.z-qh.z)<.35&&(cameraWorld*vec4(surface,1.0)).y>world.y+.15){found=true;hitDistance=hi;break;}
          }
          previous=distanceAlong;
        }
        if(!found)return;
        float edge=smoothstep(0.0,.09,min(min(hitUv.x,hitUv.y),min(1.0-hitUv.x,1.0-hitUv.y)));
        float range=1.0-smoothstep(45.0,80.0,length(p));
        float fresnel=.12+.30*pow(1.0-max(0.0,dot(n,-normalize(p))),3.0);
        float patches=.65+.35*sin(world.x*.34+sin(world.z*.28))*sin(world.z*.41);
        vec2 blur=texel*(1.5+hitDistance*.035);
        vec3 color=texture2D(tScene,hitUv).rgb*.5;
        color+=(texture2D(tScene,hitUv+vec2(blur.x,0)).rgb+texture2D(tScene,hitUv-vec2(blur.x,0)).rgb
          +texture2D(tScene,hitUv+vec2(0,blur.y)).rgb+texture2D(tScene,hitUv-vec2(0,blur.y)).rgb)*.125;
        gl_FragColor=vec4(color,wetness*edge*range*fresnel*patches);
      }`,
  });
  const blend = new THREE.ShaderMaterial({ uniforms: { tReflection: { value: target.texture } }, vertexShader,
    fragmentShader: 'varying vec2 vUv;uniform sampler2D tReflection;void main(){gl_FragColor=texture2D(tReflection,vUv);}',
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  const quad = new FullScreenQuad(material);
  return {
    render(picture: THREE.WebGLRenderTarget, depth: THREE.DepthTexture) {
      renderer.getDrawingBufferSize(size);
      const w = Math.max(1, Math.ceil(size.x / 2)), h = Math.max(1, Math.ceil(size.y / 2));
      if (target.width !== w || target.height !== h) target.setSize(w, h);
      camera.getWorldPosition(eye); mask.update(eye);
      uniforms.tScene.value = picture.texture; uniforms.tDepth.value = depth;
      uniforms.projection.value.copy(camera.projectionMatrix); uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
      uniforms.cameraWorld.value.copy(camera.matrixWorld); uniforms.texel.value.set(1 / size.x, 1 / size.y);
      uniforms.wetness.value = ground.wetness; uniforms.clock.value = ground.time;
      const auto = renderer.autoClear; renderer.autoClear = false;
      quad.material = material; renderer.setRenderTarget(target); quad.render(renderer);
      quad.material = blend; renderer.setRenderTarget(picture); quad.render(renderer);
      renderer.autoClear = auto;
    },
    dispose() { mask.dispose(); target.dispose(); material.dispose(); blend.dispose(); quad.dispose(); },
  };
}
