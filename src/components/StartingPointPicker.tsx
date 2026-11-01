import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Crosshair, MapPin, MoveHorizontal } from 'lucide-react';
import { locations, type Location } from '../data/locations';
import { getWorldZone, type WorldZoneId } from '../game/world-zones';
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

type Props = {
  mode: 'training' | 'world';
  initial: WorldZoneId;
  options: readonly Location[];
  back: React.ReactNode;
  onDeploy: (id: WorldZoneId) => void;
};

export default function StartingPointPicker({ mode, initial, options, back, onDeploy }: Props) {
  const [selected, setSelected] = useState(initial);
  const clip = useId();
  const viewport = useRef<HTMLDivElement>(null);
  const place = options.find(option => option.id === selected) ?? options[0];
  const zone = getWorldZone(place.id);
  const training = mode === 'training';

  useEffect(() => {
    // Bring the remembered district into view on phones, without scrolling the
    // page or taking keyboard focus away from the region the player chose.
    const view = viewport.current;
    const region = view?.querySelector<SVGGElement>(`[data-start-region="${selected}"] .starting-region-label`);
    if (!view || !region) return;
    const box = region.getBoundingClientRect(), frame = view.getBoundingClientRect();
    view.scrollTo({ left: view.scrollLeft + box.x + box.width / 2 - frame.x - frame.width / 2 });
  }, [selected]);

  const keyboard = (event: React.KeyboardEvent<SVGGElement>, id: WorldZoneId) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(id); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = options.findIndex(option => option.id === id);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
      : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
    viewport.current?.querySelector<SVGGElement>(`[data-start-region="${options[next].id}"]`)?.focus();
  };

  return <div className="game-screen starting-picker" data-mode={mode}>
    <header className="starting-header">{back}<span>{training ? 'TRAINING' : 'OPEN WORLD'} <i>/</i> SELECT DISTRICT</span><span className="starting-step">01 — STARTING POINT</span></header>
    <main className="starting-main">
      <div className="starting-title"><span className="starting-eyebrow">THE ISLAND IS YOURS</span><h1>Where do we start?</h1><p>Pick a region on the map. {training ? 'Set up your range in a familiar neighbourhood.' : 'Choose where your open world journey begins.'}</p></div>
      <div className="starting-layout">
        <section className="starting-map" aria-label="Starting district map">
          <div className="starting-map-heading"><span>SINGAPORE <b>/ {options.length} DISTRICTS</b></span><span>↑ N</span></div>
          <div className="starting-map-viewport" ref={viewport}>
            <svg viewBox="0 0 1000 620" role="group" aria-label="Singapore regions. Choose a district with Enter or Space; use arrow keys to browse.">
              <defs><clipPath id={clip}><path d={COAST} /></clipPath><pattern id={`${clip}-grid`} width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="currentColor" strokeWidth=".5" /></pattern></defs>
              <rect width="1000" height="620" fill={`url(#${clip}-grid)`} className="starting-grid" />
              <text x="110" y="180" className="starting-water">JOHOR STRAIT</text><text x="740" y="585" className="starting-water">SINGAPORE STRAIT</text>
              <path d="M416 518L430 550 M908 223L885 140" className="starting-crossings" />
              {options.map(option => {
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
                </g>;
              })}
              <path d={COAST} className="starting-coast" />
            </svg>
          </div>
          <div className="starting-map-footer"><span><i /> Selected region</span><span className="starting-pan"><MoveHorizontal size={14} /> Swipe to explore</span><span>SCHEMATIC GAME REGIONS</span></div>
        </section>
        <aside className="starting-details" aria-label="Selected starting point">
          <div className="starting-detail-top"><MapPin size={18} /><span>YOUR STARTING POINT</span></div>
          <span className="starting-eyebrow">{place.district}</span><h2>{place.name}</h2><p className="starting-subtitle">{place.subtitle}</p>
          <div className="starting-tags">{place.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          <div className="starting-brief"><span>{training ? <Crosshair size={16} /> : <MapPin size={16} />}{training ? 'LIVE-FIRE RANGE' : `${zone.risk.toUpperCase()} THREAT`}</span><p>{training ? 'Practice with your equipped loadout. Targets, drills and vehicles will be ready when you arrive.' : zone.description}</p></div>
          <div className="starting-launch"><p>{training ? 'Your loadout comes with you.' : 'You can travel between districts after deploying.'}</p><button className="starting-deploy" onClick={() => onDeploy(place.id)}>{training ? 'Start training' : 'Deploy here'}<ArrowRight size={18} /></button></div>
        </aside>
      </div>
      <footer className="starting-foot"><span><ArrowLeft size={13} /> <ArrowRight size={13} /> Browse regions <kbd>Enter</kbd> Select</span><span>CHOOSE A DISTRICT · THEN DEPLOY</span></footer>
    </main>
  </div>;
}
