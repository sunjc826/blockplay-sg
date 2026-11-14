/** Artistic refracted-light approximation. Shared water depth/height samples
 * keep the moving bands and local focusing attached to the submerged receiver. */
export const waterCausticsShader = /* glsl */ `
  float causticBands(vec2 p, float footprint, float phaseOffset) {
    // Curve the filaments within each moving cell rather than leaving a
    // straight polygonal net. Opposed phases keep the two scales independent.
    p+=.19*sin(p.yx*2.4+vec2(uTime*.31+phaseOffset,-uTime*.27));
    footprint*=1.45;
    vec2 cell=floor(p),local=fract(p);
    float first=8.0,second=8.0;
    for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++) {
      vec2 offset=vec2(float(x),float(y)),id=cell+offset;
      vec2 seed=vec2(waterHash(id),waterHash(id+37.2));
      vec2 phase=6.28318*seed+phaseOffset;
      vec2 point=offset+.5+.29*sin(phase+uTime*(.48+seed*.24))-local;
      float distanceSquared=dot(point,point);
      if(distanceSquared<first){second=first;first=distanceSquared;}
      else second=min(second,distanceSquared);
    }
    float gap=sqrt(second)-sqrt(first);
    // Widen subpixel bands but reduce their energy, avoiding distant glitter.
    float width=.032+footprint*.6;
    return (1.0-smoothstep(width,width*2.3,gap))*.032/width;
  }
  float dynamicCaustic(vec2 p, float depth, float footprint, float baseHeight) {
    vec2 bend=windSlope(p*2.7+vec2(uTime*.22,-uTime*.14))*.045*uChop;
    bend+=vec2(.019*cos(dot(p,vec2(.8,.6))*.55-uTime*1.3),
      .02*cos(dot(p,vec2(-.5,.86))*.9-uTime*1.9))*uChop;
    float focus=1.0;
    if(uCausticResponse>0.0 && waveWeight(p,baseHeight)>0.0) {
      // Surface curvature concentrates/diverges refracted light. Five filtered
      // height taps also bend the pattern with bullet rings and boat wakes.
      float spacing=max(.125,footprint*1.5);
      vec2 dx=vec2(spacing,0.0),dz=dx.yx;
      float h=waveHeight(p,baseHeight);
      float l=waveHeight(p-dx,baseHeight),r=waveHeight(p+dx,baseHeight);
      float b=waveHeight(p-dz,baseHeight),t=waveHeight(p+dz,baseHeight);
      bend+=vec2(r-l,t-b)/(2.0*spacing)*uCausticResponse;
      vec2 curvature=clamp(vec2(l+r,b+t)-2.0*h,-3.0*spacing*spacing,3.0*spacing*spacing)/(spacing*spacing);
      vec2 jacobian=vec2(1.0)-curvature*min(depth,1.5)*.25*uCausticResponse;
      focus=clamp(1.0/max(.55,abs(jacobian.x*jacobian.y)),.65,1.8);
    }
    p-=clamp(bend*depth*.75,vec2(-.35),vec2(.35));
    vec2 drift=vec2(uTime*.075,-uTime*.055);
    vec2 warp=.18*vec2(sin(p.y*1.7+uTime*.46),sin(p.x*1.4-uTime*.39));
    float broad=causticBands((p+warp+drift)*1.45,footprint*1.45,0.0);
    float fine=causticBands(mat2(.8,-.6,.6,.8)*(p-warp-drift*.7)*2.15+19.3,footprint*2.15,2.1);
    // Crossings briefly focus more light; soft troughs conserve the overall
    // brightness instead of painting white lines over the bottom.
    float bands=broad*.65+fine*.4+broad*fine*.6;
    return (bands+.24)*focus-.36;
  }
`;
