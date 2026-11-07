import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Crosshair, MapPin } from 'lucide-react';
import { locations, type Location } from '../data/locations';
import { getWorldZone, type WorldZoneId } from '../game/world-zones';
import { playMenuSound, prepareMenuAudio, stopMenuHover } from '../lib/menu-audio';
import { reducedMotion } from '../lib/route-transition';
import './starting-point-picker.css';

// A schematic island: downtown is expanded so its districts have useful hit
// areas. These are game regions, not administrative or surveyed boundaries.
const CENTRES: Record<WorldZoneId, readonly [number, number]> = {
  tuas: [125, 365], 'jurong-lake': [260, 310], 'bukit-timah': [365, 275],
  woodlands: [355, 155], yishun: [495, 155], 'upper-thomson': [475, 250],
  bishan: [585, 260], 'toa-payoh': [590, 335], punggol: [710, 195],
  tampines: [795, 295], changi: [910, 285], geylang: [730, 370],
  'katong-joo-chiat': [845, 400], queenstown: [380, 395], orchard: [490, 375],
  'little-india': [585, 405], 'kampong-glam': [670, 415], chinatown: [515, 460],
  'raffles-place': [610, 485], 'marina-bay': [720, 480], harbourfront: [405, 480],
  sentosa: [430, 560], 'pulau-ubin': [870, 115],
};
const COAST = 'M65 400 L83 330 125 305 160 245 218 228 250 180 290 175 315 115 360 98 408 125 450 105 510 122 550 155 605 158 650 184 705 150 755 177 795 210 858 215 915 233 950 275 965 335 930 390 870 440 810 455 770 505 720 535 665 520 620 532 570 515 515 512 470 530 420 515 370 518 340 472 285 455 250 428 190 447 145 420 102 435 Z';
const OFFSHORE: Partial<Record<WorldZoneId, string>> = {
  sentosa: 'M350 552 L395 537 435 543 478 559 501 578 475 594 430 584 390 591 354 577 Z',
  'pulau-ubin': 'M798 113 L822 87 860 91 884 78 924 94 946 116 920 139 880 141 851 130 820 138 Z',
};

/** Clip each cell against the perpendicular bisectors of the other centres. */
function regionCell(id: WorldZoneId) {
  const [x, y] = CENTRES[id];
  let polygon = [[0, 0], [1000, 0], [1000, 620], [0, 620]];
  for (const other of locations) {
    if (other.id === id || OFFSHORE[other.id]) continue;
    const [ox, oy] = CENTRES[other.id], nx = ox - x, ny = oy - y;
    const edge = (ox * ox + oy * oy - x * x - y * y) / 2;
    const distance = ([px, py]: number[]) => px * nx + py * ny - edge;
    const next: number[][] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = distance(a), db = distance(b);
      if (da <= 0) next.push(a);
      if ((da <= 0) !== (db <= 0)) {
        const t = da / (da - db);
        next.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    polygon = next;
  }
  return `M${polygon.map(point => point.map(n => n.toFixed(2)).join(' ')).join(' L')} Z`;
}
const CELLS = Object.fromEntries(locations.map(place => [place.id, OFFSHORE[place.id] ?? regionCell(place.id)]));
const LABELS: Partial<Record<WorldZoneId, string[]>> = {
  'upper-thomson': ['Upper', 'Thomson'], 'jurong-lake': ['Jurong Lake'],
  'bukit-timah': ['Bukit Timah'], 'katong-joo-chiat': ['Katong /', 'Joo Chiat'],
  'little-india': ['Little', 'India'], 'kampong-glam': ['Kampong', 'Glam'],
  'raffles-place': ['Raffles', 'Place'], 'marina-bay': ['Marina', 'Bay'],
};

/** Matches the push-in in starting-point-picker.css. */
const DEPLOY_MS = 300;

type Props = {
  mode: 'training' | 'world';
  initial: WorldZoneId;
  options: readonly Location[];
  back: React.ReactNode;
  onDeploy: (id: WorldZoneId) => void;
};

export default function StartingPointPicker({ mode, initial, options, back, onDeploy }: Props) {
  const [selected, setSelected] = useState(initial);
  const [view, setView] = useState<'map' | 'list'>(() => window.matchMedia('(max-width: 760px)').matches ? 'list' : 'map');
  const [query, setQuery] = useState('');
  const matches = options.filter(option => `${option.name} ${option.district}`.toLowerCase().includes(query.toLowerCase().trim()));
  const clip = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const [deploying, setDeploying] = useState(false);
  const deployTimer = useRef(0);
  useEffect(() => () => clearTimeout(deployTimer.current), []);
  const place = options.find(option => option.id === selected) ?? options[0];
  const zone = getWorldZone(place.id);
  const training = mode === 'training';
  const index = options.findIndex(option => option.id === place.id);
  const step = (direction: number) => setSelected(options[(index + direction + options.length) % options.length].id);

  useEffect(() => {
    prepareMenuAudio();
    document.addEventListener('visibilitychange', stopMenuHover);
    return () => { stopMenuHover(); document.removeEventListener('visibilitychange', stopMenuHover); };
  }, []);

  // The map pushes in on the chosen district, then hands over to the loading screen.
  const deploy = () => {
    if (deploying) return;
    if (reducedMotion()) { onDeploy(place.id); return; }
    // From the map's own coordinates, as a narrow map hides its pins.
    const toScreen = viewport.current?.querySelector('svg')?.getScreenCTM();
    const box = main.current?.getBoundingClientRect();
    if (toScreen && box && main.current) {
      const [x, y] = CENTRES[place.id];
      const screenX = toScreen.a * x + toScreen.e, screenY = toScreen.d * y + toScreen.f;
      // On a phone the map can be scrolled away from the button: head for the nearest point on screen.
      main.current.style.transformOrigin = `${Math.min(Math.max(screenX, 0), window.innerWidth) - box.left}px ${Math.min(Math.max(screenY, 0), window.innerHeight) - box.top}px`;
    }
    setDeploying(true);
    deployTimer.current = window.setTimeout(() => onDeploy(place.id), DEPLOY_MS);
  };

  // Delegate feedback so labels and icons do not each trigger another sound.
  const hover = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    const control = (event.target as Element).closest('[data-start-region],button,a');
    if (control && !(event.relatedTarget instanceof Node && control.contains(event.relatedTarget))) playMenuSound('hover');
  };
  const focus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.target.matches(':focus-visible') && event.target.closest('[data-start-region],button,a')) playMenuSound('hover');
  };
  const click = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && (event.target as Element).closest('[data-start-region],button,a')) playMenuSound('click');
  };

  const keyboard = (event: React.KeyboardEvent<SVGGElement>, id: WorldZoneId) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) { playMenuSound('click'); setSelected(id); } return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = options.findIndex(option => option.id === id);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
      : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
    viewport.current?.querySelector<SVGGElement>(`[data-start-region="${options[next].id}"]`)?.focus({ preventScroll: true });
  };

  return <div className={`game-screen starting-picker${deploying ? ' is-deploying' : ''}`} data-mode={mode} onPointerOver={hover} onFocus={focus} onClickCapture={click}>
    <header className="starting-header">{back}<span>{training ? 'TRAINING' : 'OPEN WORLD'} <i>/</i> SELECT DISTRICT</span><span className="starting-step">01 — STARTING POINT</span></header>
    <main className="starting-main" ref={main}>
      <div className="starting-title"><span className="starting-eyebrow">THE ISLAND IS YOURS</span><h1>Where do we start?</h1><p>Choose a district from the map or list. {training ? 'Set up your range in a familiar neighbourhood.' : 'Choose where your open world journey begins.'}</p></div>
      <div className="starting-layout">
        <section className="starting-map" aria-label="Starting district map">
          <div className="starting-map-heading"><span>SINGAPORE <b>/ {options.length} DISTRICTS</b></span><div className="starting-view" role="group" aria-label="District view"><button aria-pressed={view === 'map'} onClick={() => setView('map')}>Map</button><button aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button></div></div>
          {view === 'list' && <div className="starting-list"><label>Find a district<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name" /></label><div className="starting-list-items" aria-label="Districts">{matches.map(option => <button key={option.id} aria-pressed={selected === option.id} onClick={() => setSelected(option.id)}><span>{option.name}{option.id === initial && <small>Last selected</small>}</span><small>{training ? option.district : `${getWorldZone(option.id).risk} threat`}</small></button>)}{!matches.length && <p role="status">No districts match. Try another name.</p>}</div></div>}
          <div className="starting-map-viewport" ref={viewport} hidden={view !== 'map'}>
            <svg viewBox="45 65 940 540" role="group" aria-label="Singapore regions. Choose a district with Enter or Space; use arrow keys to browse.">
              <defs><clipPath id={clip}><path d={COAST} /></clipPath><pattern id={`${clip}-grid`} width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="currentColor" strokeWidth=".5" /></pattern></defs>
              <rect width="1000" height="620" fill={`url(#${clip}-grid)`} className="starting-grid" />
              <text x="110" y="180" className="starting-water">JOHOR STRAIT</text><text x="740" y="585" className="starting-water">SINGAPORE STRAIT</text>
              <path d="M416 518L430 550 M908 223L885 140" className="starting-crossings" />
              {options.map((option, number) => {
                const active = option.id === place.id;
                const [x, y] = CENTRES[option.id];
                const lines = LABELS[option.id] ?? [option.name];
                return <g key={option.id} role="button" tabIndex={0} aria-label={option.name} aria-pressed={active}
                  className={`starting-region${active ? ' is-selected' : ''}`} data-start-region={option.id}
                  onClick={() => setSelected(option.id)} onKeyDown={event => keyboard(event, option.id)}>
                  <title>{option.name} · {training ? 'Live-fire training' : `${getWorldZone(option.id).risk} threat`}</title>
                  <path d={CELLS[option.id]} clipPath={OFFSHORE[option.id] ? undefined : `url(#${clip})`} />
                  <g className="starting-region-label" transform={`translate(${x} ${y})`}>
                    <circle cy={-18 - (lines.length - 1) * 7} r={active ? 5 : 3} />
                    {lines.map((line, i) => <text key={line} textAnchor="middle" y={i * 17 - (lines.length - 1) * 7}>{line}</text>)}
                  </g>
                  <text className="starting-region-number" x={x} y={y} textAnchor="middle">{number + 1}</text>
                </g>;
              })}
              <path d={COAST} className="starting-coast" />
            </svg>
          </div>
          <div className="starting-map-footer"><span><i /> Selected region</span><span>SCHEMATIC GAME REGIONS</span></div>
        </section>
        <aside className="starting-details" aria-label="Selected starting point">
          <div className="starting-detail-top"><span className="starting-detail-label"><MapPin size={16} />STARTING POINT</span><nav className="starting-browse" aria-label="Browse starting districts"><button aria-label="Previous district" onClick={() => step(-1)}><ChevronLeft size={18} /></button><span>{String(index + 1).padStart(2, '0')} / {options.length}</span><button aria-label="Next district" onClick={() => step(1)}><ChevronRight size={18} /></button></nav></div>
          <div className="starting-place" aria-live="polite" aria-atomic="true"><span className="starting-eyebrow">{place.district}</span><h2>{place.name}</h2><p className="starting-subtitle">{place.subtitle}</p></div>
          <div className="starting-tags">{place.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          <div className="starting-brief"><span>{training ? <Crosshair size={16} /> : <MapPin size={16} />}{training ? 'LIVE-FIRE RANGE' : `${zone.risk.toUpperCase()} THREAT`}</span><p>{training ? 'Practice with your equipped loadout. Targets, drills and vehicles will be ready when you arrive.' : zone.description}</p></div>
          <div className="starting-launch"><p>{training ? 'Your loadout comes with you.' : 'You can travel between districts after deploying.'}</p><button className="starting-deploy" onClick={deploy}>{training ? 'Continue to training' : 'Choose landing zone'}<ArrowRight size={18} /></button></div>
        </aside>
      </div>
      <footer className="starting-foot"><span><ArrowLeft size={13} /> <ArrowRight size={13} /> Browse regions <kbd>Enter</kbd> Select</span><span>{training ? 'DISTRICT → RANGE SETUP → START' : 'DISTRICT → LANDING ZONE → DEPLOY'}</span></footer>
    </main>
  </div>;
}
