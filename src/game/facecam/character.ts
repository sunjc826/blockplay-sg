import * as T from 'three';
import type { Studio } from './studio';
import type { Persona } from './controls';

export function character({ actors, box, group, skin: face }: Studio, id: Persona) {
  const pro = id === 'pro',
    rager = id === 'rager';
  const skin = pro ? '#d99c77' : rager ? '#b97e61' : '#ca9072',
    hair = pro ? '#23222a' : rager ? '#e4ad68' : '#443531';
  const cloth = pro ? '#164450' : rager ? '#ede4cf' : '#a6c2c2';
  const chair = group(actors, 0, 0, -0.66);
  box(chair, pro ? '#253749' : rager ? '#502e46' : '#70604e', 0, 0.47, -0.25, 0.83, 1.2, 0.16);
  for (const sign of [-1, 1])
    box(chair, pro ? '#4e7e83' : rager ? '#ba506c' : '#89745a', sign * 0.38, 0.39, -0.14, 0.12, 0.92, 0.16).rotation.z =
      sign * -0.1;
  box(chair, '#41434a', 0, -0.23, 0, 0.91, 0.15, 0.68);
  const body = group(actors, 0, 0, -0.42);
  box(body, cloth, 0, 0.31, 0, pro ? 0.7 : rager ? 0.6 : 0.75, 0.72, 0.4);
  if (rager) box(body, skin, 0, 0.626, 0.012, 0.61, 0.109, 0.4);
  box(body, skin, 0, 0.735, 0.01, 0.22, 0.23, 0.22);
  for (const sign of [-1, 1]) {
    const stripe = box(
      body,
      pro ? '#5bd9b5' : rager ? cloth : '#d9e1d6',
      sign * (rager ? 0.2 : 0.112),
      rager ? 0.628 : 0.603,
      0.202,
      rager ? 0.105 : 0.092,
      0.18,
      0.034
    );
    stripe.rotation.z = rager ? 0 : -sign * 0.54;
  }
  if (pro) {
    for (const sign of [-1, 1]) box(body, '#238692', sign * 0.27, 0.25, 0.211, 0.076, 0.36, 0.021).rotation.z = -sign * 0.14;
    for (const sign of [-1, 1])
      box(body, '#20847e', sign * 0.145, 0.271, 0.225, 0.305, 0.07, 0.018).rotation.z = sign * 0.32;
    box(body, '#e9f1c0', -0.19, 0.43, 0.217, 0.094, 0.074, 0.023).rotation.z = 0.76;
  } else if (rager) {
    for (const s of [-1, 1]) box(body, '#e4b861', s * 0.075, 0.62, 0.232, 0.028, 0.23, 0.027).rotation.z = -s * 0.57;
    box(body, '#f4cb72', 0, 0.495, 0.238, 0.046, 0.067, 0.032);
  } else {
    for (const s of [-1, 1]) box(body, '#364f65', s * 0.065, 0.49, 0.232, 0.03, 0.32, 0.026).rotation.z = -s * 0.32;
    box(body, '#e8e1cd', 0, 0.293, 0.244, 0.116, 0.15, 0.027);
    box(body, '#607c79', 0, 0.326, 0.261, 0.074, 0.054, 0.012);
    box(body, '#819d9e', -0.21, 0.4, 0.205, 0.145, 0.1, 0.018);
  }
  const head = group(body, 0, 1.026, 0);
  face(head, skin);
  box(head, hair, 0, 0.25, -0.02, 0.62, 0.18, 0.49);
  for (const sign of [-1, 1]) {
    box(head, rager ? '#48322d' : hair, sign * 0.285, 0.136, -0.007, 0.078, 0.22, 0.42);
    box(head, skin, sign * 0.322, -0.039, 0.013, 0.075, 0.13, 0.11);
  }
  const fringe = box(head, hair, rager ? -0.037 : 0.034, 0.21, 0.18, 0.48, 0.17, 0.14);
  fringe.rotation.z = pro ? 0.09 : rager ? -0.18 : 0.13;
  if (rager)
    for (let i = 0; i < 3; i++)
      box(head, i % 2 ? '#c58b53' : '#f3c384', -0.16 + i * 0.14, 0.314, 0.08, 0.16, 0.135, 0.28).rotation.z = -0.33;
  if (!rager && !pro) box(head, hair, -0.18, 0.205, 0.204, 0.2, 0.092, 0.085).rotation.z = -0.26;
  const headset = group(head);
  headset.rotation.z = rager ? 0.13 : 0;
  box(headset, '#242633', 0, 0.378, -0.022, 0.62, 0.055, 0.091);
  for (const s of [-1, 1]) {
    box(headset, '#343542', s * 0.311, 0.219, -0.015, 0.048, 0.32, 0.082).rotation.z = -s * 0.065;
    box(headset, rager ? '#5a3556' : '#293541', s * 0.337, 0.042, 0, rager ? 0.146 : 0.095, rager ? 0.225 : 0.176, 0.176);
    box(headset, pro ? '#4db6a5' : rager ? '#f1778d' : '#80918d', s * (rager ? 0.41 : 0.386), 0.047, 0, 0.018, 0.091, 0.08);
  }
  box(headset, '#39343a', -0.29, -0.031, 0.14, 0.031, 0.039, 0.24).rotation.x = 0.25;
  box(headset, '#222733', -0.264, -0.069, 0.251, 0.09, 0.053, 0.057);
  const eyes = [-1, 1].map((s) => {
    const eye = group(head, s * 0.135, 0.025, 0.229);
    box(eye, '#fff1dc', 0, 0, 0, 0.153, 0.077, 0.035);
    const pupil = box(eye, '#362c30', 0, 0, 0.022, 0.062, 0.073, 0.018);
    const brow = box(head, hair === '#e4ad68' ? '#503831' : hair, s * 0.136, 0.12, 0.247, 0.162, 0.039, 0.025);
    return { eye, pupil, brow };
  });
  box(head, skin, 0, -0.046, 0.25, 0.072, 0.09, 0.065);
  const mouth = group(head, 0, -0.151, 0.237);
  box(mouth, '#6b403d', 0, 0, 0, 0.136, 0.021, 0.023);
  const corners = [-1, 1].map((s) => box(head, '#6b403d', s * 0.074, -0.152, 0.238, 0.035, 0.023, 0.021));
  const arms = [-1, 1].map((sign) => {
    const upper = box(actors, rager ? skin : cloth, 0, 0, 0, 0.165, 1, 0.172);
    const lower = box(actors, skin, 0, 0, 0, 0.127, 1, 0.141);
    const cuff = box(actors, pro ? '#2ba493' : rager ? cloth : '#d9e1d6', 0, 0, 0, 0.17, 0.061, 0.176);
    const hand = group(actors);
    box(hand, skin, 0, 0, 0, sign < 0 ? 0.156 : 0.244, 0.074, 0.15);
    const digits = Array.from({ length: sign < 0 ? 3 : 5 }, () => box(hand, skin, 0, 0, 0, 0.04, 0.044, 0.098));
    return { sign, upper, lower, cuff, hand, digits };
  });
  return { body, chair, head, headset, eyes, mouth, corners, arms };
}
const up = new T.Vector3(0, 1, 0),
  delta = new T.Vector3();
export function limb(mesh: T.Mesh, from: T.Vector3, to: T.Vector3) {
  delta.subVectors(to, from);
  mesh.position.copy(from).addScaledVector(delta, 0.5);
  mesh.scale.y = delta.length();
  mesh.quaternion.setFromUnitVectors(up, delta.normalize());
}
