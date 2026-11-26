import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { primaryWeaponFamily } from '../game/weapon-modes';
import { getEnvironmentSettings } from '../game/environment-settings';
import { facecamState } from '../game/facecam/scene';
import { cameraCanvas, schedule } from '../game/facecam/playback';
import { placePanel } from '../game/facecam/layout';
import { observeHud } from '../game/facecam/signals';
import type { Persona } from '../game/facecam/controls';
import type { FpsEngine, FpsHud } from '../game/fps-engine';
import type { StreamController } from './StreamerMode';
import './streamer-facecam.css';

export default function StreamerFacecam({
  s,
  name,
  target,
  host,
  voting,
}: {
  s: StreamController;
  name: string;
  target: HTMLElement | null;
  host: Element;
  voting: boolean;
}) {
  const panel = useRef<HTMLElement>(null),
    surface = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const id = s.settings.personaId as Persona,
    run = s.started;
  const poll = useRef(voting);
  poll.current = voting;
  const [mount] = useState(() => document.createElement('div'));
  useLayoutEffect(() => {
    host.append(mount);
    return () => mount.remove();
  }, [host, mount]);
  useLayoutEffect(() => placePanel(panel.current!, target), [target, host]);
  useEffect(() => {
    const parent = surface.current!,
      canvas = document.createElement('canvas');
    parent.append(canvas);
    if (s.camState?.run !== run || s.camState.model.acting.persona !== id)
      s.camState = { run, model: facecamState(id, 27, () => performance.now() / 1000) };
    const model = s.camState.model,
      a = model.acting;
    let view: ReturnType<typeof cameraCanvas>;
    try {
      view = cameraCanvas(canvas, model, s.physicalMoment);
      setFailed(false);
    } catch {
      canvas.remove();
      setFailed(true);
      return;
    }
    let prev: FpsHud | undefined,
      contact = false,
      serial = -1,
      phase = s.snapshot().phase;
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let bound: FpsEngine | null = null;
    const face: NonNullable<StreamController['face']> = {
      engine(e) {
        bound?.setAfterGameFrame();
        bound?.setPilotObserver(undefined);
        bound = e;
        loop.gameClock(!!e);
        e?.setAfterGameFrame(loop.tick);
        e?.setPilotObserver(face.pilot);
      },
      hud(h) {
        observeHud(a, h, prev);
        prev = h;
      },
      signal(signal) {
        if (signal === 'district') {
          prev = undefined;
          contact = false;
        }
        a.signal(signal);
      },
      pilot(action, observation) {
        // Pilot weapon IDs are families. The left hand reaches for the carried slot.
        const slot =
          action.weapon === undefined ? -1 : prev?.carriedWeapons.indexOf(primaryWeaponFamily(action.weapon)) ?? -1;
        a.input.pilot(
          action.weapon === undefined ? action : { ...action, weapon: slot < 0 ? undefined : slot },
          a.handsBusy || view.shot.handReturning
        );
        const c = observation.contacts[0];
        if (c && !contact) a.signal('contact');
        contact = !!c;
        a.gaze = c ? Math.max(-1, Math.min(1, -c.yawError * 3)) : 0;
        a.reload = observation.reloading;
      },
      click() {
        a.input.click();
      },
    };
    const unsubscribe = s.subscribe(() => {
      const next = s.snapshot();
      if (next.phase !== phase) {
        if (next.phase === 'paused') a.signal('pause');
        else if (phase === 'paused') a.signal('resume');
        a.input.held = {};
        a.gaze = 0;
        a.reload = false;
        phase = next.phase;
      }
      if (serial !== next.serial && next.caption && (/\bchat\b/i.test(next.caption) || id === 'comic-streamer'))
        a.signal('chat');
      serial = next.serial;
    });
    const loop = schedule(
      (dt) => {
        const state = s.snapshot();
        a.playing = state.phase === 'play';
        a.poll = poll.current;
        if (state.phase === 'menu' && !a.handsBusy && !view.shot.handReturning) {
          const cursor = document.querySelector('.streamer-cursor')?.getBoundingClientRect();
          if (cursor) a.input.menu(cursor.left / innerWidth, cursor.top / innerHeight);
        }
        view.draw(
          dt,
          media.matches || getEnvironmentSettings().reducedEffects,
          s.settings.voice ? s.player.level() : undefined,
          !!state.caption && state.phase !== 'paused'
        );
      },
      () => document.hidden || !!panel.current?.hidden
    );
    Object.assign(canvas, { facecamTimings: loop.stats });
    s.face = face;
    face.engine(s.engine);
    return () => {
      loop.dispose();
      face.engine(null);
      unsubscribe();
      s.face = null;
      s.player.releaseMeter();
      view.dispose();
      canvas.remove();
    };
  }, [s, id, run]);
  return createPortal(
    <aside className="streamer-facecam" aria-label={name + ' facecam'} ref={panel}>
      <div ref={surface} />
      <small>{failed ? 'Camera unavailable' : name}</small>
    </aside>,
    mount
  );
}
