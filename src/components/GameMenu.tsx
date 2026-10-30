import TutorialGame from './TutorialGame';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Coins, Crosshair, Download, Gem, GraduationCap, Map as MapIcon, MapPin, Settings, ShoppingBag, Users, Wrench } from 'lucide-react';
import MultiplayerGame from './MultiplayerGame';
import FpsGame from './FpsGame';
import ExpeditionGame from './ExpeditionGame';
import ArmoryShop from './ArmoryShop';
import ArmorySettings from './ArmorySettings';
import RankBadge from './RankBadge';
import PlayLoading, { Skyline } from './PlayLoading';
import { useArmory } from '../game/use-armory';
import { hasRegionGame } from '../game/region-selection';
import { progression } from '../game/progression';
import { rankInsignia } from '../game/rank-insignia';
import { REGIONS } from '../game/regions';
import type { WorldZoneId } from '../game/world-zones';
import { locations } from '../data/locations';
import { navigate, ROUTE_PATHS, type Route } from '../lib/routes';
import { transitionTo, useWipe } from '../lib/route-transition';
import { DebugMode } from '../lib/debug-mode';
import { pwa, usePwa } from '../lib/pwa';
import './game-menu.css';

type Screen = Exclude<Route, 'debug'>;

const TRAINING_DISTRICTS = locations.filter(place => hasRegionGame(place.id));

// The three ways to play lead; the rest sit in a row of tiles beneath, so
// the whole menu fits one screen without scrolling.
const ENTRIES = [
  { route: 'training', icon: Crosshair, title: 'Training', detail: 'Live-fire range in any district.', mode: true },
  { route: 'world', icon: MapIcon, title: 'Open World', detail: `${REGIONS.length} districts, patrols and supplies.`, mode: true },
  { route: 'multiplayer', icon: Users, title: 'Multiplayer', detail: 'Public rooms, or invite your friends.', mode: true },
  { route: 'tutorial', icon: GraduationCap, title: 'Tutorial', detail: 'New here?', mode: false },
  { route: 'store', icon: ShoppingBag, title: 'Store', detail: 'Gear and supplies', mode: false },
  { route: 'settings', icon: Settings, title: 'Settings', detail: 'Rank and voice', mode: false },
] as const;

/** Remembers the last district picked on each screen; storage may be unavailable. */
function useDistrict(key: string, allowed: readonly string[]) {
  const [id, setId] = useState<WorldZoneId>(() => {
    try { const saved = localStorage.getItem(key); if (saved && allowed.includes(saved)) return saved as WorldZoneId; } catch { /* private window */ }
    return 'marina-bay';
  });
  const choose = (next: WorldZoneId) => { setId(next); try { localStorage.setItem(key, next); } catch { /* private window */ } };
  return [id, choose] as const;
}

const locationName = (id: WorldZoneId) => locations.find(place => place.id === id)?.name ?? id;

/** A link that changes screen in place; with a label it goes behind the wipe. */
function link(route: Route, label?: string) {
  return { href: ROUTE_PATHS[route], onClick: (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    if (label) transitionTo(route, label); else navigate(route);
  } };
}

/**
 * The way out and the district choice for a play screen. It sits at the top of
 * the game's own start and pause card, so the game can have the whole screen.
 */
function PlayNav({ value, options, onChange }: { value: WorldZoneId; options: readonly { id: WorldZoneId; name: string }[]; onChange: (id: WorldZoneId) => void }) {
  return <nav className="play-nav" aria-label="Game">
    <a className="play-nav-back" {...link('menu', 'Menu')}><ArrowLeft size={16} /><span>Menu</span></a>
    <label className="play-nav-district"><MapPin size={14} aria-hidden="true" />
      <select aria-label="District" value={value} onChange={event => onChange(event.target.value as WorldZoneId)}>
        {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
    </label>
  </nav>;
}

export default function GameMenu({ screen }: { screen: Screen }) {
  const armory = useArmory();
  const [storeTour, setStoreTour] = useState(false);
  const install = usePwa();
  const [training, setTraining] = useDistrict('blockplay.menu.training', TRAINING_DISTRICTS.map(place => place.id));
  const [worldStart, setWorldStart] = useDistrict('blockplay.menu.world', locations.map(place => place.id));
  const [worldZone, setWorldZone] = useState<WorldZoneId>(worldStart);
  // Picking a district restarts the expedition there, even the one it began in.
  const [worldRun, setWorldRun] = useState(0);
  const level = progression(armory.profile.xp), insignia = rankInsignia(level.level, armory.profile.rankSet);

  const profile = <div className="game-profile" aria-label="Your profile">
    <span className="game-rank" style={{ color: insignia.accent }}><RankBadge insignia={insignia} size={30} /></span>
    <span className="game-rank-copy"><strong>{insignia.label}</strong><small>LV {level.level} · {level.xp.toLocaleString()} XP</small></span>
    <span className="game-wallet" title="Credits"><Coins size={14} /><b>{armory.profile.credits.toLocaleString()}</b><small>CR</small></span>
    <span className="game-wallet" title="Tokens"><Gem size={14} /><b>{armory.profile.tokens.toLocaleString()}</b><small>TK</small></span>
  </div>;

  if (screen === 'tutorial') return <div className="game-screen game-screen-play"><main className="game-screen-body"><TutorialGame suspended={install.updateReady} onStore={() => { setStoreTour(true); transitionTo('store', 'Store'); }} /></main></div>;

  if (screen === 'multiplayer') return <MultiplayerGame armory={armory} suspended={install.updateReady} />;

  if (screen === 'training' || screen === 'world') {
    const nav = screen === 'training'
      ? <PlayNav value={training} onChange={setTraining} options={TRAINING_DISTRICTS} />
      : <PlayNav value={worldZone} onChange={id => { setWorldStart(id); setWorldZone(id); setWorldRun(n => n + 1); }} options={locations} />;
    // Keyed with the game, so a new district gets a fresh loading screen too.
    const loadKey = screen === 'training' ? `training-${training}` : `world-${worldStart}-${worldRun}`;
    const districtName = locationName(screen === 'training' ? training : worldStart);
    return <div className={`game-screen game-screen-play game-screen-${screen}`}>
      <main className="game-screen-body"><DebugMode.Provider value={false}>
        <PlayLoading key={loadKey} mode={screen} district={districtName} back={<a className="play-nav-back" {...link('menu', 'Menu')}><ArrowLeft size={16} /><span>Menu</span></a>}>
          {onLoaded => screen === 'training'
            ? <FpsGame suspended={install.updateReady} region={training} profile={armory.profile} nav={nav} onLoaded={onLoaded} onReward={armory.award} onElimination={armory.awardElimination} onConsume={armory.consume} onOpenShop={() => transitionTo('store', 'Store')} />
            : <ExpeditionGame suspended={install.updateReady} initialZone={worldStart} onZoneChange={setWorldZone} nav={nav} onLoaded={onLoaded} profile={armory.profile} onVendorPurchase={armory.buyFromVendor} onConsume={armory.consume} onElimination={armory.awardElimination} onExit={() => transitionTo('menu', 'Menu')} />}
        </PlayLoading>
      </DebugMode.Provider></main>
    </div>;
  }

  if (screen === 'store') {
    // The store's own header row carries the way back, so the screen has no bar.
    return <div className="game-screen game-screen-store">
      <main className="game-screen-body"><DebugMode.Provider value={false}>
        <ArmoryShop store={armory} tutorial={storeTour ? { onComplete: () => setStoreTour(false), onExit: () => setStoreTour(false) } : undefined} nav={<nav className="store-nav" aria-label="Store">
          <a className="game-back" {...link('menu', 'Menu')} aria-label="Menu"><ArrowLeft size={16} /><span>Menu</span></a>
          <h1>Store</h1>
          {!storeTour && <button className="store-tour-trigger" onClick={() => setStoreTour(true)}>Tour store</button>}
          <a className="game-back store-settings" {...link('settings', 'Settings')} aria-label="Settings" title="Settings"><Settings size={15} /></a>
        </nav>} deployments={[
          { id: 'training', label: 'Training', detail: locationName(training), onDeploy: () => transitionTo('training', locationName(training), 'TRAINING') },
          { id: 'world', label: 'Open World', detail: locationName(worldStart), onDeploy: () => transitionTo('world', locationName(worldStart), 'OPEN WORLD') },
        ]} />
      </DebugMode.Provider></main>
    </div>;
  }

  if (screen === 'settings') {
    return <div className="game-screen game-screen-settings">
      <header className="game-screen-bar">
        <a className="game-back" {...link('menu', 'Menu')}><ArrowLeft size={16} /><span>Menu</span></a>
        <h1>Settings</h1>
        {profile}
      </header>
      <main className="game-screen-body"><ArmorySettings store={armory} /></main>
    </div>;
  }

  return <MainMenu profile={profile} install={install.canInstall} districts={{ training: locationName(training), world: locationName(worldStart) }} />;
}

function MainMenu({ profile, install, districts }: { profile: React.ReactNode; install: boolean; districts: Partial<Record<Route, string>> }) {
  const items = useRef<(HTMLAnchorElement | null)[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  // Back from another screen, the wipe is still clearing: hold the entrance for it.
  const wipe = useWipe();
  const [arriving] = useState(() => wipe?.phase === 'reveal');
  const [ripple, setRipple] = useState<{ index: number; x: number; y: number; key: number } | null>(null);
  // Nothing is chosen until the player picks; the arrow keys then move through
  // the entries the way a console menu would, starting from either end
  // (left and right too, for the row of tiles).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.key.startsWith('Arrow') || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      const at = items.current.findIndex(item => item === document.activeElement);
      const down = event.key === 'ArrowDown' || event.key === 'ArrowRight';
      const next = at < 0 ? (down ? 0 : ENTRIES.length - 1) : (at + (down ? 1 : -1) + ENTRIES.length) % ENTRIES.length;
      items.current[next]?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const press = (index: number, event: React.PointerEvent<HTMLAnchorElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setRipple({ index, x: event.clientX - box.left, y: event.clientY - box.top, key: event.timeStamp });
  };
  const choose = (index: number, event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    const entry = ENTRIES[index];
    if (!transitionTo(entry.route, entry.title, districts[entry.route]?.toUpperCase())) return;
    setChosen(index);
    try { navigator.vibrate?.(12); } catch { /* not allowed here */ }
  };

  const item = (index: number) => {
    const entry = ENTRIES[index];
    return <a key={entry.route} ref={node => { items.current[index] = node; }} href={ROUTE_PATHS[entry.route]}
      className={`game-menu-item${entry.mode ? '' : ' is-tile'}${chosen === index ? ' is-chosen' : ''}`} style={{ '--i': index } as React.CSSProperties}
      onPointerDown={event => press(index, event)} onClick={event => choose(index, event)}>
      {ripple?.index === index && <span key={ripple.key} className="game-menu-ripple" style={{ left: ripple.x, top: ripple.y }} onAnimationEnd={() => setRipple(null)} />}
      {entry.mode && <span className="game-menu-index">0{index + 1}</span>}
      <entry.icon size={entry.mode ? 26 : 20} />
      <span className="game-menu-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></span>
      {entry.mode && <ChevronRight className="game-menu-go" size={20} aria-hidden="true" />}
    </a>;
  };

  return <div className={`game-menu${chosen === null ? '' : ' is-leaving'}${arriving ? ' is-arriving' : ''}`}>
    <Skyline />
    <header className="game-menu-top">
      <span className="brand game-brand"><span className="brand-mark"><span /><span /><span /></span>blockplaySG<span className="brand-dot">.</span></span>
      {profile}
    </header>

    <main className="game-menu-main">
      <div className="game-menu-title"><span>1° N, 103° E · SINGAPORE</span><h1>Your neighbourhood.<br /><em>Your playground.</em></h1></div>
      <nav className="game-menu-list" aria-label="Main menu">
        <div className="game-menu-modes">{ENTRIES.map((entry, index) => entry.mode && item(index))}</div>
        <div className="game-menu-more">{ENTRIES.map((entry, index) => !entry.mode && item(index))}</div>
      </nav>
    </main>

    <footer className="game-menu-foot">
      <a className="game-debug-link" {...link('debug')}><Wrench size={13} /> Debug</a>
      <span className="game-menu-hint"><kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> select</span>
      <span className="game-menu-edition">
        {install && <button className="game-install" onClick={() => { void pwa.install(); }}><Download size={13} /> Install</button>}
        <span>SG / 2026 — PROTOTYPE 01</span>
      </span>
    </footer>
  </div>;
}
