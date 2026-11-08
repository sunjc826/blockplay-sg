import { requestLeave } from '../lib/navigation-guard';
import ArmoryInventory from './ArmoryInventory';
import TutorialGame from './TutorialGame';
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { AppWindow, Backpack, ArrowLeft, ChevronRight, Coins, Crosshair, Download, Gem, GraduationCap, LogOut, Map as MapIcon, MapPin, Play, Settings, Share, ShoppingBag, SquarePlus, Users, Wrench, X } from 'lucide-react';
import MatchGame from './MatchGame';
import FpsGame from './FpsGame';
import ExpeditionGame from './ExpeditionGame';
import ArmoryShop from './ArmoryShop';
import ArmorySettings from './ArmorySettings';
import { SettingsStoreContext } from './SettingsOverlay';
import RankBadge from './RankBadge';
import PlayLoading, { Skyline } from './PlayLoading';
import StartingPointPicker from './StartingPointPicker';
import { useArmory } from '../game/use-armory';
import { hasRegionGame } from '../game/region-selection';
import { progression } from '../game/progression';
import { rankInsignia } from '../game/rank-insignia';
import { REGIONS } from '../game/regions';
import { TDM_AREAS, type ArenaMatch } from '../game/arena-match';
import { defaultMatchFor, MATCH_MODES, readMatchPreference, saveMatchPreference } from '../game/match-menu';
import type { WorldZoneId } from '../game/world-zones';
import { locations } from '../data/locations';
import { navigate, ROUTE_PATHS, getBackRoute, goBack, isPlaySession, routeLabel, type Route } from '../lib/routes';
import { returnToParent, transitionTo, useShift } from '../lib/route-transition';
import { DebugMode } from '../lib/debug-mode';
import { pwa, usePwa, type PwaState } from '../lib/pwa';
import { playMenuSound, prepareMenuAudio, stopMenuHover } from '../lib/menu-audio';
import { hasMenuTheme, setMusicCue } from '../lib/music';
import { markTitleScreenSeen, needsTitleScreen, startsFromTitleScreen, titleLogoPlacement } from '../lib/title-screen';
import { useMenuDesign } from '../lib/menu-design';
import './game-menu.css';
import './next-gen-menu.css';

type Screen = Exclude<Route, 'debug' | 'faction-designs'>;

const SOUNDING_CONTROL = 'button:not(:disabled), a[href]';
/** The menu's sounds on screens with no sounds of their own: any control, by delegation, so new ones need no wiring. */
const plainScreenSounds = {
  onClickCapture: (event: ReactMouseEvent) => { if ((event.target as Element).closest?.(SOUNDING_CONTROL)) playMenuSound('click'); },
  onPointerOver: (event: ReactPointerEvent) => { const button = (event.target as Element).closest?.(SOUNDING_CONTROL); if (event.pointerType === 'mouse' && button && !button.contains(event.relatedTarget as Node | null)) playMenuSound('hover'); },
};
const TRAINING_DISTRICTS = locations.filter(place => hasRegionGame(place.id));
const MATCH_DISTRICTS = locations.filter(place => TDM_AREAS.some(area => area.region === place.id));

const ENTRIES = [
  { route: 'play', icon: Play, title: 'Play', detail: 'Explore, train or play a match.', mode: true },
  { route: 'inventory', icon: Backpack, title: 'Inventory', detail: 'Your equipment and rental time', mode: false },
  { route: 'store', icon: ShoppingBag, title: 'Store', detail: 'Gear and supplies', mode: false },
  { route: 'settings', icon: Settings, title: 'Settings', detail: 'Difficulty, display and profile', mode: false },
] as const;

const NEXT_GEN_ENTRIES = [
  { route: 'single-player', icon: Play, title: 'Single Player', detail: 'Explore Singapore, train, or take on the bots.', mode: true },
  { route: 'multiplayer-menu', icon: Users, title: 'Multiplayer', detail: 'Host a match. Find your squad. Play together.', mode: true },
  { route: 'store', icon: ShoppingBag, title: 'Store', detail: 'Gear up for your next run.', mode: false },
  { route: 'inventory', icon: Backpack, title: 'Inventory', detail: 'Your equipment. Your loadout.', mode: false },
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

/** A link that changes screen in place, with a shift unless it is plain. */
function link(route: Route, plain = false) {
  return { href: ROUTE_PATHS[route], onClick: (event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    if (plain) navigate(route); else transitionTo(route);
  } };
}

function BackLink({ to, className = 'play-nav-back' }: { to: Route; className?: string }) {
  return <a className={className} href={ROUTE_PATHS[to]} onClick={event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    returnToParent(to);
  }}><ArrowLeft size={16} /><span>{routeLabel(to)}</span></a>;
}

type ActivityScreen = 'play' | 'single-player' | 'multiplayer-menu' | 'training-menu';
const SOLO_ACTIVITIES = [
  { route: 'training-menu', title: 'Training', detail: 'Practise at the range or take the tutorial.', icon: GraduationCap },
  { route: 'world', title: 'Open World', detail: `Explore ${REGIONS.length} districts with patrols and supplies.`, icon: MapIcon },
  ...MATCH_MODES.map(mode => ({ route: mode.mode, title: mode.name, detail: mode.description, format: mode.format, icon: Crosshair })),
] as const;
const ACTIVITY_MENUS = {
  play: { back: 'menu', title: 'Choose how to play', activities: [
    { route: 'single-player', title: 'Single Player', detail: 'Explore Singapore, train, or play matches with bots.', icon: Play },
    { route: 'multiplayer-menu', title: 'Multiplayer', detail: 'Host a match or join an online room.', icon: Users },
  ] },
  'single-player': { back: 'play', title: 'Single Player', activities: SOLO_ACTIVITIES },
  'multiplayer-menu': { back: 'play', title: 'Multiplayer', activities: [
    { route: 'multiplayer', title: 'Find a Room', detail: 'Browse online rooms or enter a room code.', icon: Users },
    ...MATCH_MODES.map(mode => ({ route: `host-${mode.mode}` as const, title: mode.name, detail: mode.description, format: mode.format, icon: Crosshair })),
  ] },
  'training-menu': { back: 'single-player', title: 'Training', activities: [
    { route: 'training', title: 'Live-fire range', detail: 'Practise with your equipped loadout in any district.', icon: Crosshair },
    { route: 'tutorial', title: 'Tutorial', detail: 'Learn movement and weapon controls in a guided course.', icon: GraduationCap },
  ] },
} as const;

function ActivityMenu({ screen }: { screen: ActivityScreen }) {
  const { back, title, activities } = ACTIVITY_MENUS[screen];
  const nextGen = useMenuDesign() === 'next-gen';
  const parent = nextGen && (screen === 'single-player' || screen === 'multiplayer-menu') ? 'menu' : back;
  return <div className={`game-screen activity-screen${nextGen ? ' next-gen-activity' : ''}`} {...plainScreenSounds}>
    <main className="activity-main">
      <div className="activity-navigation"><BackLink to={parent} />{nextGen && <><span className="next-gen-wordmark">blockplaySG<span>.</span></span><a className="play-nav-back" {...link('settings')}><Settings size={16} /> Settings</a></>}</div>
      <header><span className="starting-eyebrow">{nextGen ? 'SINGAPORE / OPERATIONS' : 'PLAY'}</span><h1>{title}</h1>{screen === 'multiplayer-menu' && <p>Join a room, or choose a game mode to host.</p>}{nextGen && screen === 'play' && <p>Your city. Your rules. Choose your next move.</p>}</header>
      <nav className={`activity-grid${nextGen ? ' next-gen-panels' : ''}`} aria-label={title} onKeyDown={nextGen ? panelKeys : undefined}>
        {activities.map(({ route, title, detail, icon: Icon, ...info }, index) => <a key={route} className={`activity-card${nextGen ? ' next-gen-panel' : ''}`} data-scene={panelScene(route)} {...link(route)}>
          {nextGen && <PanelArtwork route={route} index={index} />}
          <Icon size={21} aria-hidden="true" />
          <span className="activity-copy"><strong>{title}</strong><small>{detail}</small>{'format' in info && <small className="activity-format">{info.format}</small>}{nextGen && <span className="next-gen-enter" aria-hidden="true">{screen === 'play' ? 'SELECT MODE' : 'CONTINUE'} <ChevronRight size={16} /></span>}</span>
          <ChevronRight size={17} aria-hidden="true" />
        </a>)}
      </nav>
      {nextGen && <footer className="next-gen-footer"><span>BLOCKPLAY / SG</span><span className="next-gen-key-hint">ARROW KEYS TO BROWSE · ENTER TO SELECT</span><span>{String(activities.length).padStart(2, '0')} WAYS IN</span></footer>}
    </main>
  </div>;
}

/** Native links keep tab, modified clicks and touch activation; arrows are an extra shortcut. */
function panelKeys(event: React.KeyboardEvent<HTMLElement>) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('a[href]'));
  const at = items.indexOf(document.activeElement as HTMLAnchorElement);
  if (at < 0) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
  items[next]?.focus();
}

function panelScene(route: Route) {
  if (['play', 'single-player', 'world'].includes(route)) return 'city';
  if (route.includes('training') || route === 'tutorial') return 'training';
  if (['inventory', 'store', 'settings'].includes(route)) return route;
  return route.includes('hardpoint') ? 'objective' : route.includes('free-for-all') ? 'solo' : 'squad';
}

function PanelArtwork({ route, index, shared = false }: { route: Route; index: number; shared?: boolean }) {
  const scene = panelScene(route);
  const caption = scene === 'city' ? 'EXPLORE' : route === 'multiplayer' || route === 'multiplayer-menu' ? 'CONNECT' : ['squad', 'solo', 'objective'].includes(scene) ? 'COMPETE' : 'PREPARE';
  return <span className="next-gen-artwork" aria-hidden="true">
    {!shared && <span className="next-gen-image" />}
    <span className="next-gen-grid" />
    <span className="next-gen-index">{String(index + 1).padStart(2, '0')}<span> / {caption}</span></span>
    <span className="next-gen-reticle" />
  </span>;
}

function MatchDistrictPicker({ online }: { online: boolean }) {
  const [preferred] = useState(readMatchPreference);
  const initial = preferred.mode === 'team-deathmatch' ? TDM_AREAS.find(area => area.id === preferred.area)?.region : undefined;
  return <StartingPointPicker mode="team-deathmatch" initial={initial ?? TDM_AREAS[0].region} options={MATCH_DISTRICTS} back={<BackLink to={online ? 'multiplayer-menu' : 'single-player'} />}
    onDeploy={id => {
      const area = TDM_AREAS.find(area => area.region === id);
      if (!area) return;
      saveMatchPreference({ mode: 'team-deathmatch', area: area.id });
      navigate(online ? `host-${area.id}` : area.id);
    }} />;
}

const SOLO_MATCHES = {
  'dragon-courtyard': { mode: 'team-deathmatch', area: 'dragon-courtyard' },
  'smith-street': { mode: 'team-deathmatch', area: 'smith-street' },
  hardpoint: defaultMatchFor('hardpoint'),
  'free-for-all': defaultMatchFor('free-for-all'),
} satisfies Record<string, ArenaMatch>;

const SOLO_MATCH_BY_SCREEN: Partial<Record<Screen, ArenaMatch>> = SOLO_MATCHES;
const HOST_MATCH_BY_SCREEN: Partial<Record<Screen, ArenaMatch>> = {
  'host-dragon-courtyard': SOLO_MATCHES['dragon-courtyard'],
  'host-smith-street': SOLO_MATCHES['smith-street'],
  'host-hardpoint': SOLO_MATCHES.hardpoint,
  'host-free-for-all': SOLO_MATCHES['free-for-all'],
};

/**
 * The way out and the district choice for a play screen. It sits at the top of
 * the game's own start and pause card, so the game can have the whole screen.
 * The active engine guards both exits once a run has meaningful progress.
 */
function PlayNav({ value, onChoose }: { value: WorldZoneId; onChoose: () => void }) {
  return <nav className="play-nav" aria-label="Game">
    <button type="button" className="play-nav-back" onClick={() => transitionTo('menu')}><LogOut size={15} /><span>Quit to main menu</span></button>
    <button type="button" className="play-nav-district" onClick={() => requestLeave(onChoose)} aria-label={`Back to districts. Current district: ${locationName(value)}`}><MapPin size={14} aria-hidden="true" /><span>Districts</span><MapIcon size={14} aria-hidden="true" /></button>
  </nav>;
}

function ReturnLink() {
  const destination = getBackRoute();
  // A finished game cannot be resumed by returning to its URL.
  const game = isPlaySession(destination);
  return <a className="game-back context-back" href={ROUTE_PATHS[game ? 'menu' : destination]} onClick={event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); if (game) transitionTo('menu'); else goBack();
  }}><ArrowLeft size={16} /><span>{game || destination === 'menu' ? 'Main menu' : `Back to ${routeLabel(destination)}`}</span></a>;
}

/** A fresh route visit always starts at the map, including direct URLs. */
function PlaySession({ mode, initial, armory, suspended, onChoose }: { mode: 'training' | 'world'; initial: WorldZoneId; armory: ReturnType<typeof useArmory>; suspended: boolean; onChoose: (id: WorldZoneId) => void }) {
  const [start, setStart] = useState<WorldZoneId | null>(null);
  const [zone, setZone] = useState(initial);
  // The map's track runs on through loading, until the game takes over the music.
  useEffect(() => { if (!start) setMusicCue('map'); }, [start]);
  useEffect(() => () => setMusicCue(null), []);
  const back = <BackLink to={mode === 'training' ? 'training-menu' : 'single-player'} />;
  if (!start) return <StartingPointPicker mode={mode} initial={zone} options={mode === 'training' ? TRAINING_DISTRICTS : locations} back={back} onDeploy={id => { onChoose(id); setZone(id); setStart(id); }} />;
  const nav = <PlayNav value={zone} onChoose={() => setStart(null)} />;
  return <div className={`game-screen game-screen-play game-screen-${mode}`}>
    <main className="game-screen-body"><DebugMode.Provider value={false}>
      <PlayLoading mode={mode} district={locationName(start)} back={<button className="play-nav-back" onClick={() => setStart(null)}><ArrowLeft size={16} /> Districts</button>}>
        {(onLoaded, loadScreen) => mode === 'training'
          ? <FpsGame suspended={suspended} region={start} onRegionChange={setZone} profile={armory.profile} nav={nav} onLoaded={onLoaded} loadScreen={loadScreen} onReward={armory.award} onElimination={armory.awardElimination} onConsume={armory.consume} onRentalTime={armory.advanceRentalTime} onOpenShop={() => transitionTo('store')} />
          : <ExpeditionGame suspended={suspended} initialZone={start} onZoneChange={setZone} nav={nav} onLoaded={onLoaded} loadScreen={loadScreen} profile={armory.profile} onVendorPurchase={armory.buyFromVendor} onConsume={armory.consume} onRentalTime={armory.advanceRentalTime} onElimination={armory.awardElimination} onExit={() => transitionTo('menu')} onBackToDistricts={() => setStart(null)} />}
      </PlayLoading>
    </DebugMode.Provider></main>
  </div>;
}

export default function GameMenu({ screen }: { screen: Screen }) {
  const armory = useArmory();
  const [storeTour, setStoreTour] = useState(false);
  const install = usePwa();
  useEffect(() => {
    if (!['store', 'inventory', 'settings'].includes(screen)) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || (event.target instanceof Element && event.target.matches('input, select, textarea'))) return;
      const open = document.querySelector<HTMLDetailsElement>('details[open]');
      event.preventDefault();
      if (open) { open.open = false; open.querySelector('summary')?.focus(); return; }
      if (isPlaySession(getBackRoute())) transitionTo('menu'); else goBack();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [screen]);
  const [training, setTraining] = useDistrict('blockplay.menu.training', TRAINING_DISTRICTS.map(place => place.id));
  const [worldStart, setWorldStart] = useDistrict('blockplay.menu.world', locations.map(place => place.id));
  const level = progression(armory.profile.xp), insignia = rankInsignia(level.level, armory.profile.rankSet);
  // Play screens set their own cues below; their effects run first, so this only speaks for the rest.
  useEffect(() => {
    if (hasMenuTheme(screen)) setMusicCue('menu');
    else if (screen === 'team-deathmatch' || screen === 'host-team-deathmatch') setMusicCue('map');
    else if (screen === 'tutorial') setMusicCue(null);
  }, [screen]);
  useEffect(() => () => setMusicCue(null), []);

  const profile = <div className="game-profile" aria-label="Your profile">
    <span className="game-rank" style={{ color: insignia.accent }}><RankBadge insignia={insignia} size={30} /></span>
    <span className="game-rank-copy"><strong>{insignia.label}</strong><small>LV {level.level}<span className="game-profile-xp"> · {level.xp.toLocaleString()} XP</span></small></span>
    <span className="game-wallet" title="Credits"><Coins size={14} /><b>{armory.profile.credits.toLocaleString()}</b><small>CR</small></span>
    <span className="game-wallet" title="Tokens"><Gem size={14} /><b>{armory.profile.tokens.toLocaleString()}</b><small>TK</small></span>
  </div>;

  if (screen === 'tutorial') return <SettingsStoreContext.Provider value={armory}>
    <div className="game-screen game-screen-play"><main className="game-screen-body">
      <PlayLoading mode="tutorial" district="Field School" back={<BackLink to="training-menu" />}>
        {(onLoaded, loadScreen) => <TutorialGame suspended={install.updateReady} onLoaded={onLoaded} loadScreen={loadScreen}
          onStore={() => requestLeave(() => { setStoreTour(true); transitionTo('store', true); })} />}
      </PlayLoading>
    </main></div>
  </SettingsStoreContext.Provider>;

  if (screen === 'play' || screen === 'single-player' || screen === 'multiplayer-menu' || screen === 'training-menu') return <ActivityMenu screen={screen} />;
  if (screen === 'team-deathmatch' || screen === 'host-team-deathmatch') return <MatchDistrictPicker key={screen} online={screen === 'host-team-deathmatch'} />;

  const solo = SOLO_MATCH_BY_SCREEN[screen];
  const hosted = HOST_MATCH_BY_SCREEN[screen];
  const match = solo ?? hosted;
  const online = !!hosted || screen === 'multiplayer';
  if (match || online) {
    const arenaPicker = match?.mode === 'team-deathmatch';
    const parent = online ? arenaPicker ? 'host-team-deathmatch' : 'multiplayer-menu' : arenaPicker ? 'team-deathmatch' : 'single-player';
    return <SettingsStoreContext.Provider value={armory}><div {...plainScreenSounds} style={{ display: 'contents' }}>
      <MatchGame key={screen} {...(solo ? { kind: 'solo', match: solo } : { kind: 'online', match: hosted })} backLabel={arenaPicker ? 'Arenas' : routeLabel(parent)} onBack={() => returnToParent(parent)} armory={armory} suspended={install.updateReady} />
    </div></SettingsStoreContext.Provider>;
  }

  if (screen === 'training' || screen === 'world') {
    return <SettingsStoreContext.Provider value={armory}><PlaySession key={screen} mode={screen} initial={screen === 'training' ? training : worldStart} armory={armory} suspended={install.updateReady} onChoose={screen === 'training' ? setTraining : setWorldStart} /></SettingsStoreContext.Provider>;
  }

  if (screen === 'store') {
    // The store's own header row carries the way back, so the screen has no bar.
    return <div className="game-screen game-screen-store">
      <main className="game-screen-body"><DebugMode.Provider value={false}>
        <ArmoryShop store={armory} tutorial={storeTour ? { onComplete: () => setStoreTour(false), onExit: () => setStoreTour(false) } : undefined} nav={<nav className="store-nav" aria-label="Store">
          <ReturnLink />
          <h1>Store</h1>
          <a className="game-back" {...link('inventory')}>Inventory</a>
          <button className="store-tour-trigger" aria-label="Tour store" aria-pressed={storeTour} onClick={() => setStoreTour(true)}>Tour</button>
          <a className="game-back store-settings" {...link('settings')} aria-label="Settings" title="Settings"><Settings size={15} /></a>
        </nav>} />
      </DebugMode.Provider></main>
    </div>;
  }

  if (screen === 'inventory') return <div {...plainScreenSounds} className="game-screen game-screen-inventory"><main className="game-screen-body"><ArmoryInventory store={armory} nav={<nav className="store-nav" aria-label="Inventory"><ReturnLink /><h1>Inventory</h1><a className="game-back" {...link('store')}><ShoppingBag size={16} /> Store</a></nav>} /></main></div>;

  if (screen === 'settings') {
    return <div {...plainScreenSounds} className="game-screen game-screen-settings">
      <header className="game-screen-bar">
        <ReturnLink />
        <h1>Settings</h1>
        {profile}
      </header>
      <main className="game-screen-body"><ArmorySettings store={armory} /></main>
    </div>;
  }

  return <MainMenu profile={profile} install={install} />;
}

const INSTALL_HIDDEN_KEY = 'blockplay.menu.install-hidden';

/**
 * The install offer, as a card under the menu. Hidden by hand it folds down to
 * the footer's small Install button, so the way to install is never lost.
 */
function useInstallCard() {
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(INSTALL_HIDDEN_KEY) === '1'; } catch { return false; }
  });
  const hide = () => { setHidden(true); try { localStorage.setItem(INSTALL_HIDDEN_KEY, '1'); } catch { /* private window */ } };
  return [hidden, hide] as const;
}

/** Where an installed app is opened from, as far as a page can tell. */
const OPEN_APP_HINT = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
  ? <>Open it from your home screen for full screen and offline play.</>
  : <>Use <b>Open in app</b> in the address bar, or open it from your apps.</>;

function InstallCard({ install, onHide, sounds }: { install: PwaState; onHide: () => void; sounds: { onPointerEnter: (event: React.PointerEvent<HTMLElement>) => void; onFocus: (event: React.FocusEvent<HTMLElement>) => void } }) {
  const [steps, setSteps] = useState(false);
  const hide = <button type="button" className="game-install-hide" {...sounds} aria-label="Hide install offer" title="Hide" onClick={() => { playMenuSound('click'); onHide(); }}><X size={16} /></button>;
  const style = { '--i': ENTRIES.length } as React.CSSProperties;
  // A page cannot open the app it belongs to, so this one only points the way.
  if (install.openInApp) return <section className="game-install-card is-open-app" aria-label="The app is installed" style={style}>
    <span className="game-install-icon" aria-hidden="true"><AppWindow size={22} /></span>
    <span className="game-install-copy"><strong>blockplaySG is installed</strong><small>{OPEN_APP_HINT}</small></span>
    {hide}
  </section>;
  const manual = !install.canInstall;
  return <section className={`game-install-card${steps ? ' is-showing-steps' : ''}`} aria-label="Install the app" style={style}>
    <span className="game-install-icon" aria-hidden="true"><Download size={22} /></span>
    <span className="game-install-copy" aria-live="polite">
      <strong>Install blockplaySG</strong>
      {steps
        ? <small>Tap <Share size={13} aria-label="Share" /> Share, then <SquarePlus size={13} aria-hidden="true" /> <b>Add to Home Screen</b>.</small>
        : <small>Full screen from your home screen. Districts you have opened play offline.</small>}
    </span>
    <button type="button" className="game-install-go" {...sounds} aria-expanded={manual ? steps : undefined} onClick={() => {
      playMenuSound('click');
      if (manual) setSteps(open => !open);
      else void pwa.install();
    }}>{manual && steps ? 'Got it' : 'Install'}</button>
    {hide}
  </section>;
}

/** Matches the logo's slide in game-menu.css. */
const TITLE_LEAVE_MS = 900;

function MainMenu({ profile, install }: { profile: React.ReactNode; install: PwaState }) {
  const nextGen = useMenuDesign() === 'next-gen';
  const entries = nextGen ? NEXT_GEN_ENTRIES : ENTRIES;
  const [installExpanded, setInstallExpanded] = useState(false);
  const installButton = useRef<HTMLButtonElement>(null);
  const [installHidden, hideInstall] = useInstallCard();
  const installable = install.canInstall || install.manualInstall || install.openInApp;
  const items = useRef<(HTMLAnchorElement | null)[]>([]);
  const [chosen, setChosen] = useState<number | null>(null);
  // Back from another screen the whole menu shifts in, so its entries do not rise in as well.
  const shift = useShift();
  const [arriving] = useState(() => shift?.phase === 'entering');
  const [ripple, setRipple] = useState<{ index: number; x: number; y: number; key: number } | null>(null);
  const [title, setTitle] = useState<'shown' | 'leaving' | 'gone'>(() => needsTitleScreen() ? 'shown' : 'gone');
  const brand = useRef<HTMLSpanElement>(null);
  const [titleTap] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false);
  // Measured with the logo at its natural place, so the slide ends exactly where the header puts it.
  useLayoutEffect(() => {
    if (title !== 'shown') return;
    const node = brand.current;
    const place = () => {
      if (!node) return;
      node.style.transform = 'none';
      const { left, top, width, height } = node.getBoundingClientRect();
      node.style.removeProperty('transform');
      const { x, y, scale } = titleLogoPlacement({ left, top, width, height }, { width: window.innerWidth, height: window.innerHeight });
      node.style.setProperty('--title-x', `${x}px`);
      node.style.setProperty('--title-y', `${y}px`);
      node.style.setProperty('--title-scale', String(scale));
    };
    place();
    // The display font can arrive after the first measure and change the logo's width.
    void document.fonts?.ready.then(place);
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [title]);
  useEffect(() => { if (title !== 'shown') markTitleScreenSeen(); }, [title]);
  useEffect(() => {
    if (title === 'gone') return;
    if (title === 'leaving') {
      const timer = setTimeout(() => setTitle('gone'), TITLE_LEAVE_MS);
      return () => clearTimeout(timer);
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!startsFromTitleScreen(event)) return;
      // Later listeners on the window still run, so this gesture starts the music, but the menu's arrow keys do not.
      event.stopPropagation();
      event.preventDefault();
      leaveTitle();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [title]);
  const leaveTitle = () => {
    playMenuSound('click');
    setTitle(current => current === 'shown' ? 'leaving' : current);
  };
  useEffect(() => {
    prepareMenuAudio();
    document.addEventListener('visibilitychange', stopMenuHover);
    return () => { stopMenuHover(); document.removeEventListener('visibilitychange', stopMenuHover); };
  }, []);
  const hover = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && chosen === null && !shift) playMenuSound('hover');
  };
  const focus = (event: React.FocusEvent<HTMLElement>) => {
    if (event.currentTarget.matches(':focus-visible') && chosen === null && !shift) playMenuSound('hover');
  };
  // Nothing is chosen until the player picks; the arrow keys then move through
  // the entries the way a console menu would, starting from either end
  // (left and right too, for the row of tiles).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((!event.key.startsWith('Arrow') && !(nextGen && ['Home', 'End'].includes(event.key))) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const at = items.current.findIndex(item => item === document.activeElement);
      // Header and install controls keep their native keyboard behavior.
      if (nextGen && at < 0 && document.activeElement?.closest('a,button,input,select,textarea')) return;
      event.preventDefault();
      const down = event.key === 'ArrowDown' || event.key === 'ArrowRight';
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : at < 0 ? (down ? 0 : entries.length - 1) : (at + (down ? 1 : -1) + entries.length) % entries.length;
      items.current[next]?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nextGen, entries]);
  const press = (index: number, event: React.PointerEvent<HTMLAnchorElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setRipple({ index, x: event.clientX - box.left, y: event.clientY - box.top, key: event.timeStamp });
  };
  const choose = (index: number, event: React.MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    const entry = entries[index];
    if (!transitionTo(entry.route)) return;
    playMenuSound('click');
    setChosen(index);
    try { navigator.vibrate?.(12); } catch { /* not allowed here */ }
  };

  const item = (index: number) => {
    const entry = entries[index];
    return <a key={entry.route} ref={node => { items.current[index] = node; }} href={ROUTE_PATHS[entry.route]}
      className={`game-menu-item${entry.mode ? '' : ' is-tile'}${chosen === index ? ' is-chosen' : ''}${nextGen ? ' next-gen-panel' : ''}`} data-scene={panelScene(entry.route)} style={{ '--i': index } as React.CSSProperties}
      onPointerEnter={hover} onFocus={focus}
      onPointerDown={event => press(index, event)} onClick={event => choose(index, event)}>
      {nextGen && <PanelArtwork route={entry.route} index={index} shared />}
      {ripple?.index === index && <span key={ripple.key} className="game-menu-ripple" style={{ left: ripple.x, top: ripple.y }} onAnimationEnd={() => setRipple(null)} />}
      <entry.icon size={entry.mode ? 26 : 20} />
      <span className="game-menu-copy"><strong>{entry.title}</strong><small>{entry.detail}</small>{nextGen && <span className="next-gen-enter" aria-hidden="true">{entry.mode ? 'LET’S PLAY' : 'OPEN'} <ChevronRight size={16} /></span>}</span>
      {entry.mode && <ChevronRight className="game-menu-go" size={20} aria-hidden="true" />}
    </a>;
  };

  return <div className={`game-menu${arriving ? ' is-arriving' : ''}${title === 'gone' ? '' : ` is-title-${title}`}${nextGen ? ' next-gen-main' : ''}`}>
    {nextGen && <div className="next-gen-panorama" aria-hidden="true" />}
    <Skyline />
    {title !== 'gone' && <button type="button" className="game-title" autoFocus aria-label={titleTap ? 'Tap to start' : 'Press any key to start'} onClick={leaveTitle}>
      <span className="game-title-prompt" aria-hidden="true">{titleTap ? 'TAP TO START' : 'PRESS ANY KEY'}</span>
    </button>}
    <header className="game-menu-top">
      <span ref={brand} className="brand game-brand"><span className="brand-mark"><span /><span /><span /></span>blockplaySG<span className="brand-dot">.</span></span>
      {nextGen ? <div className="next-gen-account">{profile}<a className="next-gen-settings" {...link('settings')} aria-label="Settings" title="Settings" onPointerEnter={hover} onFocus={focus} onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        playMenuSound('click'); link('settings').onClick(event);
      }}><Settings size={20} aria-hidden="true" /></a></div> : profile}
    </header>

    <main className="game-menu-main">
      {nextGen ? <>
        <h1 className="next-gen-home-heading">Main menu</h1>
        <nav className="game-menu-list next-gen-home-panels" aria-label="Main menu">
          {item(0)}{item(1)}
          <div className="next-gen-equipment" role="group" aria-label="Equipment">{item(2)}{item(3)}</div>
        </nav>
        {installable && installExpanded && <InstallCard install={install} onHide={() => { setInstallExpanded(false); installButton.current?.focus(); }} sounds={{ onPointerEnter: hover, onFocus: focus }} />}
      </> : <>
        <div className="game-menu-title"><span>1° N, 103° E · SINGAPORE</span><h1>Your neighbourhood.<br /><em>Your playground.</em></h1></div>
        <nav className="game-menu-list" aria-label="Main menu">
          <div className="game-menu-modes">{ENTRIES.map((entry, index) => entry.mode && item(index))}</div>
          <div className="game-menu-more">{ENTRIES.map((entry, index) => !entry.mode && item(index))}</div>
          {installable && !installHidden && <InstallCard install={install} onHide={hideInstall} sounds={{ onPointerEnter: hover, onFocus: focus }} />}
        </nav>
      </>}
    </main>

    <footer className="game-menu-foot">
      <a className="game-debug-link" {...link('debug', true)} onPointerEnter={hover} onFocus={focus} onClick={event => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        playMenuSound('click'); link('debug', true).onClick(event);
      }}><Wrench size={13} /> Debug</a>
      {!nextGen && <span className="game-menu-hint"><kbd>↑</kbd><kbd>↓</kbd> choose · <kbd>Enter</kbd> select</span>}
      <span className="game-menu-edition">
        {nextGen && installable ? <button ref={installButton} className="game-install next-gen-install" aria-expanded={install.canInstall ? undefined : installExpanded} onPointerEnter={hover} onFocus={focus} onClick={() => {
          playMenuSound('click');
          if (install.canInstall) void pwa.install(); else setInstallExpanded(open => !open);
        }}><Download size={13} /> {install.openInApp ? 'App info' : 'Install'}</button> : install.canInstall && installHidden && <button className="game-install" onPointerEnter={hover} onFocus={focus} onClick={() => { playMenuSound('click'); void pwa.install(); }}><Download size={13} /> Install</button>}
        {!nextGen && <span>SG / 2026 — PROTOTYPE 01</span>}
      </span>
    </footer>
  </div>;
}
