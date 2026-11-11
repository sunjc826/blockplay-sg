import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Box, Crosshair, Download, Globe2, MapPin, PanelLeft, Users, X } from 'lucide-react';
import StreetView from './components/StreetView';
import LevelReview from './components/LevelReview';
import MarinaGame from './components/MarinaGame';
import FpsGame from './components/FpsGame';
import ExpeditionGame from './components/ExpeditionGame';
import LanLobby from './components/LanLobby';
import type { WorldZoneId } from './game/world-zones';
import { getFpsDistrict } from './game/fps-districts';
import type { LanSession } from './game/lan-peer';
import ArmoryShop from './components/ArmoryShop';
import ArmorySettings from './components/ArmorySettings';
import { useArmory } from './game/use-armory';
import RegionGame from './components/RegionGame';
import SingaporeMap from './components/SingaporeMap';
import { hasRegionGame } from './game/region-selection';
import { locations, type Location } from './data/locations';
import { REGIONS } from './game/regions';
import { IS_STATIC_SITE, HAS_LAN_SERVER } from './lib/deployment';
import { pwa, usePwa } from './lib/pwa';
import { DEBUG_WORKSPACE_KEY, debugWorkspaceUrl, readDebugWorkspace, type DebugTool, type DebugWorkspace } from './lib/debug-workspace';
import { requestLeave } from './lib/navigation-guard';
import { useModalFocus } from './lib/use-modal-focus';
import './debug-workspace.css';

export default function DebugApp() {
  const [workspace, setWorkspace] = useState(() => { let saved: string | null = null; try { saved = localStorage.getItem(DEBUG_WORKSPACE_KEY); } catch { /* Preferences are optional. */ } return readDebugWorkspace(window.location.search, saved); });
  const { tool, asset: assetId } = workspace;
  const location = locations.find(place => place.id === workspace.district)!;
  const reviewOpen = tool === 'maps' || tool === 'models', expeditionOpen = tool === 'world', fpsOpen = tool === 'fps';
  const [navOpen, setNavOpen] = useState(false), [focus, setFocus] = useState(() => { try { return localStorage.getItem('blockplay.debug.focus') === 'true'; } catch { return false; } });
  const [districtSearch, setDistrictSearch] = useState('');
  const [expeditionStart, setExpeditionStart] = useState<WorldZoneId>(workspace.district);
  const [destination, setDestination] = useState<WorldZoneId | undefined>();
  const [arena, setArena] = useState<{ session: LanSession; botCount: number; composition: string } | undefined>();
  const lanSession = useRef<LanSession | null>(null), navigationButton = useRef<HTMLButtonElement>(null);
  useEffect(() => () => { lanSession.current?.close(); }, []);
  const armory = useArmory();
  const [dialog, setDialog] = useState<'about' | 'privacy' | 'terms' | null>(null);
  const modal = useRef<HTMLDialogElement>(null);
  useModalFocus(modal, !!dialog, () => setDialog(null));
  const install = usePwa();
  useEffect(() => { try { localStorage.setItem(DEBUG_WORKSPACE_KEY, JSON.stringify(workspace)); } catch { /* Core tools still work without preferences. */ } }, [workspace]);
  const closeNav = () => { if (navOpen) { setNavOpen(false); navigationButton.current?.focus(); } };
  const applyWorkspace = (next: DebugWorkspace) => {
    if (next.tool !== tool || next.district !== workspace.district) { lanSession.current?.close(); lanSession.current = null; setArena(undefined); }
    if (next.tool === 'world' && tool !== 'world') { setExpeditionStart(next.district); setDestination(undefined); }
    window.history.replaceState(window.history.state, '', debugWorkspaceUrl(next, window.location.search) + window.location.hash);
    setWorkspace(next); closeNav();
  };
  const changeWorkspace = (next: DebugWorkspace) => {
    if (JSON.stringify(next) === JSON.stringify(workspace)) { closeNav(); return; }
    requestLeave(() => applyWorkspace(next));
  };
  const chooseLocation = (next: Location) => { if (expeditionOpen) { setDestination(next.id); closeNav(); return; } changeWorkspace({ ...workspace, district: next.id }); };
  const openTool = (next: DebugTool) => changeWorkspace({ ...workspace, tool: next });
  const openFps = () => openTool('fps'), openLobby = () => openTool('arena');
  const launchArena = (session: LanSession, bots: number, squad: 'mixed' | 'assault' | 'tank' | 'sniper' | 'heavy') => {
    lanSession.current?.close(); lanSession.current = session; setArena({ session, botCount: bots, composition: squad });
    setWorkspace(current => ({ ...current, tool: 'fps', district: 'marina-bay' })); closeNav();
  };
  const tools = [
    { id: 'maps', label: 'Level review', detail: 'Layouts & discussions', icon: MapPin },
    { id: 'models', label: '3D model review', detail: 'Surfaces & design intent', icon: Box },
    { id: 'walk', label: 'Walk / drive', detail: 'Explore the selected district', icon: Globe2 },
    { id: 'fps', label: 'FPS playtest', detail: 'Weapons, targets & vehicles', icon: Crosshair },
    { id: 'world', label: 'Open world', detail: `${REGIONS.length} connected districts`, icon: Globe2 },
    { id: 'arena', label: HAS_LAN_SERVER ? 'LAN arena' : 'Solo arena', detail: HAS_LAN_SERVER ? 'Local multiplayer & bots' : 'Practice against bots', icon: Users },
    { id: 'armory', label: 'Equipment', detail: 'Loadout & progression', icon: Box },
    { id: 'street', label: 'Street View', detail: IS_STATIC_SITE ? 'Unavailable in this build' : 'Real-world reference', icon: MapPin },
  ] as const;
  const activeTool = tools.find(item => item.id === (arena ? 'arena' : tool))!;
  const districts = locations.filter(item => `${item.name} ${item.district}`.toLowerCase().includes(districtSearch.toLowerCase()));

  return <div className={`app-shell debug-shell ${focus ? 'debug-focus' : ''}`} data-debug-tool={tool} onKeyDown={e => { if (e.key === 'Escape' && navOpen) closeNav(); }}>
    <a className="debug-skip" href="#debug-experience">Skip to workspace</a>
    <header className="debug-header">
      <a className="debug-brand" href="/" onClick={e => { e.preventDefault(); requestLeave(() => window.location.assign('/')); }} aria-label="blockplaySG game menu">blockplaySG<span>.</span></a>
      <div className="debug-heading"><h1>Debug workspace</h1><span>{activeTool.label}</span></div>
      <div className="debug-header-actions">
        {install.canInstall && <button onClick={() => { void pwa.install(); }} aria-label="Install app"><Download size={17} /></button>}
        <button className="debug-focus-button" aria-pressed={focus} onClick={() => { setFocus(!focus); try { localStorage.setItem('blockplay.debug.focus', String(!focus)); } catch { /* Optional. */ } }}><PanelLeft size={17} /><span>{focus ? 'Show tools' : 'Focus workspace'}</span></button>
        <button ref={navigationButton} className="debug-mobile-menu" aria-expanded={navOpen} aria-controls="debug-navigation" onClick={() => setNavOpen(!navOpen)}><PanelLeft size={18} />Tools</button>
        <a className="debug-game-link" href="/" onClick={e => { e.preventDefault(); requestLeave(() => window.location.assign('/')); }}>Play <ArrowUpRight size={15} /></a>
      </div>
    </header>
    <main className="debug-main">
      <section className="workspace" aria-label="Debug workspace">
        <aside id="debug-navigation" className={`sidebar debug-navigation ${navOpen ? 'is-open' : ''}`} onKeyDown={e => { if (e.key === 'Escape') closeNav(); }}>
          <div className="debug-nav-heading"><span>WORKSPACE TOOLS</span><button className="debug-mobile-close" onClick={closeNav} aria-label="Close tools"><X size={16} /></button></div>
          <nav className="mode-list" aria-label="Debug tools">{tools.map(({ id, label, detail, icon: Icon }, i) => <button key={id} disabled={id === 'street' && IS_STATIC_SITE} className={`mode-card ${(arena ? id === 'arena' : tool === id) ? 'selected' : ''} ${i === 2 ? 'debug-tool-divider' : ''}`} aria-pressed={(arena ? id === 'arena' : tool === id)} onClick={() => openTool(id)}><Icon size={17} /><span><strong>{label}</strong><small>{detail}</small></span></button>)}</nav>
          {tool !== 'models' && <details className="debug-district-search"><summary>Find a district <span>{locations.length}</span></summary><label>Search districts<input type="search" value={districtSearch} onChange={e => setDistrictSearch(e.target.value)} placeholder="Name or area…" /></label><div className="debug-district-results">{districts.map(item => <button key={item.id} aria-pressed={location.id === item.id} onClick={() => chooseLocation(item)}>{item.name}</button>)}{!districts.length && <p>No matching districts.</p>}</div></details>}
          {tool !== 'models' && <details className="debug-overview"><summary>Island overview</summary><SingaporeMap selected={location} onSelect={chooseLocation} expedition={expeditionOpen} destination={destination} /></details>}
          <details className="debug-resources"><summary>Design galleries & help</summary><a href="/prop-designs" onClick={e => { e.preventDefault(); requestLeave(() => window.location.assign('/prop-designs')); }}>Street props ↗</a><a href="/faction-designs?study=weapons" onClick={e => { e.preventDefault(); requestLeave(() => window.location.assign('/faction-designs?study=weapons')); }}>Weapon studies ↗</a><a href="/faction-designs" onClick={e => { e.preventDefault(); requestLeave(() => window.location.assign('/faction-designs')); }}>Operator studies ↗</a><button onClick={() => setDialog('about')}>About & controls</button><button onClick={() => setDialog('privacy')}>Privacy</button><button onClick={() => setDialog('terms')}>Terms</button></details>
        </aside>
        <div className="debug-work-area">
          <div className="debug-context"><strong>{activeTool.label}</strong>{tool !== 'models' && <label>{expeditionOpen ? 'Travel to' : 'District'}<select aria-label={expeditionOpen ? 'Travel destination' : 'Review district'} value={expeditionOpen ? destination ?? location.id : location.id} onChange={e => chooseLocation(locations.find(item => item.id === e.target.value)!)}>{locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<span className="debug-context-note">{reviewOpen ? 'Design · discuss · iterate' : arena ? 'Live arena session' : 'Development tools'}</span></div>
        <div className="experience" id="debug-experience" tabIndex={-1}>

          {reviewOpen ? <LevelReview key={tool === 'models' ? assetId : location.id} district={location.id} assetId={tool === 'models' ? assetId : undefined} onAssetChange={asset => changeWorkspace({ ...workspace, asset })} onWorkspaceChange={next => openTool(next)} /> : expeditionOpen ? <ExpeditionGame initialZone={expeditionStart} destination={destination} onZoneChange={zone => setWorkspace(current => ({ ...current, district: zone }))} profile={armory.profile} onVendorPurchase={armory.buyFromVendor} onConsume={armory.consume} onRentalTime={armory.advanceRentalTime} onElimination={armory.awardElimination} onExit={openFps} suspended={dialog !== null || install.updateReady || navOpen} /> : tool === 'arena' ? <LanLobby onLaunch={launchArena} onBack={openFps} /> : tool === 'armory' ? <><ArmoryShop store={armory} rangeLabel={getFpsDistrict(location.id).label} onEnterRange={openFps} /><ArmorySettings store={armory} /></> : fpsOpen ? <FpsGame key={arena?.session.id || "practice"} region={location.id} onRegionChange={zone => changeWorkspace({ ...workspace, district: zone })} arena={arena} onLeaveArena={openLobby} profile={armory.profile} onReward={armory.award} onElimination={armory.awardElimination} onConsume={armory.consume} onRentalTime={armory.advanceRentalTime} onOpenShop={() => openTool('armory')} suspended={dialog !== null || install.updateReady || navOpen} /> : tool === 'walk' && hasRegionGame(location.id) ? (location.id === 'marina-bay' ? <MarinaGame key={location.id} /> : <RegionGame key={location.id} region={location.id} />) : <>
          <div className="viewport"><StreetView key={location.id} location={location} /></div>
          <div className="experience-toolbar"><div className="experience-title"><span className="mode-icon"><Globe2 size={22} /></span><div><h3>The real {location.name}</h3><p>Google Street View · Drag to look, use arrows to travel</p></div></div></div>
          </>}
        </div>
        </div>
      </section>
    </main>

    {dialog && <div className="modal-backdrop" onClick={() => setDialog(null)}><dialog ref={modal} open aria-modal="true" aria-labelledby="dialog-title" onCancel={() => setDialog(null)} onClick={event => event.stopPropagation()}><button autoFocus className="icon-button modal-close" aria-label="Close dialog" onClick={() => setDialog(null)}><X size={20} /></button>
      <span className="eyebrow">blockplaySG / SINGAPORE</span><h2 id="dialog-title">{dialog === 'about' ? 'The whole island deserves to be playable.' : dialog === 'privacy' ? 'Privacy' : 'Prototype terms'}</h2>
      {dialog === 'about' ? <><p>Singapore is more than its postcards. blockplaySG explores the places we know through playable 3D scenes.</p><p>Twenty-three districts are walkable and driveable: a waterfront with gardens and landmarks, a city core of towers and riverfront streets, a heritage estate with an elevated station, shophouse lanes under lanterns, a domed mosque above a palm mall, a garden lake with a pagoda across a causeway, a glazed dome with water falling through it, an eating strip in front of a reservoir, a town built around its waterway, a cruise quay under a cable line, a resort island reached by one boardwalk, terraces down close-set numbered lanes, a tank farm and dry dock where the island runs out, a causeway north across the strait, a round market beside a community hub, a mosaic dragon over its sand pit, a forested ridge with an old rail line beneath it, a canal let out into a meandering river, a shopping boulevard under rain trees, Yishun’s market, elevated MRT and pond park, Little India’s market and painted lanes, Katong/Joo Chiat’s pastel terraces and sheltered five-foot ways, and Pulau Ubin’s village jetty, quarry and wetland boardwalk. Geography is compressed and authored, not reconstructed or surveyed. Reviewed photographs inform selected landmark and streetscape features in the original nineteen districts. Marina Bay’s hotel atrium also draws on published architectural photographs. Yishun, Little India, Katong/Joo Chiat and Pulau Ubin are later schematic additions. Yishun’s exaggerated high-threat combat preset is a fictional joke. The September 2026 pass corrects misleading landmarks and sectors; many connecting streets remain schematic.</p><p>Collect each region’s orange stamps on foot or in the car. Live Street View remains available separately. Luna powers Marina’s optional Change the adventure companion, with GPT-Live-1 for voice. Educational text/voice guides in Marina Bay, Raffles Place and Queenstown offer source-linked facts and reflection questions without changing your progress; the twenty later districts have no reviewed learning cards yet, so they show no guide. Objective changes remain Marina-only. Movement, collisions and stamp collection stay local; exploring alone makes no model calls.</p><p>blockplaySG installs as an app: use <strong>Install</strong> in the header, or Share → Add to Home Screen on iPhone. An installed copy keeps the game itself on your device, so districts you have already opened still play without a network; the optional companion needs one.</p><p>Each region’s FPS mode adds a target exercise, an equipment shop, XP progression and driveable/flyable vehicles on its selected map. FPS and vehicle sessions support immersive fullscreen, with an expanded-view fallback when fullscreen is unavailable. No live map or model requests are made during FPS play. On a touchscreen every 3D mode draws twin thumb sticks and on-screen actions over the scene; the left stick is analog and the trigger can be held and slid to keep aiming.</p></> : dialog === 'privacy' ? <><p>This prototype has no user accounts or analytics. Connected level review boards use private Cloudflare storage. Stamps and conversation history stay in memory and reset when you reset the region, leave its game mode, switch regions, or reload. Switching between Walk and Drive within a region preserves stamps. Map and 3D model review pins and comment threads are cached in browser local storage. Connecting a private cloud review board uploads and syncs these threads to Cloudflare; anyone with its collaboration link can read and edit them. Disconnecting leaves both the cloud history and browser copy intact. Exported review files can also be shared manually, and published developer notes ship with the app. Your demo armory wallet, XP, permanent unlocks and equipped loadout are saved in this browser’s local storage. Clearing site data removes them. Installing the app, or simply visiting it, stores the game’s own files — code, scenes, models and voice lines — in a browser cache so it opens offline; that cache holds no game progress and is cleared with site data or by uninstalling. There are no real payments or account synchronization. Using Marina’s companion sends your request and game-state snapshot to OpenAI. Starting the microphone sends audio to OpenAI and plays an AI-generated voice; Stop ends the session. The app does not save microphone recordings or conversation history to a database.</p><p>Each region builds its game geometry locally in your browser. Live Street View connects your browser to Google, which processes connection and usage data under its <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>. Your hosting provider may also retain standard access logs.</p></> : <><p>blockplaySG is an experimental hackathon prototype, provided as available. Its game maps are stylized interpretations with approximate or fictional layouts, not navigation tools. Marina FPS has no affiliation to the Singapore Armed Forces.</p><p>The owner confirmed permission for the saved imagery used as reference and in the earlier depth experiment; its source credits are preserved with those assets. The separate live Street View mode uses Google's official viewer. Google Maps features are also subject to <a href="https://www.google.com/help/terms_maps/" target="_blank" rel="noreferrer">Google Maps / Google Earth Additional Terms of Service</a> and the <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.</p></>}
    </dialog></div>}
  </div>;
}
