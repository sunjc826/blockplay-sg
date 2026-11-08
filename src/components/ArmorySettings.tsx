import { useRef, useState, type KeyboardEvent } from 'react';
import { Gamepad2, Monitor, UserRound, Volume2 } from 'lucide-react';
import RankBadge from './RankBadge';
import HudHintsToggle from './HudHintsToggle';
import BotDifficultySettings from './BotDifficultySettings';
import MusicSettings from './MusicSettings';
import EffectsSettings from './EffectsSettings';
import VoiceSettings from './VoiceSettings';
import GraphicsSettings from './GraphicsSettings';
import AimAssistToggle from './AimAssistToggle';
import PerfOverlaySettings from './PerfOverlaySettings';
import { MENU_DESIGNS, setMenuDesign, useMenuDesign } from '../lib/menu-design';
import { RELOAD_STYLES, setReloadStyle, useReloadStyle } from '../game/reload-style-setting';
import { progression } from '../game/progression';
import { rankInsignia, rankSets } from '../game/rank-insignia';
import { addressLine, encikLines, encikRegister, type EncikTone } from '../game/encik-registers';
import type { ArmoryStore } from '../game/use-armory';

const TONES = [{ id: 'rank', name: 'Follows your rank' }, { id: 'recruit', name: 'Treats you like a recruit' }] as const;

export const SETTINGS_TABS = [
  { id: 'gameplay', name: 'Gameplay', icon: Gamepad2 },
  { id: 'video', name: 'Video', icon: Monitor },
  { id: 'audio', name: 'Audio', icon: Volume2 },
  { id: 'profile', name: 'Profile', icon: UserRound },
] as const;
export type SettingsTab = typeof SETTINGS_TABS[number]['id'];
/** The tab last opened, remembered per browser so the in-game overlay reopens where you left it. */
const TAB_KEY = 'blockplay-sg-settings-tab-v1';
const isTab = (value: unknown): value is SettingsTab => SETTINGS_TABS.some(tab => tab.id === value);
function savedTab(): SettingsTab {
  try { const value = localStorage.getItem(TAB_KEY); return isTab(value) ? value : 'gameplay'; }
  catch { return 'gameplay'; }
}

/** Every setting, in tabs: gameplay, video, audio and the profile's look and Encik. */
export default function ArmorySettings({ store, tab: initialTab }: { store: Pick<ArmoryStore, 'profile' | 'wearRankSet' | 'setEncikTone'>; tab?: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(() => initialTab ?? savedTab());
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const choose = (next: SettingsTab, focus = false) => {
    setTab(next);
    try { localStorage.setItem(TAB_KEY, next); } catch { /* Settings work without storage. */ }
    if (focus) tabButtons.current[SETTINGS_TABS.findIndex(t => t.id === next)]?.focus();
  };
  // Arrow keys, Home and End move between tabs, as a tab list should.
  const onTabKey = (event: KeyboardEvent) => {
    const index = SETTINGS_TABS.findIndex(t => t.id === tab), last = SETTINGS_TABS.length - 1;
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    choose(SETTINGS_TABS[(next + SETTINGS_TABS.length) % SETTINGS_TABS.length].id, true);
  };
  const { profile } = store, reloadStyle = useReloadStyle(), menuDesign = useMenuDesign();
  const level = progression(profile.xp), insignia = rankInsignia(level.level, profile.rankSet);
  // A sample in the player's own rank, so the setting shows the joke rather
  // than describing it. `kill` is short and every register rewrites it.
  const encikSample = (tone: EncikTone) => addressLine(encikLines('kill', { level: level.level, rank: insignia.title, tone })[0], insignia.title);
  const encikNow = encikRegister({ level: level.level, rank: insignia.title, tone: profile.encikTone });
  return <section className="armory-settings" aria-label="Settings">
    <div className="settings-tabs" role="tablist" aria-label="Settings categories" onKeyDown={onTabKey}>{SETTINGS_TABS.map(({ id, name, icon: Icon }, i) =>
      <button key={id} ref={el => { tabButtons.current[i] = el; }} type="button" role="tab" id={`settings-tab-${id}`} data-tab={id} aria-selected={tab === id} aria-controls={`settings-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => choose(id)}><Icon size={15} aria-hidden /> {name}</button>)}
    </div>
    <div className="settings-panel" role="tabpanel" id={`settings-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`} data-panel={tab}>
      {tab === 'gameplay' && <>
        <BotDifficultySettings />
        <div className="armory-settings-group">
          <h2>Touch aim assist</h2><p>On touchscreens, slows the sights over a visible target and nudges a drag towards it. A mouse plays the same either way.</p>
          <AimAssistToggle />
        </div>
        <div className="armory-settings-group">
          <h2>HUD hints</h2><p>On a computer, show HUD instructions and key reminders. Turn them off to keep combat information, objectives and warnings. Touch controls stay visible.</p>
          <HudHintsToggle />
        </div>
        <div className="armory-settings-group">
          <h2>Reload animation</h2><p>How your hands change a magazine. Only the look differs: every gun reloads in the same time either way.</p>
          <div role="group" aria-label="Reload animation">{RELOAD_STYLES.map(style => <button key={style.id} data-reload-style={style.id} aria-pressed={reloadStyle === style.id} onClick={() => setReloadStyle(style.id)}><span><strong>{style.name}{style.id === 'improved' ? ' · Default' : ''}</strong><small>{style.description}</small></span></button>)}</div>
        </div>
      </>}
      {tab === 'video' && <>
        <div className="armory-settings-group">
          <h2>Menu design</h2><p>Compare the main menu and Play selectors. Applies immediately and is remembered on this device.</p>
          <div role="group" aria-label="Menu design">{MENU_DESIGNS.map(design => <button key={design.id} data-menu-design={design.id} aria-pressed={menuDesign === design.id} onClick={() => setMenuDesign(design.id)}><span><strong>{design.name}</strong><small>{design.description}</small></span></button>)}</div>
        </div>
        <GraphicsSettings />
        <PerfOverlaySettings />
      </>}
      {tab === 'audio' && <>
        <MusicSettings />
        <EffectsSettings />
        <VoiceSettings />
      </>}
      {tab === 'profile' && <>
        <div className="armory-settings-group">
          <h2>Rank insignia</h2><p>The badge your rank is drawn with, previewed at your level.</p>
          <div role="group" aria-label="Rank insignia set">{rankSets().map(set => {
            const preview = rankInsignia(level.level, set.id);
            return <button key={set.id} data-set={set.id} aria-pressed={profile.rankSet === set.id} title={set.description} onClick={() => store.wearRankSet(set.id)}><RankBadge insignia={preview} size={26} /><span><strong>{set.name}</strong><small>{preview.label}</small></span></button>;
          })}</div>
        </div>
        <div className="armory-settings-group armory-encik">
          <h2>Encik</h2><p>How the range instructor talks to you.</p>
          <div role="group" aria-label="Encik tone">
            {TONES.map(tone => <button key={tone.id} data-tone={tone.id} aria-pressed={profile.encikTone === tone.id} onClick={() => store.setEncikTone(tone.id)}><span><strong>{tone.name}</strong><small>“{encikSample(tone.id)}”</small></span></button>)}
          </div>
          <small className="armory-encik-note">{profile.encikTone === 'recruit' ? 'Recorded pack, every level.' : `${encikNow.name} · ${encikNow.description}`}{profile.encikTone === 'rank' && encikNow.id !== 'recruit' ? ' Not voiced yet, so he subtitles.' : ''}</small>
        </div>
      </>}
    </div>
  </section>;
}
