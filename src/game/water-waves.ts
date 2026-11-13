import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { WaterMaterial } from './water';
import { boatWakeCoverage, boatWaveFade, createBoatWake, type WaterBoat } from './boat-wake';
import { WATER_WAVES, createSwimmerWake, waterWaveOrigin, waterWaveSteps, type WaterImpulse, type WaterSwimmer } from './water-wave-state';

/** Explicit gameplay input: a crouching camera, a spectator or a boat is not a swimmer. */
export function setWaterSwimmer(scene: THREE.Scene, x: number, z: number, active: boolean) {
  const source = (scene.userData.waterSwimmer ??= { x, z, active }) as WaterSwimmer;
  source.x = x; source.z = z; source.active = active;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }
`;
const fragmentShader = /* glsl */ `
  uniform sampler2D state;
  uniform vec2 origin, shift;
  uniform vec4 bounds;
  uniform float dt;
  uniform int impulseCount;
  uniform vec4 impulses[${WATER_WAVES.maxImpulses}];
  uniform float impulseFoam[${WATER_WAVES.maxImpulses}];
  varying vec2 vUv;
  const float span=${WATER_WAVES.span.toFixed(1)};
  const float texel=1.0/${WATER_WAVES.size.toFixed(1)};
  const float dx=span*texel;
  bool inBay(vec2 p) { return all(greaterThanEqual(p,bounds.xy)) && all(lessThanEqual(p,bounds.zw)); }
  vec3 sampleState(vec2 uv) {
    if (any(lessThan(uv,vec2(0.0))) || any(greaterThan(uv,vec2(1.0)))) return vec3(0.0);
    return texture2D(state,uv).rgb;
  }
  vec3 neighbor(vec2 direction, vec2 p, vec2 uv, vec3 centre) {
    // Zero normal derivative at solid quays: waves reflect instead of crossing land.
    return inBay(p+direction*dx) ? sampleState(uv+direction*texel) : centre;
  }
  void main() {
    vec2 p=origin+vUv*span, uv=vUv+shift;
    if (!inBay(p)) { gl_FragColor=vec4(0.0); return; }
    vec3 current=sampleState(uv);
    float h=current.x, velocity=current.y;
    vec3 lap=neighbor(vec2(1,0),p,uv,current)+neighbor(vec2(-1,0),p,uv,current)
      +neighbor(vec2(0,1),p,uv,current)+neighbor(vec2(0,-1),p,uv,current)-4.0*current;
    velocity += ${WATER_WAVES.speed ** 2}*dt*lap.x/(dx*dx);
    float edge=min(min(vUv.x,vUv.y),min(1.0-vUv.x,1.0-vUv.y))*span;
    // Absorbing outer band keeps the finite moving window from sending echoes back.
    float damping=${WATER_WAVES.damping}+(1.0-smoothstep(.2,3.0,edge))*7.0;
    velocity *= exp(-damping*dt);
    h=(h+velocity*dt)*exp(-(1.0-smoothstep(.2,2.0,edge))*4.0*dt);
    // Spare B channel stores short-lived stern froth. Stable diffusion uses the
    // same neighbour taps; no extra texture, pass or geometry is needed.
    float foam=max(0.0,current.b+.035*dt*lap.b/(dx*dx))*exp(-(1.1+damping)*dt);
    for (int i=0; i<${WATER_WAVES.maxImpulses}; i++) {
      if (i>=impulseCount) break;
      vec4 impulse=impulses[i];
      float q=dot(p-impulse.xy,p-impulse.xy)/(impulse.z*impulse.z);
      // Depression with a raised shoulder and zero net volume, not a growing mound.
      h += impulse.w*(1.0-q)*exp(-q);
      foam += impulseFoam[i]*exp(-q*1.5);
    }
    gl_FragColor=vec4(clamp(h,-.25,.25),clamp(velocity,-2.5,2.5),clamp(foam,0.0,.8),1.0);
  }
`;

/** Local, cosmetic GPU heightfield. The original bay remains the gameplay raycast
 * plane; the denser patch replaces only its rendered surface while Ultra is active. */
export function createWaterWaves(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const bay = scene.getObjectByName('marina-bay-water') as THREE.Mesh<THREE.BufferGeometry, WaterMaterial> | undefined;
  const water = bay?.material;
  const eye = new THREE.Vector3(), box = new THREE.Box3(), clearColor = new THREE.Color();
  const origin = new THREE.Vector2(), bounds = new THREE.Vector4();
  const wake = createSwimmerWake(), pending: (WaterImpulse & { at: number })[] = [];
  const boatWakes = new Map<string, ReturnType<typeof createBoatWake>>();
  const boats = () => (scene.userData.waterBoats ?? []) as WaterBoat[];
  let targets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] | undefined;
  let solver: THREE.ShaderMaterial | undefined, quad: FullScreenQuad | undefined, patch: THREE.Mesh | undefined;
  let lastTime: number | undefined, remainder = 0, active = false, totalSteps = 0, totalImpulses = 0, boatImpulses = 0;
  const originalHook = water?.userData.waveImpulse, originalCoverage = water?.userData.waveCoverage;
  const coverage = (x: number, z: number, radius: number) => active && x-radius>origin.x+3 && x+radius<origin.x+WATER_WAVES.span-3 && z-radius>origin.y+3 && z+radius<origin.y+WATER_WAVES.span-3;
  const impulse = (event: WaterImpulse, delay = 0) => {
    if (!active || ![event.x,event.z,event.radius,event.height].every(Number.isFinite) || event.radius <= 0) return;
    if (event.x < bounds.x || event.x > bounds.z || event.z < bounds.y || event.z > bounds.w) return;
    if (event.x < origin.x + 1 || event.x > origin.x + WATER_WAVES.span - 1 || event.z < origin.y + 1 || event.z > origin.y + WATER_WAVES.span - 1) return;
    if (pending.length === WATER_WAVES.maxImpulses) pending.shift();
    pending.push({ ...event, at: water!.uniforms.uTime.value + delay, radius: Math.max(.12, event.radius), height: THREE.MathUtils.clamp(event.height,-.12,.12), foam: Number.isFinite(event.foam) ? THREE.MathUtils.clamp(event.foam!,0,.5) : 0 });
    return true;
  };
  const boatImpulse = (event: WaterImpulse, delay: number) => {
    // Leave room for shot rebounds and the swimmer even after a long frame.
    if (pending.length >= WATER_WAVES.maxImpulses-8) return;
    const fade = boatWaveFade(event.x,event.z,origin);
    if (fade > 0 && impulse({ ...event, height: event.height*fade, foam: (event.foam??0)*fade },delay)) boatImpulses++;
  };
  const onRipple = (x: number, z: number, strength: number) => {
    originalHook?.(x,z,strength);
    const height = -.085 * Math.min(2,strength), radius = .19 + Math.min(3,strength) * .025;
    impulse({ x, z, radius, height });
    // A short rebound launches a wave train rather than one isolated expanding ridge.
    impulse({ x, z, radius, height: -height*.55 }, .12);
    impulse({ x, z, radius: radius*1.15, height: height*.24 }, .25);
  };
  if (water?.uniforms.uWaveReady) { water.userData.waveImpulse = onRipple; water.userData.waveCoverage = coverage; }
  function unbind() {
    if (!water?.uniforms.uWaveReady) return;
    water.uniforms.uWaveReady.value = 0;
    if (patch) patch.visible = false;
    active = false;
    for (const boat of boats()) boat.wakeBlend = 0;
  }
  function release() {
    unbind(); targets?.forEach(t => t.dispose()); targets = undefined;
    solver?.dispose(); solver = undefined; quad?.dispose(); quad = undefined;
    patch?.removeFromParent(); patch?.geometry.dispose(); patch = undefined;
    if (water?.uniforms.uWaveMap) water.uniforms.uWaveMap.value = null;
    pending.length = 0; lastTime = undefined; remainder = 0; wake.reset(); boatWakes.clear();
  }
  function build() {
    const target = () => new THREE.WebGLRenderTarget(WATER_WAVES.size,WATER_WAVES.size, {
      type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
    });
    targets = [target(), target()];
    solver = new THREE.ShaderMaterial({ vertexShader, fragmentShader, depthTest: false, depthWrite: false,
      uniforms: { state: { value: targets[0].texture }, origin: { value: origin }, shift: { value: new THREE.Vector2() }, bounds: { value: bounds },
        dt: { value: 0 }, impulseCount: { value: 0 }, impulses: { value: Array.from({length: WATER_WAVES.maxImpulses},()=>new THREE.Vector4()) }, impulseFoam: { value: new Float32Array(WATER_WAVES.maxImpulses) } } });
    quad = new FullScreenQuad(solver);
    const geometry = new THREE.PlaneGeometry(WATER_WAVES.span,WATER_WAVES.span,WATER_WAVES.segments,WATER_WAVES.segments);
    geometry.setAttribute('waterPatch',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(1),1));
    patch = new THREE.Mesh(geometry,water); patch.name = 'water-wave-patch'; patch.rotation.x = -Math.PI/2;
    geometry.computeBoundingSphere(); geometry.boundingSphere!.radius += .35;
    patch.renderOrder = bay!.renderOrder;
    patch.userData.fpsEffect = true; patch.userData.noShadowCast = true; patch.raycast = () => {};
    scene.add(patch);
    bay!.updateWorldMatrix(true,false); box.setFromObject(bay!);
    bounds.set(box.min.x,box.min.z,box.max.x,box.max.z);
  }
  return {
    get enabled() { return active; },
    get target() { return targets?.[0]; },
    get origin() { return origin; },
    get stats() { return { active, steps: totalSteps, impulses: totalImpulses, boatImpulses, boats: boatWakes.size, pending: pending.length, size: targets ? WATER_WAVES.size : 0 }; },
    impulse,
    update(enabled: boolean, visible: boolean) {
      if (!water?.uniforms.uWaveReady || !bay) return;
      if (!enabled) { release(); return; }
      if (!visible) { unbind(); return; }
      const time = water.uniforms.uTime.value as number;
      camera.getWorldPosition(eye);
      const next = waterWaveOrigin(eye.x,eye.z);
      const previousTarget = renderer.getRenderTarget(), previousAutoClear = renderer.autoClear;
      const clearAlpha = renderer.getClearAlpha(); renderer.getClearColor(clearColor);
      const scissorTest = renderer.getScissorTest(), xr = renderer.xr.enabled;
      try {
        renderer.autoClear = false; renderer.setScissorTest(false); renderer.xr.enabled = false;
        const fresh = !targets;
        if (fresh) build();
        const schedule = waterWaveSteps(lastTime === undefined ? 0 : time - lastTime,remainder);
        const reset = fresh || schedule.reset || Math.abs(next.x-origin.x)>=WATER_WAVES.span || Math.abs(next.z-origin.y)>=WATER_WAVES.span;
        if (reset) {
          renderer.setClearColor(0,0); targets!.forEach(t=>{renderer.setRenderTarget(t);renderer.clear();});
          pending.length = 0; wake.reset(); boatWakes.clear(); remainder = 0;
        }
        const shift = solver!.uniforms.shift.value as THREE.Vector2;
        shift.set(reset ? 0 : (next.x-origin.x)/WATER_WAVES.span, reset ? 0 : (next.z-origin.y)/WATER_WAVES.span);
        origin.set(next.x,next.z);
        active = true;
        if (!reset) wake.update(scene.userData.waterSwimmer as WaterSwimmer | undefined,time-(lastTime ?? time),impulse);
        const sources = boats();
        for (const id of boatWakes.keys()) if (!sources.some(boat=>boat.id===id)) boatWakes.delete(id);
        // Marina has two boats. A distant fleet never grows the local solver's work.
        let nearby = 0;
        for (const boat of sources) {
          const distance = Math.max(Math.abs(boat.x-origin.x-WATER_WAVES.span/2),Math.abs(boat.z-origin.y-WATER_WAVES.span/2));
          if (!boat.active || ![boat.x,boat.z,boat.yaw,boat.speed].every(Number.isFinite) || distance > WATER_WAVES.span/2+5 || nearby >= 2) {
            boat.wakeBlend = 0; boatWakes.delete(boat.id); continue;
          }
          nearby++;
          boat.wakeBlend = boatWakeCoverage(boat,origin);
          let trail = boatWakes.get(boat.id);
          if (!trail) { trail = createBoatWake(); boatWakes.set(boat.id,trail); }
          trail.update(boat,reset ? WATER_WAVES.step : time-(lastTime ?? time),boatImpulse);
        }
        const steps = reset ? 0 : schedule.steps;
        const passes = Math.max(steps, shift.lengthSq() > 0 ? 1 : 0);
        for (let i=0;i<passes;i++) {
          solver!.uniforms.state.value = targets![0].texture;
          solver!.uniforms.dt.value = steps ? WATER_WAVES.step : 0;
          const stepTime = time-schedule.remainder-(steps-i-1)*WATER_WAVES.step;
          let count=0;
          if (steps) for(let j=0;j<pending.length;) {
            const p=pending[j];
            if(p.at<=stepTime+1e-7){solver!.uniforms.impulseFoam.value[count]=p.foam??0;solver!.uniforms.impulses.value[count++].set(p.x,p.z,p.radius,p.height);pending.splice(j,1);}else j++;
          }
          solver!.uniforms.impulseCount.value = count;
          renderer.setRenderTarget(targets![1]); quad!.render(renderer);
          targets!.reverse(); shift.set(0,0);
          if (steps) totalSteps++;
          if (count) totalImpulses+=count;
        }
        remainder = reset ? 0 : schedule.remainder; lastTime=time;
        const u = water.uniforms;
        u.uWaveMap.value = targets![0].texture; u.uWaveOrigin.value.copy(origin); u.uWaveBounds.value.copy(bounds);
        u.uWaveHeight.value = box.min.y; u.uWaveReady.value = 1;
        patch!.position.set(origin.x+WATER_WAVES.span/2,box.min.y,origin.y+WATER_WAVES.span/2); patch!.visible = true;
      } finally {
        renderer.setRenderTarget(previousTarget); renderer.setClearColor(clearColor,clearAlpha);
        renderer.autoClear = previousAutoClear; renderer.setScissorTest(scissorTest); renderer.xr.enabled=xr;
      }
    },
    dispose() { release(); if (water?.userData.waveImpulse===onRipple) water.userData.waveImpulse=originalHook; if (water?.userData.waveCoverage===coverage) water.userData.waveCoverage=originalCoverage; },
  };
}
