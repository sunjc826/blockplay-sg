import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, Coins, Crosshair, Download, Gem, Map as MapIcon, MapPin, RefreshCw, ShoppingBag, Wrench } from 'lucide-react';
import FpsGame from './FpsGame';
import ExpeditionGame from './ExpeditionGame';
import ArmoryShop from './ArmoryShop';
import RankBadge from './RankBadge';
import { useArmory } from '../game/use-armory';
import { getFpsDistrict } from '../game/fps-districts';
import { hasRegionGame } from '../game/region-selection';
import { progression } from '../game/progression';
import { rankInsignia } from '../game/rank-insignia';
import { REGIONS } from '../game/regions';
import type { WorldZoneId } from '../game/world-zones';
import { locations } from '../data/locations';
import { navigate, ROUTE_PATHS, type Route } from '../lib/routes';
import { DebugMode } from '../lib/debug-mode';
import { pwa, usePwa } from '../lib/pwa';
import './game-menu.css';

type Screen = Exclude<Route, 'debug'>;

const TRAINING_DISTRICTS = locations.filter(place => hasRegionGame(place.id));

const ENTRIES = [
  { route: 'training', icon: Crosshair, title: 'Training', detail: 'Live-fire range in any district. Earn credits and XP.' },
  { route: 'world', icon: MapIcon, title: 'Open World', detail: `${REGIONS.length} districts, patrols and supplies. Find your way.` },
  { route: 'store', icon: ShoppingBag, title: 'Store', detail: 'Weapons, armour, supplies and vehicle paint.' },
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

function link(route: Route) {
  return { href: ROUTE_PATHS[route], onClick: (event: React.MouseEvent) => { if (event.metaKey || event.ctrlKey || event.shiftKey) return; event.preventDefault(); navigate(route); } };
}

/**
 * The way out and the district choice for a play screen. It sits at the top of
 * the game's own start and pause card, so the game can have the whole screen.
 */
function PlayNav({ value, options, onChange }: { value: WorldZoneId; options: readonly { id: WorldZoneId; name: string }[]; onChange: (id: WorldZoneId) => void }) {
  return <nav className="play-nav" aria-label="Game">
    <a className="play-nav-back" {...link('menu')}><ArrowLeft size={16} /><span>Menu</span></a>
    <label className="play-nav-district"><MapPin size={14} aria-hidden="true" />
      <select aria-label="District" value={value} onChange={event => onChange(event.target.value as WorldZoneId)}>
        {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
    </label>
  </nav>;
}

export default function GameMenu({ screen }: { screen: Screen }) {
  const armory = useArmory();
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

  const updateToast = install.updateReady && <div className="update-toast" role="status"><span>A new version is ready.</span><button onClick={() => { pwa.applyUpdate(); }}><RefreshCw size={12} /> Reload</button></div>;

  if (screen === 'training' || screen === 'world') {
    const nav = screen === 'training'
      ? <PlayNav value={training} onChange={setTraining} options={TRAINING_DISTRICTS} />
      : <PlayNav value={worldZone} onChange={id => { setWorldStart(id); setWorldZone(id); setWorldRun(n => n + 1); }} options={locations} />;
    return <div className={`game-screen game-screen-play game-screen-${screen}`}>
      <main className="game-screen-body"><DebugMode.Provider value={false}>
        {screen === 'training' && <FpsGame key={`training-${training}`} region={training} profile={armory.profile} nav={nav} onReward={armory.award} onElimination={armory.awardElimination} onConsume={armory.consume} onOpenShop={() => navigate('store')} />}
        {screen === 'world' && <ExpeditionGame key={`world-${worldStart}-${worldRun}`} initialZone={worldStart} onZoneChange={setWorldZone} nav={nav} profile={armory.profile} onVendorPurchase={armory.buyFromVendor} onConsume={armory.consume} onExit={() => navigate('menu')} />}
      </DebugMode.Provider></main>
      {updateToast}
    </div>;
  }

  if (screen === 'store') {
    return <div className="game-screen game-screen-store">
      <header className="game-screen-bar">
        <a className="game-back" {...link('menu')}><ArrowLeft size={16} /><span>Menu</span></a>
        <h1>Store</h1>
        {profile}
      </header>
      <main className="game-screen-body"><DebugMode.Provider value={false}>
        <ArmoryShop store={armory} rangeLabel={getFpsDistrict(training).label} onEnterRange={() => navigate('training')} />
      </DebugMode.Provider></main>
      {updateToast}
    </div>;
  }

  return <MainMenu profile={profile} install={install.canInstall} updateToast={updateToast} />;
}

function MainMenu({ profile, install, updateToast }: { profile: React.ReactNode; install: boolean; updateToast: React.ReactNode }) {
  const items = useRef<(HTMLAnchorElement | null)[]>([]);
  useEffect(() => { items.current[0]?.focus({ preventScroll: true }); }, []);
  // Arrow keys move through the entries the way a console menu would.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const at = items.current.findIndex(item => item === document.activeElement);
    const next = (at + (event.key === 'ArrowDown' ? 1 : -1) + ENTRIES.length) % ENTRIES.length;
    items.current[next]?.focus();
  };

  return <div className="game-menu">
    <div className="game-menu-skyline" aria-hidden="true">{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ '--h': `${18 + ((i * 37) % 53)}%`, '--w': `${2.2 + ((i * 13) % 5) * 0.6}%` } as React.CSSProperties} className={i % 9 === 4 ? 'lit' : undefined} />)}</div>
    <header className="game-menu-top">
      <span className="brand game-brand"><span className="brand-mark"><span /><span /><span /></span>blockplaySG<span className="brand-dot">.</span></span>
      {profile}
    </header>

    <main className="game-menu-main">
      <div className="game-menu-title"><span>1° N, 103° E · SINGAPORE</span><h1>Your neighbourhood.<br /><em>Your playground.</em></h1></div>
      <nav className="game-menu-list" aria-label="Main menu" onKeyDown={onKeyDown}>
        {ENTRIES.map((entry, index) => <a key={entry.route} ref={node => { items.current[index] = node; }} className="game-menu-item" {...link(entry.route)}>
          <span className="game-menu-index">0{index + 1}</span>
          <entry.icon size={26} />
          <span className="game-menu-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></span>
        </a>)}
      </nav>
    </main>

    <footer className="game-menu-foot">
      <a className="game-debug-link" {...link('debug')}><Wrench size={13} /> Debug</a>
      <span className="game-menu-hint"><kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> select</span>
      <span className="game-menu-edition">
        {install && <button className="game-install" onClick={() => { void pwa.install(); }}><Download size={13} /> Install</button>}
        SG / 2026 — PROTOTYPE 01
      </span>
    </footer>
    {updateToast}
  </div>;
}
