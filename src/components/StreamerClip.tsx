import { useEffect, useState } from 'react';
import { Circle, Download, LoaderCircle, Square, X } from 'lucide-react';
import type { ClipState, createClipRecorder } from '../lib/streamer-clip';

function RecordingTime({started}: {started:number}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  return <span>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>;
}

export function StreamerClip({clip, recorder, persona}: {clip:ClipState; recorder:ReturnType<typeof createClipRecorder>; persona:string}) {
  switch (clip.phase) {
    case 'idle':
      return <button className="streamer-record" title="Record the game tab. Share tab audio to include sound." onClick={() => void recorder.start(persona)}>
        <Circle size={10} fill="currentColor"/> Record clip
      </button>;
    case 'choosing':
      return <span className="streamer-choosing"><LoaderCircle size={14}/><span role="status">Choose the game tab…</span><RecordingTime started={clip.started}/></span>;
    case 'starting':
      return <button className="streamer-choosing" aria-label="Stop starting clip" onClick={recorder.stop}><Square size={10}/> Starting clip… <RecordingTime started={clip.started}/></button>;
    case 'recording':
      return <button className="streamer-record is-recording" aria-label="Finish clip" title="Finish clip" onClick={recorder.stop}>
        <Square size={10} fill="currentColor"/> Finish <RecordingTime started={clip.started}/>{!clip.audio && ' · Silent'}
      </button>;
    case 'finishing':
      return <span role="status">Finishing clip…</span>;
    case 'ready':
      return <><a className="streamer-download" href={clip.url} download={clip.filename}><Download size={14}/> Download clip</a>
        <button aria-label="Dismiss finished clip" onClick={recorder.dismiss}><X size={14}/></button></>;
    case 'error':
      return <><span role="status">{clip.message}</span><button aria-label="Dismiss recording message" onClick={recorder.dismiss}><X size={14}/></button></>;
  }
}
