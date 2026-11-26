import { type Persona } from './controls';
import type { Studio } from './studio';

export function buildRoom({ room, actors, box, cyl, group }: Studio, persona: Persona) {
  const pro = persona === 'pro',
    loud = persona === 'rager';
  const wall = pro ? '#486479' : loud ? '#664160' : '#d6ac87',
    timber = pro ? '#263448' : loud ? '#543a4d' : '#aa6743';
  const trim = pro ? '#263a51' : loud ? '#402949' : '#806b58';
  box(room, wall, 0, 0.8, -1.91, 8, 4.8, 0.16);
  box(room, timber, 0, -1.28, 0, 8, 0.12, 6);
  // A recessed metal sliding window, a neighbouring slab block and varied lit flats.
  const win = group(room, -1.08, 0.83, -1.78);
  win.scale.set(1, 0.72, 1);
  box(win, trim, 0, 0, 0, 1.51, 1.32, 0.1);
  box(win, pro ? '#132338' : loud ? '#241d40' : '#cca9a0', 0, 0, 0.06, 1.41, 1.22, 0.03);
  for (let i = 0; i < 3; i++) {
    const block = group(win, -0.46 + i * 0.45, -0.15 + (i % 2) * 0.15, 0.083);
    box(block, pro ? '#31465d' : loud ? '#3d3255' : '#9f9295', 0, 0, 0, 0.41, 0.85, 0.024);
    for (let j = 0; j < 5; j++) {
      box(block, '#637182', 0, j * 0.15 - 0.33, 0.018, 0.43, 0.025, 0.017);
      for (let k = 0; k < 3; k++)
        box(
          block,
          (i * 13 + k * 3 + j * 7) % 5 < 2 ? '#f9ce8b' : '#414b62',
          k * 0.12 - 0.12,
          j * 0.15 - 0.27,
          0.023,
          0.066,
          0.068,
          0.02
        );
    }
  }
  box(win, trim, 0, 0, 0.13, 0.055, 1.25, 0.045);
  box(win, '#afbec0', 0, -0.67, 0.13, 1.64, 0.075, 0.22);
  if (loud) for (let i = -2; i <= 2; i++) box(win, '#908799', i * 0.275, 0, 0.16, 0.03, 1.26, 0.045);
  box(room, timber, 0, -0.071, 0.45, 3.3, 0.142, 1.36);
  box(room, pro ? '#404f62' : loud ? '#996075' : '#d79969', 0, -0.051, 1.132, 3.3, 0.035, 0.012);
  for (const x of [-1.48, 1.48]) box(room, trim, x, -0.66, 0.85, 0.1, 1.17, 0.1);
  box(room, pro ? '#151e2b' : loud ? '#241f37' : '#82776a', -0.48, 0.006, 0.45, pro ? 1.2 : 0.77, 0.014, 0.64);
  if (pro) {
    box(room, '#b5dfe9', 0, 1.49, -1.79, 5, 0.037, 0.045);
    const ac = group(room, -0.99, 1.342, -1.65);
    ac.scale.set(0.93, 0.69, 0.72);
    box(ac, '#dde4df', 0, 0, 0, 1.19, 0.29, 0.27);
    box(ac, '#667c87', 0, -0.075, 0.142, 1.02, 0.043, 0.018);
    box(ac, '#9eefa7', 0.46, 0, 0.145, 0.045, 0.018, 0.012);
    box(room, timber, 1.05, 0.92, -1.59, 1.35, 0.085, 0.36);
    for (let i = 0; i < 2; i++) {
      const cup = group(room, 0.66 + i * 0.45, 0.98, -1.57),
        gold = i ? '#aab8ca' : '#efb85c';
      box(cup, '#29323e', 0, 0, 0, 0.22, 0.06, 0.15);
      cyl(cup, gold, 0, 0.11, 0, 0.065, 0.2);
      cyl(cup, gold, 0, 0.225, 0, 0.18, 0.16);
      for (const sign of [-1, 1]) box(cup, gold, sign * 0.095, 0.23, 0, 0.045, 0.09, 0.04).rotation.z = -sign * 0.3;
    }
    box(room, '#a54155', 1.48, 1.24, -1.7, 0.07, 0.3, 0.035);
    cyl(room, '#e5ba65', 1.48, 1.07, -1.68, 0.14, 0.045).rotation.x = Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const tile = box(
        room,
        i % 2 ? '#26394e' : '#32475a',
        0.4 + (i % 3) * 0.36,
        1.17 + Math.floor(i / 3) * 0.22,
        -1.77,
        0.32,
        0.2,
        0.08
      );
      for (let k = -1; k <= 1; k++)
        box(tile, '#3e5365', k * 0.27, 0, 0.48, 0.14, 0.9, 0.35).rotation.z = i % 2 ? 0.12 : -0.12;
    }
  } else {
    const rack = group(room, loud ? 1.29 : -1.53, 0.36, -1.31);
    for (const sign of [-1, 1]) box(rack, '#a4a2a0', sign * 0.39, -0.29, 0, 0.045, 1.25, 0.045);
    box(rack, '#b7bab9', 0, 0.33, 0, 0.85, 0.045, 0.045);
    for (let i = 0; i < 3; i++) {
      box(rack, ['#9bb9ba', '#e6b69c', '#8896b0'][i], -0.25 + i * 0.24, 0.035, 0.02, 0.2, 0.49 - i * 0.04, 0.09);
      box(rack, '#dad1bc', -0.25 + i * 0.24, -0.14 + i * 0.02, 0.071, 0.2, 0.034, 0.015);
    }
    if (loud) {
      box(room, '#ad5274', 1.19, -0.22, -1.03, 1.5, 0.24, 0.86);
      cyl(room, '#b896b3', 1.13, 0.01, -1.04, 0.28, 0.78).rotation.z = Math.PI / 2;
      for (const side of [-1, 1]) box(room, side > 0 ? '#ff689b' : '#6ee7f3', side * 1.48, 1.45, -1.8, 2.96, 0.042, 0.035);
      const poster = group(room, 0.72, 1.04, -1.79);
      box(poster, '#e59a67', 0, 0, 0, 0.52, 0.72, 0.025);
      for (let j = 0; j < 3; j++)
        box(
          poster,
          j % 2 ? '#453458' : '#a33b62',
          -0.06 + j * 0.082,
          -0.03 + j * 0.1,
          0.02,
          0.34,
          0.1,
          0.015
        ).rotation.z = 0.57;
      box(poster, '#fff2c7', 0.208, 0.31, 0.045, 0.13, 0.1, 0.025).rotation.x = -0.7;
    } else {
      box(room, '#92674a', 0.88, 0.85, -1.51, 1.36, 0.075, 0.43);
      box(room, '#4d634e', 0.71, 1.02, -1.48, 0.66, 0.28, 0.29);
      for (const x of [0.52, 0.9]) box(room, '#394c3e', x, 1.04, -1.48, 0.058, 0.32, 0.32);
      box(room, '#657858', 1.33, 0.98, -1.47, 0.27, 0.15, 0.25);
      box(room, '#4c5945', 1.33, 0.92, -1.32, 0.29, 0.046, 0.2);
      const cal = group(room, 0.73, 1.25, -1.78);
      box(cal, '#fff2d2', 0, 0, 0, 0.43, 0.47, 0.035);
      box(cal, '#ae5149', 0, 0.17, 0.025, 0.43, 0.09, 0.025);
      for (let i = 0; i < 12; i++)
        box(
          cal,
          i % 4 ? '#b3a591' : '#b46755',
          -0.14 + (i % 4) * 0.092,
          0.07 - Math.floor(i / 4) * 0.09,
          0.024,
          0.046,
          0.035,
          0.015
        );
    }
  }
  const fan = group(actors, loud ? 1.18 : 1.27, loud ? 1.17 : 0.49, -1.26);
  if (!pro) {
    if (!loud) box(room, '#718077', 1.27, -0.05, -1.27, 0.057, 1.15, 0.05);
    cyl(room, trim, fan.position.x, fan.position.y, -1.39, 0.54, 0.1).rotation.x = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const blade = group(fan);
      blade.rotation.z = (i * 2 * Math.PI) / 3;
      box(blade, '#aebfb7', 0, 0.12, 0, 0.091, 0.22, 0.04).rotation.z = 0.38;
    }
    cyl(room, '#e5d7bc', fan.position.x, fan.position.y, -1.21, 0.11, 0.07).rotation.x = Math.PI / 2;
  }
  if (!pro && !loud) {
    const laptop = group(room, 1.17, 0.17, 0.0);
    laptop.rotation.y = -0.32;
    box(laptop, trim, 0, -0.09, 0, 0.38, 0.16, 0.24);
    box(laptop, '#c1bbb3', 0, 0.01, 0, 0.55, 0.04, 0.34);
    box(laptop, '#596166', 0, 0.2, 0.14, 0.55, 0.37, 0.035);
    box(laptop, '#a9b8ad', 0, 0.2, 0.165, 0.08, 0.055, 0.012);
    for (let i = 0; i < 3; i++)
      box(room, ['#ffd379', '#edbaaa', '#f5db8b'][i], 0.91 + i * 0.12, 0.011, 0.91, 0.12, 0.012, 0.115).rotation.y =
        i * 0.12;
    cyl(room, '#c77850', 1.48, 0.12, 0.77, 0.19, 0.24);
    for (let i = 0; i < 5; i++) {
      const leaf = group(room, 1.48, 0.22, 0.77);
      leaf.rotation.y = i * 1.26;
      box(leaf, i % 2 ? '#698458' : '#416d57', 0.042, 0.1, 0, 0.075, 0.24, 0.07).rotation.z = -0.38;
    }
  }
  return fan;
}
