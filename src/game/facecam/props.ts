import type { Studio } from './studio';
import { keyboardHome, type Desk } from './desk';
import { type Persona } from './controls';

export function buildProps({ actors, box, cyl, group }: Studio, persona: Persona, desk: Desk) {
  const loud = persona === 'rager',
    pro = persona === 'pro';
  const keyboardAngle = pro ? 0.57 : loud ? -0.11 : 0.08;
  const objects = new Map<string, ReturnType<typeof group>>();
  const keys: ReturnType<typeof box>[] = [];
  const rgb = ['#fe5989', '#ffa566', '#e4df86', '#67deba', '#63b9f5', '#ba89ec'];
  const boardColor = pro ? '#283341' : loud ? '#322737' : '#53626a';
  for (const b of desk.bodies) {
    const g = group(actors, b.x, b.y, b.z);
    objects.set(b.id, g);
    switch (b.id) {
      case 'keyboard':
        g.rotation.y = keyboardAngle;
        box(g, boardColor, 0, 0, 0, 0.68, 0.065, 0.34);
        for (let row = 0; row < 3; row++)
          for (let col = 0; col < 6; col++) {
            const key = box(
              g,
              loud ? rgb[col] : pro ? '#606e7b' : '#c4cccb',
              (col - 2.5) * 0.091,
              0.043,
              0.102 - row * 0.081,
              0.076,
              0.035,
              0.064
            );
            keys.push(key);
          }
        for (const x of [-0.046, 0.272]) box(g, loud ? '#83b9bd' : '#77888c', x, 0.043, -0.106, 0.068, 0.032, 0.056);
        box(g, loud ? '#8b95c7' : '#809499', -0.035, 0.042, -0.125, 0.32, 0.03, 0.045);
        break;
      case 'monitor':
        g.rotation.y = 0.94;
        box(g, '#31343e', 0, -0.4, 0, 0.4, 0.06, 0.3);
        box(g, '#494858', 0, -0.18, 0, 0.09, 0.4, 0.08);
        box(g, pro ? '#354457' : loud ? '#362d44' : '#535b5b', -0.1, 0.16, 0, 0.74, 0.49, 0.072);
        box(g, '#6a7380', -0.1, 0.18, 0.041, 0.22, 0.06, 0.02);
        box(g, '#9ed8da', 0.21, -0.06, -0.043, 0.045, 0.023, 0.014);
        break;
      case 'noodles':
        cyl(g, '#f1d89e', 0, 0, 0, 0.29, 0.31);
        cyl(g, '#cd4c49', 0, -0.01, 0, 0.299, 0.17);
        box(g, '#fff0b4', 0, -0.01, 0.15, 0.13, 0.05, 0.012);
        cyl(g, '#fff0ce', 0, 0.16, 0, 0.32, 0.035);
        cyl(g, '#ac783f', 0, 0.181, 0, 0.25, 0.012);
        box(g, '#d1d5cb', 0.044, 0.26, 0, 0.023, 0.21, 0.022).rotation.z = -0.37;
        break;
      case 'bag':
        box(g, '#e3cfb4', 0, -0.01, 0, 0.21, 0.27, 0.18);
        box(g, '#d99049', 0, -0.035, 0.024, 0.15, 0.19, 0.15);
        for (const x of [-0.055, 0.055]) box(g, '#efddc6', x, 0.14, 0, 0.026, 0.16, 0.04).rotation.z = x * 5;
        box(g, '#ffc785', 0.037, 0.19, 0.02, 0.021, 0.22, 0.024).rotation.z = -0.18;
        break;
      case 'tissues':
        box(g, '#75b0b4', 0, 0, 0, 0.3, 0.08, 0.17);
        box(g, '#f9e5df', 0, 0.054, 0, 0.14, 0.04, 0.07).rotation.z = 0.2;
        break;
      case 'scrap':
      case 'scrap2':
        box(g, '#f3ddc9', 0, 0, 0, b.w, b.h, b.d).rotation.z = 0.47;
        break;
      case 'phone':
        box(g, '#202330', 0, 0, 0, b.w, b.h, b.d);
        box(g, '#696c76', 0.043, 0.024, 0.098, 0.043, 0.014, 0.06);
        break;
      case 'can':
        cyl(g, pro ? '#cedac6' : '#bc4b62', 0, 0, 0, b.w, b.h);
        cyl(g, pro ? '#365a52' : '#f6b753', 0, -0.015, 0, b.w + 0.005, 0.095);
        cyl(g, '#c8cbd0', 0, 0.172, 0, 0.18, 0.015);
        box(g, '#667780', 0, 0.184, -0.021, 0.055, 0.012, 0.031);
        break;
      case 'mug':
        cyl(g, '#f8e6bc', 0, 0, 0, 0.24, 0.24);
        cyl(g, '#42745f', 0, -0.06, 0, 0.245, 0.033);
        cyl(g, '#603e2d', 0, 0.123, 0, 0.205, 0.008);
        for (const y of [-0.065, 0.07]) box(g, '#f3dfb8', -0.143, y, 0, 0.092, 0.033, 0.044);
        box(g, '#f3dfb8', -0.184, 0, 0, 0.031, 0.16, 0.044);
        break;
      case 'tin':
        cyl(g, '#c78b40', 0, 0, 0, 0.35, 0.17);
        cyl(g, '#b5493b', 0, 0.07, 0, 0.36, 0.045);
        for (let i = 0; i < 4; i++)
          box(
            g,
            '#f2ce78',
            Math.cos(i * 1.57) * 0.085,
            0.098,
            Math.sin(i * 1.57) * 0.085,
            0.055,
            0.014,
            0.055
          ).rotation.y = 0.7;
        break;
    }
  }
  const mouse = group(actors),
    shell = box(mouse, pro ? '#39434c' : loud ? '#432f4e' : '#637377', 0, 0.035, 0, 0.14, 0.065, 0.19);
  const buttons = [-1, 1].map((s) =>
    box(mouse, loud ? rgb[s + 2] : '#8d9fa1', s * 0.038, 0.071, 0.045, 0.058, 0.016, 0.075)
  );
  box(mouse, '#30363e', 0, 0.08, 0.048, 0.017, 0.025, 0.041);
  const caps = Array.from({ length: 18 }, (_, i) => box(actors, rgb[i % 6], 0, -4, 0, 0.076, 0.036, 0.064));
  return { objects, keys, mouse, buttons, shell, caps, keyboardAngle, keyboardHome };
}
