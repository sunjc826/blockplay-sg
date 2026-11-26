import * as T from 'three';
import { Acting, type Reaction } from './acting';
import { character, limb } from './character';
import { clamp, keyFingers, mouthOpening, type Persona } from './controls';
import { Desk, keyboardHome, type Body } from './desk';
import { buildProps } from './props';
import { buildRoom } from './room';
import { studio } from './studio';

export function facecamState(persona: Persona, seed = 27, clock?: () => number) {
  return { acting: new Acting(persona, clock), desk: new Desk(persona, seed) };
}
export type CamState = ReturnType<typeof facecamState>;
const vec = () => new T.Vector3();
const pulse = (t: number, a: number, b: number, c: number, d: number) => clamp((t - a) / (b - a)) * clamp((d - t) / (d - c));
export function buildFacecam(state: CamState, note: (line: string) => void) {
  const { acting: a, desk } = state,
    id = a.persona,
    pro = id === 'pro',
    loud = id === 'rager';
  const kit = studio(),
    fan = buildRoom(kit, id),
    rig = character(kit, id),
    props = buildProps(kit, id, desk);
  const { scene } = kit,
    camera = new T.OrthographicCamera(-1.68, 1.68, 1.26, -1.26, 0.1, 20);
  scene.background = new T.Color(pro ? '#43566a' : loud ? '#503747' : '#ceaa82');
  const fill = new T.HemisphereLight(
    pro ? '#e5f2ff' : loud ? '#ffe3f0' : '#ffefd6',
    pro ? '#8b929a' : loud ? '#a787a5' : '#c19f82',
    1.55
  );
  const key = new T.DirectionalLight(pro ? '#e7f8ff' : loud ? '#ffe3d8' : '#ffdfaa', 2.05);
  key.position.set(-2, 4, 3);
  scene.add(fill, key);
  camera.position.set(0.56, 1.98, 4.65);
  camera.lookAt(0.05, 0.66, 0);
  camera.updateMatrixWorld();
  kit.bake();
  const sh = vec(),
    el = vec(),
    wrist = vec(),
    rest = vec(),
    emote = vec(),
    mugHome = vec(),
    kb = new T.Object3D();
  let shake = 0,
    armOffset = 0,
    previousReaction: Reaction | null = null,
    previousT = 0,
    sipBlend = 0;
  let firstPose = true;
  const board = desk.get('keyboard')!;
  let returningBoard: { x: number; y: number; z: number; angle: number } | null = null;
  let nudge: Body | undefined,
    nudgeStart = 0;
  const handTargets = [vec(), vec()];
  function moment(r: Reaction, reduced: boolean) {
    const force = reduced ? 0.58 : 1;
    if (r === 'slam' || r === 'thump') {
      const count = desk.impact(r === 'slam', force);
      shake = reduced ? 0 : r === 'slam' ? 0.032 : 0.016;
      if (r === 'slam') note('You slammed the keyboard' + (count ? ' and knocked ' + count + ' keycaps loose.' : '.'));
      else note('You hit the desk with your fist. The things on it jumped.');
    } else if (r === 'slide') note('You slid off your chair in front of chat.');
    else if (r === 'toss' && desk.throwHeadset(force)) {
      a.headsetGone = true;
      note('You took off your headset and threw it.');
    }
  }
  function frame(dt: number, reduced = false, level: number | undefined = undefined, caption = false) {
    a.tick(dt, (r) => moment(r, reduced), armOffset > 0);
    desk.step(dt);
    const r = a.reaction,
      t = a.progress,
      time = a.time,
      m = reduced ? 0.54 : 1;
    const weight = Math.sin(Math.PI * t) * m,
      wide = pulse(t, 0, 0.19, 0.68, 1) * m;
    const beat = (s: Reaction) => (r === s ? wide : 0);
    if (r === 'slam' && t >= 0.57) {
      if (!returningBoard) {
        returningBoard = { x: board.x, y: board.y, z: board.z, angle: board.angle };
        nudge = desk.bodies.find((b) => b.id.startsWith('key-') && b.y >= 0 && Math.abs(b.x) < 1.25 && b.z < 0.95);
        nudgeStart = nudge?.x ?? 0;
      }
      const reach = clamp((t - 0.57) / 0.22),
        smooth = reach * reach * (3 - 2 * reach);
      board.x = T.MathUtils.lerp(returningBoard.x, keyboardHome.x, smooth);
      board.z = T.MathUtils.lerp(returningBoard.z, keyboardHome.z, smooth);
      board.y = T.MathUtils.lerp(returningBoard.y, board.h / 2, smooth) + Math.sin(Math.PI * reach) * 0.2 * m;
      board.angle = returningBoard.angle * (1 - smooth);
      board.vx = board.vy = board.vz = board.spin = 0;
      board.sleep = true;
      if (nudge && t > 0.81) nudge.x = nudgeStart - 0.11 * clamp((t - 0.81) / 0.13);
    } else {
      returningBoard = null;
      nudge = undefined;
    }
    // Peak at contact, glance down at the aftermath, then straighten.
    const strike = r === 'thump' || r === 'slam',
      wind = strike ? pulse(t, 0, 0.27, 0.3, 0.38) * m : 0;
    const after = strike ? pulse(t, 0.34, 0.39, 0.55, 0.86) * m : 0;
    const slide = beat('slide'),
      flinch = beat('flinch'),
      peek = beat('peek'),
      lift = beat('clip') + beat('triumph');
    const address = a.poll ? 1 : beat('glance') + beat('shrug') + beat('clip') + beat('triumph') * 0.8;
    rig.chair.position.z = -0.66 - 0.3 * lift - 0.12 * slide;
    rig.body.position.set(
      0.12 * slide,
      -slide * 1.43 - flinch * 0.28 - peek * 0.11 + lift * 0.09,
      -0.42 + (loud ? 0.07 : pro ? 0 : -0.09) - 0.25 * lift
    );
    rig.body.rotation.set(
      (loud ? 0.16 : pro ? 0.025 : -0.065) +
        0.18 * beat('lean') +
        beat('focus') * 0.055 +
        (pro && a.low ? 0.09 : 0) +
        after * 0.27 +
        flinch * 0.3 -
        wind * 0.17,
      0,
      0.13 * beat('shoulder') * Math.sin(t * 6.28) + slide * 0.33 + 0.09 * beat('shrug')
    );
    rig.head.rotation.y =
      -0.22 + 0.32 * address - clamp(a.gaze, -1, 1) * 0.2 + 0.24 * beat('shake') * Math.sin(4 * Math.PI * t);
    rig.head.rotation.x =
      0.07 +
      weight * (r === 'nod' ? 0.25 * Math.sin(2 * Math.PI * t) : r === 'exhale' ? 0.32 : r === 'protest' ? -0.4 : 0) +
      after * 0.44 +
      (a.reload ? 0.18 : 0) -
      0.16 * lift -
      0.13 * peek;
    rig.head.rotation.z = (loud ? -0.035 : 0) + 0.14 * beat('shrug') - 0.12 * flinch;
    const smile = beat('smile') + lift,
      brow = beat('shrug') + flinch + lift;
    for (let i = 0; i < 2; i++) {
      const sign = i * 2 - 1,
        { eye, brow: b, pupil } = rig.eyes[i];
      eye.scale.y = clamp(
        1 + brow * 0.42 - beat('exhale') * 0.7 - beat('focus') * 0.25 - beat('cover') * 0.75 + (loud ? -0.18 : 0),
        0.17,
        1.55
      );
      pupil.position.x = clamp(-0.029 + 0.023 * address - a.gaze * 0.029, -0.048, 0.048);
      pupil.position.y = -(a.reload ? 0.011 : 0) - after * 0.012;
      b.position.y = 0.119 + brow * (i ? 0.065 : 0.041) - after * 0.018;
      b.rotation.z =
        sign * ((loud ? 0.22 : pro ? 0.04 : 0.1) + a.tilt * 0.22 + after * 0.24 - smile * 0.17) - beat('shrug') * 0.17;
      rig.corners[i].position.y = -0.152 + 0.027 * smile;
    }
    const talk = mouthOpening(level, caption, time);
    rig.mouth.scale.set(1 + smile * 0.19 - 0.25 * talk, 1 + 4 * talk + 2 * flinch + 1.7 * lift, 1);
    fan.rotation.z = reduced ? 0 : time * (loud ? 3.1 : 1.5);
    for (const b of desk.bodies) {
      const g = props.objects.get(b.id) ?? (b.id.startsWith('key-') ? props.caps[Number(b.id.slice(4))] : null);
      if (!g) continue;
      g.position.set(b.x, b.y, b.z);
      g.rotation.z = b.angle;
    }
    const fingers = keyFingers(a.input.held);
    const pressing = !a.handsBusy && !armOffset;
    const held = a.input.held;
    const reachX = pressing
      ? (Number(!!held.left) - Number(!!held.right)) * 0.041 - (held.reload || held.useSupply ? 0.052 : 0)
      : 0;
    const reachZ = pressing
      ? Number(!!held.forward) * 0.035 - Number(!!held.backward) * 0.026 + Number(held.weapon !== undefined) * 0.057
      : 0;
    props.keys.forEach((k, i) => {
      const pressed =
        pressing &&
        fingers.some((f) => f.down && Math.abs(f.at[0] - k.position.x) < 0.008 && Math.abs(f.at[1] - k.position.z) < 0.008);
      k.scale.y = i < desk.detached ? 0 : 0.035;
      k.position.y = i < desk.detached ? -0.01 : pressed ? 0.029 : 0.043;
    });
    props.buttons[0].position.y = pressing && held.aim ? 0.059 : 0.071;
    props.buttons[1].position.y = pressing && a.input.fire ? 0.059 : 0.071;
    if (loud) {
      const c = props.shell.material as T.MeshLambertMaterial;
      // Shift the same palette across the keyboard and mouse.
      c.color.setHSL((time * 0.12) % 1, 0.64, 0.46);
      for (let i = desk.detached; i < props.keys.length; i++)
        (props.keys[i].material as T.MeshLambertMaterial).color.setHSL((time * 0.13 + (i % 6) / 7) % 1, 0.64, 0.6);
    }
    const thrown = desk.get('headset');
    if (thrown) {
      // Detach once while retaining the very same meshes in the instance batch.
      if (rig.headset.parent !== kit.actors) kit.actors.add(rig.headset);
      rig.headset.position.set(thrown.x, thrown.y - 0.16, thrown.z);
      rig.headset.rotation.z = thrown.angle;
    }
    props.mouse.position.set(-0.49 - a.input.x, 0.008 + a.input.lift, 0.44 + a.input.z);
    const keyboard = props.objects.get('keyboard')!;
    kb.position.copy(keyboard.position);
    kb.rotation.copy(keyboard.rotation);
    kb.updateMatrixWorld();
    rig.body.updateMatrixWorld(true);
    // Remember the interrupted pose long enough to lower a hand onto its device.
    if (a.handsBusy) {
      armOffset = 1;
      previousReaction = r;
      previousT = t;
    } else armOffset = Math.max(0, armOffset - dt * 6);
    const gesture = armOffset > 0 ? previousReaction : null,
      gt = previousT;
    const handWave = pulse(gt, 0, 0.2, 0.68, 1) * m * armOffset;
    const mug = desk.get('mug'),
      cup = props.objects.get('mug');
    const sipTarget = gesture === 'sip' ? handWave : 0;
    sipBlend += (sipTarget - sipBlend) * (1 - Math.exp(-dt * 15));
    if (mug && cup) {
      mugHome.set(mug.x, mug.y, mug.z);
      emote.set(-0.12, 0.81, -0.10);
      cup.position.lerpVectors(mugHome, emote, sipBlend);
      cup.rotation.z = mug.angle - 0.58 * sipBlend;
    }
    for (const arm of rig.arms) {
      const { sign, hand, digits } = arm,
        mouse = sign < 0;
      sh.set(sign * 0.33, 0.59, 0.01);
      rig.body.localToWorld(sh);
      if (mouse) rest.copy(props.mouse.position).add(emote.set(0, 0.109, -0.046));
      else {
        rest.set(0.093 + reachX, 0.107, -0.088 + reachZ);
        kb.localToWorld(rest);
      }
      wrist.copy(rest);
      if (gesture) {
        let blend = handWave;
        emote.copy(rest);
        switch (gesture) {
          case 'shrug':
            emote.set(sign * 0.7, 0.69, -0.08);
            break;
          case 'point':
            if (mouse) emote.set(-0.69, 0.62, 0.59);
            break;
          case 'protest':
            emote.set(sign * 0.61, 1.17, -0.17);
            break;
          case 'triumph':
          case 'clip':
            emote.set(sign * 0.65, 1.42, -0.35);
            if (gesture === 'clip' && gt > 0.48 && mouse) emote.set(-0.33, 0.82, 0.56);
            break;
          case 'cover':
            emote.set(sign * 0.14, 1.08, -0.13);
            break;
          case 'slide':
            emote.y -= slide * 1.2;
            emote.z -= slide * 0.5;
            break;
          case 'sip':
            if (mouse && cup) {
              emote.copy(cup.position);
              emote.x -= 0.14;
              emote.y += 0.025;
              blend = pulse(gt, 0, 0.1, 0.87, 1) * m * armOffset;
            }
            break;
          case 'toss':
            if (mouse) emote.set(gt < 0.38 ? -0.37 : -0.97, gt < 0.38 ? 1.23 : 0.84, -0.1);
            break;
          case 'slam':
          case 'thump':
            if (!mouse || gesture === 'slam') {
              emote.set(keyboardHome.x + sign * 0.14, 0.13 + wind * 0.92, keyboardHome.z);
              if (gesture === 'slam' && gt > 0.55) {
                emote.set(board.x + sign * 0.23, board.y + 0.085, board.z);
                blend = pulse(gt, 0.55, 0.6, 0.8, 0.96) * m;
                if (mouse && nudge && gt > 0.8) {
                  emote.set(nudge.x + 0.047, nudge.y + 0.06, nudge.z);
                  blend = pulse(gt, 0.8, 0.84, 0.92, 1) * m;
                }
              }
            }
            break;
        }
        wrist.lerp(emote, blend);
      }
      // Ease an interruption too, even if the incoming facial reaction frees the arms.
      const lastWrist = handTargets[mouse ? 0 : 1];
      if (!firstPose && (armOffset > 0 || sipBlend > 0.01)) wrist.lerp(lastWrist, Math.exp(-dt * 32));
      lastWrist.copy(wrist);
      el.lerpVectors(sh, wrist, 0.53);
      el.x += sign * 0.16;
      if (mouse && !armOffset) el.x += a.input.x * (loud ? 0.46 : pro ? -0.14 : 0.16);
      el.y -= 0.2;
      el.z -= 0.17;
      limb(arm.upper, sh, el);
      limb(arm.lower, el, wrist);
      arm.cuff.position.lerpVectors(sh, el, 0.9);
      arm.cuff.quaternion.copy(arm.upper.quaternion);
      hand.position.copy(wrist);
      hand.rotation.y = mouse ? (loud ? a.input.x * 0.8 : 0) * (1 - handWave) : props.keyboardAngle * (1 - handWave);
      hand.rotation.z = gesture === 'shrug' ? sign * handWave * 1.65 : 0;
      if (handWave > 0.15 && gesture !== 'sip') {
        const pointing = gesture === 'point' || (gesture === 'clip' && gt > 0.48);
        digits.forEach((f, i) => {
          const index = mouse ? i === 2 : i === 3;
          f.position.set((i - (digits.length - 1) / 2) * 0.046, -0.012, pointing && index ? 0.11 : 0.058);
          f.scale.z = pointing && index ? 0.14 : 0.078;
          f.rotation.x = gesture === 'slam' || gesture === 'thump' ? 0.95 : pointing && !index ? 0.7 : 0;
        });
      } else if (mouse) {
        digits.forEach((f, i) => {
          f.position.set(
            (i - 1.5) * 0.068,
            0.003 - ((i === 2 && a.input.fire) || (i === 1 && a.input.held.aim) ? 0.027 : 0),
            0.085
          );
          f.scale.z = 0.098;
          f.rotation.x = i === 2 && a.input.fire ? 0.24 : 0;
        });
      } else {
        keyFingers(a.input.held).forEach(({ at, down }, i) => {
          const finger = digits[i];
          finger.rotation.x = 0;
          finger.position.set(at[0] - 0.093 - reachX, down ? -0.032 : -0.008, at[1] + 0.088 - reachZ);
          finger.scale.z = 0.087 + Math.max(0, at[1]) * 0.3;
        });
      }
    }
    firstPose = false;
    shake *= Math.exp(-dt * 14);
    camera.position.x = 0.56 + (reduced ? 0 : shake * Math.sin(time * 95));
    kit.sync();
  }
  return {
    scene,
    camera,
    frame,
    dispose: kit.dispose,
    get handReturning() {
      return armOffset > 0 && !a.handsBusy;
    },
  };
}
