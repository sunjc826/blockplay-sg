import { castResetTime, type CastVoiceStatus } from '../lib/cast-client';

export function CastVoiceBudget({voice}:{voice?:CastVoiceStatus}) {
  if (!voice) return null;
  const {used,limit,resetsAt} = voice.quota;
  return <small>{used} / {limit} voice characters · Resets at {castResetTime(resetsAt)}</small>;
}

export function CastVoiceSwitch({voice,enabled,change}:{voice?:CastVoiceStatus;enabled:boolean;change:(value:boolean)=>void}) {
  return <>
    <label><input type="checkbox" checked={enabled && !!voice?.available} disabled={!voice?.available} onChange={e => change(e.target.checked)}/> Voice</label>
    {!voice?.available && <small>{voice?.reason ?? 'Voice unavailable'} · Captions only</small>}
    {enabled && <CastVoiceBudget voice={voice}/>}
  </>;
}
