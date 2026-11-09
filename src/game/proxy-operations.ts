/** Expedition-only proxy operations. Favor survives district travel in this expedition;
 * encounter targets and cargo never become global faction alliances. */
export const PROXY_IDS = ['freedom-force', 'collective-cops'] as const;
export type ProxyId = typeof PROXY_IDS[number];
export const proxyName = (id: ProxyId) => id === 'freedom-force' ? 'Freedom Force' : 'Collective Corps';
export const proxyRival = (id: ProxyId): ProxyId => id === 'freedom-force' ? 'collective-cops' : 'freedom-force';
export const PROXY_RULES = { firstIn: 60, cooldown: 420, warning: 18, duration: 180, pursuit: 65, withdrawal: 18, claim: 8, reach: 4, supplies: 60 } as const;
export const PROXY_REWARDS = {
  'freedom-force': ['ff-scar-l', 'ff-scar-h', 'ff-longwatch', 'ff-oicw', 'ff-intervention'],
  'collective-cops': ['sar-proxy-prototype', 'cc-gatekeeper', 'cc-network', 'cc-qts11'],
} as const;
export const proxyWeaponName = (id: string) => ({ 'ff-scar-l': 'Soft Power · Foreign Aid', 'ff-scar-h': 'Hard Power · Strings Attached', 'ff-longwatch': 'Smart Power · Targeted Assistance', 'ff-oicw': 'Peace Offering · Escalation Clause', 'ff-intervention': 'Foreign Intervention', 'sar-proxy-prototype': 'SAR 21 · Unauthorised Upgrade', 'cc-gatekeeper': 'Strong Objection No. 496 · Final Warning No. 497', 'cc-network': 'Consensus Builder · Unanimous Vote', 'cc-qts11': 'Win-Win Cooperation · Mutual Benefit' })[id] ?? 'Prototype';
export type ProxyAction = 'return' | 'rival' | 'keep' | 'carry' | 'deliver';
export type ProxyPoint = { x: number; y: number; z: number };
export interface ProxyCampaign {
  favor: Record<ProxyId, number>;
  nextIn: number;
  serial: number;
}
export const createProxyCampaign = (): ProxyCampaign => ({ favor: { 'freedom-force': 0, 'collective-cops': 0 }, nextIn: PROXY_RULES.firstIn, serial: 0 });
export interface ProxyOperation {
  id: string; owner: ProxyId; weaponId: string; phase: 'incoming' | 'contested' | 'recovery' | 'withdrawing' | 'complete';
  at: ProxyPoint; entries: Record<ProxyId, ProxyPoint>; remaining: number;
  cargo: 'sealed' | 'carried' | 'resolved'; carrier?: string; decision?: ProxyAction;
  claim: Record<ProxyId, number>; targets: Record<ProxyId, string[]>;
  outcome: string;
}
export interface ProxySnapshot {
  favor: Record<ProxyId, number>; operation: ProxyOperation | null;
}
export interface ProxyParticipant extends ProxyPoint { id: string; faction: string; bot: boolean; alive: boolean; playing?: boolean; vehicle?: string; feet: number }
const near = (a: ProxyPoint, b: ProxyPoint, radius: number) => Math.hypot(a.x - b.x, a.z - b.z) <= radius;
const bounded = (n: number) => Math.max(-100, Math.min(100, n));
export const validProxyAction = (value: unknown): value is ProxyAction => typeof value === 'string' && ['return', 'rival', 'keep', 'carry', 'deliver'].includes(value);

export function createProxyOperations(campaign: ProxyCampaign, random: () => number = Math.random) {
  let operation: ProxyOperation | null = null;
  function adjust(faction: ProxyId, amount: number) { campaign.favor[faction] = bounded(campaign.favor[faction] + amount); }
  function target(faction: ProxyId, id: string) {
    if (operation && !operation.targets[faction].includes(id) && operation.targets[faction].length < 64) operation.targets[faction].push(id);
  }
  function withdraw(outcome: string) {
    if (!operation) return;
    operation.phase = 'withdrawing'; operation.remaining = PROXY_RULES.withdrawal; operation.outcome = outcome;
  }
  function start(at: ProxyPoint, entries: Record<ProxyId, ProxyPoint>) {
    if (operation && (operation.phase !== 'complete' || operation.cargo==='carried')) return false;
    const owner = ++campaign.serial % 2 ? 'freedom-force' : 'collective-cops';
    const rewards = PROXY_REWARDS[owner];
    operation = { id: `proxy-${campaign.serial}`, owner, weaponId: rewards[Math.floor(random() * rewards.length)],
      phase: 'incoming', at: { ...at }, entries: structuredClone(entries), remaining: PROXY_RULES.warning,
      cargo: 'sealed', claim: { 'freedom-force': 0, 'collective-cops': 0 }, targets: { 'freedom-force': [], 'collective-cops': [] }, outcome: '' };
    campaign.nextIn = PROXY_RULES.cooldown; return true;
  }
  function provoke(faction: ProxyId, attacker: ProxyParticipant) {
    if (!operation || operation.phase === 'complete' || operation.phase === 'incoming' || attacker.faction === faction) return;
    if (!operation.targets[faction].includes(attacker.id) && !attacker.bot) adjust(faction, -10);
    target(faction, attacker.id);
  }
  function action(id: string, choice: ProxyAction, actors: readonly ProxyParticipant[], delivery?: ProxyPoint) {
    const op = operation, actor = actors.find(a => a.id === id);
    if (!op || !actor || actor.bot || !actor.alive || actor.playing === false || actor.vehicle || !validProxyAction(choice)) return false;
    if (choice === 'deliver') {
      if (op.cargo !== 'carried' || op.carrier !== id || !delivery || !near(actor, delivery, PROXY_RULES.reach) || Math.abs(actor.feet - delivery.y) >= 2) return false;
      op.cargo = 'resolved'; op.decision = 'deliver';
      op.outcome = 'Prototype delivered. Armed Forces received 60 supplies.';
      if (op.phase !== 'withdrawing' && op.phase !== 'complete') { op.phase = 'recovery'; op.remaining = Math.min(op.remaining, PROXY_RULES.pursuit); }
      return true;
    }
    if (op.phase !== 'contested' || op.cargo !== 'sealed' || op.decision || !near(actor, op.at, PROXY_RULES.reach) || Math.abs(actor.feet - op.at.y) >= 2) return false;
    const recipient = choice === 'rival' ? proxyRival(op.owner) : op.owner;
    if ((choice === 'return' || choice === 'rival') && !actors.some(a => a.bot && a.alive && a.faction === recipient)) return false;
    op.decision = choice;
    if (choice === 'return') {
      adjust(op.owner, 15); op.cargo = 'resolved';
      // Returning tracked property settles this cell's dispute with its returner.
      op.targets[op.owner] = op.targets[op.owner].filter(target => target !== id);
      withdraw(`Returned to ${proxyName(op.owner)}. Favor +15; prototype relinquished.`);
    } else {
      adjust(op.owner, -20); target(op.owner, id);
      if (choice === 'rival') { adjust(recipient, 12); op.cargo = 'resolved'; op.outcome = `${proxyName(recipient)} favor +12; ${proxyName(op.owner)} favor −20.`; }
      if (choice === 'keep') { op.cargo = 'resolved'; op.outcome = `${proxyWeaponName(op.weaponId)} recovered for this life. Owner favor −20.`; }
      if (choice === 'carry') { op.cargo = 'carried'; op.carrier = id; op.outcome = 'Tracked cargo: deliver at an operational friendly facility. Owner favor −20.'; }
      op.phase = 'recovery'; op.remaining = PROXY_RULES.pursuit;
    }
    return true;
  }
  function step(dt: number, actors: readonly ProxyParticipant[], clear: (a: ProxyPoint, b: ProxyPoint) => boolean = () => true) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (operation?.cargo==='carried' && !actors.some(a=>a.id===operation!.carrier && a.alive)) { operation.cargo='resolved'; withdraw('Cargo lost with its carrier. The recovery operation is ending.'); }
    if (!operation || operation.phase === 'complete') { if(operation?.cargo!=='carried')campaign.nextIn = Math.max(0, campaign.nextIn - dt); return; }
    const op = operation;
    op.remaining = Math.max(0, op.remaining - dt);
    if (op.phase === 'incoming' && op.remaining === 0) { op.phase = 'contested'; op.remaining = PROXY_RULES.duration; }
    else if (op.phase === 'contested') {
      for (const faction of PROXY_IDS) {
        const own = actors.filter(a => a.bot && a.alive && a.faction === faction);
        const rival = actors.filter(a => a.bot && a.alive && a.faction === proxyRival(faction));
        for (const enemy of rival) target(faction, enemy.id);
        const holding = own.some(a => near(a, op.at, 3) && Math.abs(a.feet - op.at.y) < 2 && clear(a, { ...op.at, y: op.at.y + .7 }));
        op.claim[faction] = holding && !rival.some(a => near(a, op.at, 8)) ? Math.min(PROXY_RULES.claim, op.claim[faction] + dt) : 0;
        if (op.claim[faction] >= PROXY_RULES.claim) { op.cargo = 'resolved'; withdraw(`${proxyName(faction)} secured the prototype and is withdrawing.`); break; }
      }
      if (op.phase === 'contested' && op.remaining === 0) { op.cargo = 'resolved'; withdraw('Recovery window closed. Proxy teams are withdrawing.'); }
    } else if (op.phase === 'recovery' && op.remaining === 0) withdraw('Recovery teams are withdrawing. Local hostility ends when they leave.');
    else if (op.phase === 'withdrawing' && op.remaining === 0) { op.phase = 'complete'; op.targets = { 'freedom-force': [], 'collective-cops': [] }; }
  }
  return { start, action, provoke, target, step, withdraw, current: () => operation,
    snapshot: (): ProxySnapshot => ({ favor: { ...campaign.favor }, operation: operation ? structuredClone(operation) : null }) };
}

/** The host publishes bounded relationship state; guests cannot choose targets. */
export function validProxySnapshot(value: unknown): value is ProxySnapshot {
  if (!value || typeof value !== 'object') return false;
  const s = value as ProxySnapshot, op = s.operation;
  if (!s.favor || !PROXY_IDS.every(f => Number.isFinite(s.favor[f]) && Math.abs(s.favor[f]) <= 100)) return false;
  if (op === null) return true;
  const point = (p: ProxyPoint) => !!p && [p.x,p.y,p.z].every(Number.isFinite) && Math.abs(p.x) <= 5000 && Math.abs(p.z) <= 5000 && p.y >= -50 && p.y <= 124;
  return !!op && typeof op.id === 'string' && /^proxy-\d+$/.test(op.id) && op.id.length < 30 && PROXY_IDS.includes(op.owner) && (PROXY_REWARDS[op.owner] as readonly string[]).includes(op.weaponId) &&
    ['incoming','contested','recovery','withdrawing','complete'].includes(op.phase) && ['sealed','carried','resolved'].includes(op.cargo) &&
    point(op.at) && !!op.entries && PROXY_IDS.every(f => point(op.entries[f])) && Number.isFinite(op.remaining) && op.remaining >= 0 && op.remaining <= PROXY_RULES.duration &&
    typeof op.outcome === 'string' && op.outcome.length <= 200 && (op.carrier === undefined || typeof op.carrier === 'string' && op.carrier.length <= 100) &&
    (op.decision === undefined || validProxyAction(op.decision)) && !!op.targets && !!op.claim && PROXY_IDS.every(f =>
      Number.isFinite(op.claim[f]) && op.claim[f] >= 0 && op.claim[f] <= PROXY_RULES.claim && Array.isArray(op.targets[f]) && op.targets[f].length <= 64 && op.targets[f].every(id => typeof id === 'string' && id.length <= 100));
}
