import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AudioLines, Brain, Camera, Check, Crosshair, Flame, KeyRound, MessageSquare, Mic, Play, Radio, ShieldCheck, X } from 'lucide-react';
import { CAST_PERSONAS } from '../game/ai-cast-personas';
import type { StreamSettings } from '../game/streamer-session';
import { castResetTime, type CastQuota, type CastVoiceStatus } from '../lib/cast-client';
import { useModalFocus } from '../lib/use-modal-focus';
import { CastVoiceBudget } from './CastVoiceSwitch';
import { MenuButton, MenuItemCard } from './MenuControls';
import './streamer-setup.css';

export interface StreamerStatus {
  available: boolean;
  model: string;
  provider: string;
  admin: boolean;
  quota: CastQuota;
  voice?: CastVoiceStatus;
}
type Props = {
  status: StreamerStatus | null;
  onStatus: (value: StreamerStatus) => void;
  settings: StreamSettings;
  onSettings: (value: StreamSettings) => void;
  memorySummary: string;
  onForget: () => void;
  onKeepLearning: (keep: boolean) => void;
  usage: string;
  onClose: () => void;
  onStart: () => void;
};
const personas = CAST_PERSONAS.filter(persona => persona.role === 'streamer');
const personaIcons = { pro: Crosshair, rager: Flame, 'comic-streamer': Mic };

async function readStatus(signal: AbortSignal, action = 'status', passphrase?: string): Promise<StreamerStatus> {
  const init: RequestInit = { signal, cache: 'no-store' };
  if (action !== 'status') {
    init.method = 'POST';
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify({passphrase});
  }
  const response = await fetch('/api/ai/' + action, init);
  const data = await response.json().catch(() => null);
  if (!response.ok || typeof data?.streamer?.available !== 'boolean' || !data.quota) {
    throw new Error((data?.error || 'Streamer service unavailable.') + (data?.resetsAt ? ' · Resets at ' + castResetTime(data.resetsAt) : ''));
  }
  return { ...data.streamer, admin: data.admin, quota: data.quota, voice: data.voice };
}

function Setting({icon, title, detail, checked, disabled, change}: {
  icon: ReactNode; title: string; detail?: ReactNode; checked: boolean; disabled?: boolean; change: (value: boolean) => void;
}) {
  return <label className="stream-setup-row">
    {icon}<span><strong>{title}</strong>{detail && <small>{detail}</small>}</span>
    <input type="checkbox" role="switch" aria-label={title} checked={checked} disabled={disabled} onChange={e => change(e.target.checked)} />
  </label>;
}

export function StreamerSetup({status, onStatus, settings, onSettings, memorySummary, onForget, onKeepLearning, usage, onClose, onStart}: Props) {
  const dialog = useRef<HTMLElement>(null);
  useModalFocus(dialog, true, onClose);
  const [showLogin, setShowLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const accountButton = useRef<HTMLButtonElement>(null);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    const request = new AbortController();
    pending.current = request;
    void readStatus(request.signal).then(onStatus).catch(error => {
      if (!request.signal.aborted) setProblem(error.message);
    });
    return () => pending.current?.abort();
  }, [onStatus]);

  async function authenticate(passphrase?: string) {
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    setBusy(true);
    setProblem('');
    try {
      const next = await readStatus(request.signal, passphrase === undefined ? 'admin/logout' : 'admin/login', passphrase);
      if (request.signal.aborted) return;
      onStatus(next);
      setShowLogin(false);
      accountButton.current?.focus();
    } catch (error) {
      if (!request.signal.aborted) setProblem(error instanceof Error ? error.message : 'Admin sign-in unavailable.');
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }

  const quota = status?.quota;
  const limitReached = !!quota && quota.used >= quota.limit;
  const voice = status?.voice;
  return <div className="stream-setup-backdrop"><section className="stream-setup" role="dialog" aria-modal="true" aria-labelledby="stream-setup-title" ref={dialog}>
    <div className="stream-setup-scroll">
      <header className="stream-setup-header">
        <MenuButton className="stream-setup-close" aria-label="Close streamer mode" onClick={onClose}><X size={19}/></MenuButton>
        <Radio className="stream-setup-mark" size={27} aria-hidden="true"/>
        <h2 id="stream-setup-title">Streamer mode</h2>
        <p>Watch your streamer play solo with its own wallet and loadout.</p>
      </header>
      <div className="stream-setup-account">
        <div className="stream-account-line">
          <div><ShieldCheck size={19}/><strong>{status ? status.admin ? 'Admin access' : 'Guest access' : 'AI access'}</strong></div>
          <MenuButton ref={accountButton} aria-expanded={status?.admin ? undefined : showLogin} aria-disabled={busy} onClick={() => {
            if (busy) return;
            if (status?.admin) void authenticate();
            else setShowLogin(!showLogin);
          }}><KeyRound size={15}/>{status?.admin ? 'Sign out' : 'Admin sign-in'}</MenuButton>
        </div>
        {quota && <div className="stream-account-quota">
          <span><b>{quota.used.toLocaleString()} / {quota.limit.toLocaleString()}</b> daily AI calls</span>
          <small>{limitReached ? 'Limit reached · ' : ''}Resets at {castResetTime(quota.resetsAt)}</small>
          <progress aria-label="Daily AI calls" value={quota.used} max={Math.max(1, quota.limit)}/>
        </div>}
        {showLogin && <form className="stream-account-login" onSubmit={event => {
          event.preventDefault();
          if (busy) return;
          const form = event.currentTarget;
          const pass = new FormData(form).get('passphrase');
          if (typeof pass === 'string' && pass) { form.reset(); void authenticate(pass); }
        }}>
          <label>Admin passphrase<input name="passphrase" type="password" autoComplete="current-password" autoFocus required /></label>
          <MenuButton type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</MenuButton>
        </form>}
        {problem && <p className="stream-setup-error" role="alert">{problem}</p>}
      </div>
      <div className="stream-setup-columns">
        <section aria-labelledby="stream-persona-title">
          <h3 id="stream-persona-title">Choose your streamer</h3>
          <div className="stream-personas">{personas.map(persona => {
            const Icon = personaIcons[persona.id as keyof typeof personaIcons] ?? Radio;
            const selected = settings.personaId === persona.id;
            return <MenuItemCard className="stream-persona" key={persona.id} aria-pressed={selected} onClick={() => onSettings({...settings, personaId: persona.id})}>
              <span className="stream-persona-icon"><Icon size={20}/></span>
              <span><strong>{persona.name}</strong><small>{persona.blurb}</small></span>
              <span className="stream-persona-check">{selected && <Check size={12}/>}</span>
            </MenuItemCard>;
          })}</div>
        </section>
        <section aria-labelledby="stream-settings-title">
          <h3 id="stream-settings-title">Session settings</h3>
          <Setting icon={<AudioLines/>} title="Voice" checked={!!settings.voice && !!voice?.available} disabled={!voice?.available}
            detail={voice?.available ? settings.voice ? <CastVoiceBudget voice={voice}/> : 'Captions only' : (voice?.reason ?? (problem || status ? 'Voice unavailable' : 'Checking voice availability…'))}
            change={value => onSettings({...settings, voice:value})}/>
          <Setting icon={<MessageSquare/>} title="Clean language" checked={settings.clean} change={value => onSettings({...settings, clean:value})}/>
          <Setting icon={<Camera/>} title="Send gameplay screenshots" checked={settings.screenshots} change={value => onSettings({...settings, screenshots:value})}/>
          <Setting icon={<Brain/>} title="Keep what it learns" detail={memorySummary} checked={!!settings.keepLearning} change={onKeepLearning}/>
          <button className="stream-forget" type="button" onClick={onForget}>Forget saved learning</button>
        </section>
      </div>
      <p className="stream-setup-privacy">The AI provider receives menu choices, game state, past lines and any screenshots you enable. With voice on, the voice provider receives the streamer's lines.</p>
    </div>
    <footer className="stream-setup-footer">
      <div role="status"><strong>{status ? status.available ? status.provider + ' · ' + status.model : 'Streamer provider unavailable' : problem ? 'Service unavailable' : 'Checking availability…'}</strong>
        {quota && <small>Session usage · {usage}</small>}</div>
      <MenuButton variant="primary" disabled={!status?.available || limitReached || busy} onClick={onStart}><Play size={16} fill="currentColor"/>Start streamer</MenuButton>
    </footer>
  </section></div>;
}
