import * as THREE from 'three';

/** Short exposure along the zoom direction; the viewmodel is drawn afterwards. */
export function createDeploymentBlur(renderer: THREE.WebGLRenderer) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const material = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: { tFrame: { value: null as THREE.Texture | null }, uAmount: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=position.xy*.5+.5;gl_Position=vec4(position,1.);}',
    fragmentShader: `uniform sampler2D tFrame; uniform float uAmount; varying vec2 vUv;
      void main(){
        vec2 trail=(vUv-.5)*uAmount;
        vec3 color=vec3(0.); float weight=0.;
        for(int i=0;i<17;i++){
          float t=float(i)/16.; float w=1.-.55*t;
          color+=texture2D(tFrame,clamp(vUv-trail*t,vec2(.001),vec2(.999))).rgb*w;
          weight+=w;
        }
        gl_FragColor=vec4(color/weight,1.);
      }`,
  });
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; scene.add(mesh);
  const size = new THREE.Vector2();
  let frame: THREE.FramebufferTexture | null = null;
  const release = () => { frame?.dispose(); frame = null; material.uniforms.tFrame.value = null; };
  return {
    warm: () => renderer.compileAsync(scene, camera),
    /** Zero bypasses every GPU pass and releases the temporary full-screen copy. */
    present(amount: number) {
      const strength = Number.isFinite(amount) ? THREE.MathUtils.clamp(amount, 0, .085) : 0;
      if (strength < .0005) { release(); return false; }
      renderer.getDrawingBufferSize(size);
      if (!frame || frame.image.width !== size.x || frame.image.height !== size.y) {
        release(); frame = new THREE.FramebufferTexture(size.x, size.y);
        frame.minFilter = frame.magFilter = THREE.LinearFilter;
      }
      const previous = renderer.getRenderTarget(), autoClear = renderer.autoClear;
      renderer.setRenderTarget(null); renderer.autoClear = false;
      // A previous post-process may have left another texture unit active.
      renderer.state.activeTexture(renderer.getContext().TEXTURE0);
      renderer.copyFramebufferToTexture(frame);
      material.uniforms.tFrame.value = frame; material.uniforms.uAmount.value = strength;
      renderer.render(scene, camera);
      renderer.autoClear = autoClear; renderer.setRenderTarget(previous);
      return true;
    },
    dispose() { release(); geometry.dispose(); material.dispose(); },
  };
}
