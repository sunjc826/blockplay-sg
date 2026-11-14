import { WATER_WAVES } from './water-wave-state';
import { waterShoreShader } from './water-shore';

// Shared sampling keeps displaced geometry, reflection normals and refraction in phase.
export const waterWaveField = /* glsl */ `
  ${waterShoreShader}
  uniform float uTime, uChop, uRain, uUltra;
  uniform sampler2D uWaveMap;
  uniform float uWaveReady, uWaveHeight;
  uniform vec2 uWaveOrigin;
  uniform vec4 uWaveBounds;
  const float waveSpan=${WATER_WAVES.span.toFixed(1)};
  const float waveTexel=1.0/${WATER_WAVES.size.toFixed(1)};
  float waveWeight(vec2 p, float baseHeight) {
    if (uWaveReady<.5 || abs(baseHeight-uWaveHeight)>.02) return 0.0;
    vec2 local=p-uWaveOrigin;
    float edge=min(min(local.x,local.y),min(waveSpan-local.x,waveSpan-local.y));
    return smoothstep(0.0,3.0,edge);
  }
  float waveHeight(vec2 p, float baseHeight) {
    return texture2D(uWaveMap,(p-uWaveOrigin)/waveSpan).r*waveWeight(p,baseHeight)*shoreFade(p);
  }
`;


export const waterNormalField = /* glsl */ `
  float waterHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  vec2 windSlope(vec2 p) {
    vec2 cell=floor(p), f=fract(p), u=f*f*(3.0-2.0*f), du=6.0*f*(1.0-f);
    float a=waterHash(cell), b=waterHash(cell+vec2(1,0));
    float c=waterHash(cell+vec2(0,1)), d=waterHash(cell+vec2(1,1));
    return du*vec2(mix(b-a,d-c,u.y),mix(c-a,d-b,u.x));
  }

  vec2 surfaceWave(vec2 p, vec2 dir, float k, float a, float speed, float footprint) {
    return dir*(a*k*cos(dot(p,dir)*k-uTime*speed))*(1.0-smoothstep(1.0,3.14159,k*footprint));
  }
  float waterSwellHeight(vec2 p) {
    return shoreFade(p)*uChop*(.05*sin(p.x*.09+uTime*.7)+.035*sin(p.y*.13-uTime*.9));
  }
  vec2 ambientWaterSlope(vec2 p,float footprint) {
    vec2 slope=surfaceWave(p,normalize(vec2(.8,.6)),.55,.035,1.3,footprint);
    slope+=surfaceWave(p,normalize(vec2(-.5,.86)),.9,.022,1.9,footprint);
    slope+=surfaceWave(p,normalize(vec2(.2,-1.0)),1.7,.012,2.7,footprint);
    slope+=surfaceWave(p,normalize(vec2(-.95,-.3)),3.1,.006,3.6,footprint);
    if(uUltra>.5) {
      slope+=vec2(.0045*cos(p.x*.09+uTime*.7),.00455*cos(p.y*.13-uTime*.9));
      float wind=1.0+uRain*.45;
      slope+=windSlope(p*2.7+vec2(uTime*.22,-uTime*.14))*.045*wind*(1.0-smoothstep(.12,.65,footprint));
      slope+=mat2(.8,.6,-.6,.8)*windSlope(mat2(.8,-.6,.6,.8)*p*7.3+vec2(-uTime*.31,uTime*.19))*.022*wind*(1.0-smoothstep(.04,.25,footprint));
    }
    return slope*uChop*shoreFade(p);
  }
  vec2 interactionWaterSlope(vec2 p,float baseHeight) {
    vec2 dx=vec2(waveSpan*waveTexel,0.0),dz=dx.yx;
    return vec2(waveHeight(p+dx,baseHeight)-waveHeight(p-dx,baseHeight),
      waveHeight(p+dz,baseHeight)-waveHeight(p-dz,baseHeight))/(2.0*waveSpan*waveTexel);
  }
`;
