export type ClipState =
  | { phase: 'idle' | 'finishing' }
  | { phase: 'choosing' | 'starting'; started: number }
  | { phase: 'recording'; started: number; audio: boolean }
  | { phase: 'ready'; url: string; filename: string; audio: boolean }
  | { phase: 'error'; message: string };

const captureOptions = {
  video: { displaySurface: 'browser', width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 30 } },
  audio: { echoCancellation: false, suppressLocalAudioPlayback: false },
  preferCurrentTab: true, selfBrowserSurface: 'include',
  monitorTypeSurfaces: 'exclude', surfaceSwitching: 'exclude', systemAudio: 'exclude',
};

function release(stream: MediaStream) {
  for (const track of stream.getTracks()) track.stop();
}

/** Lives above the changing menu, fullscreen and game portals for one streamer host. */
export function createClipRecorder(publish: (state: ClipState) => void) {
  let state: ClipState = { phase: 'idle' };
  let generation = 0;
  let recorder: MediaRecorder | null = null;

  function set(next: ClipState) { state = next; publish(next); }

  function stop() {
    if (state.phase === 'choosing') {
      generation++;
      set({phase:'idle'});
    } else if (recorder?.state === 'recording') {
      set({phase:'finishing'});
      recorder.stop();
    }
  }

  async function start(persona: string) {
    if (state.phase !== 'idle') return;
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
      set({phase:'error', message:'Tab recording is unavailable here. Try desktop Chrome or Edge.'});
      return;
    }
    const request = ++generation;
    set({phase:'choosing', started:Date.now()});
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(captureOptions);
      if (request !== generation) { release(stream); return; }
      const [video] = stream.getVideoTracks();
      if (!video || video.readyState === 'ended') throw new Error('Capture ended');
      const media = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const started = Date.now();
      const audio = stream.getAudioTracks().length > 0;
      let interrupted = false;
      media.onstart = () => {
        if (request === generation && state.phase === 'starting') set({phase:'recording', started, audio});
      };
      media.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      media.onerror = () => { interrupted = true; stop(); };
      media.onstop = () => {
        release(media.stream);
        if (request !== generation) return;
        recorder = null;
        if (!chunks.length) {
          set({phase:'error', message:interrupted ? 'Recording was interrupted before a clip was available.' : 'The clip was empty. Try recording for a little longer.'});
          return;
        }
        const type = chunks[0].type || media.mimeType;
        const url = URL.createObjectURL(new Blob(chunks, {type}));
        const extension = type.includes('mp4') ? 'mp4' : 'webm';
        const timestamp = new Date(started).toISOString().replace(/[:.]/g, '-');
        set({phase:'ready', url, filename:'blockplay-' + persona + '-' + timestamp + '.' + extension, audio});
      };
      video.addEventListener('ended', stop, {once:true});
      media.start(1000);
      recorder = media;
      set({phase:'starting', started});
    } catch (error) {
      if (stream) release(stream);
      if (request !== generation) return;
      recorder = null;
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      set({phase:'error', message:denied ? 'Recording didn’t start. Choose the game tab to try again.' : 'Couldn’t record this source. Try sharing the game tab.'});
    }
  }

  function dismiss() {
    if (state.phase === 'ready') URL.revokeObjectURL(state.url);
    if (state.phase === 'ready' || state.phase === 'error') set({phase:'idle'});
  }

  function dispose() {
    generation++;
    if (recorder) {
      recorder.onstart = recorder.onstop = recorder.ondataavailable = recorder.onerror = null;
      if (recorder.state !== 'inactive') recorder.stop();
      release(recorder.stream);
      recorder = null;
    }
    if (state.phase === 'ready') URL.revokeObjectURL(state.url);
    state = {phase:'idle'};
  }

  return { start, stop, dismiss, dispose, choosing: () => state.phase === 'choosing' };
}
