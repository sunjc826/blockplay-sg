import { clamp, DeskInput, type Persona } from './controls';

export type Signal =
  | 'elimination'
  | 'streak'
  | 'damage'
  | 'incoming'
  | 'contact'
  | 'low'
  | 'death'
  | 'respawn'
  | 'won'
  | 'lost'
  | 'district'
  | 'vehicle'
  | 'purchase'
  | 'poll'
  | 'vote'
  | 'pause'
  | 'resume'
  | 'quiet'
  | 'chat';
export const actions = {
  nod: 1,
  lean: 1.5,
  focus: 0.85,
  exhale: 1.8,
  smile: 1.45,
  shoulder: 1.55,
  glance: 0.85,
  shake: 1.3,
  point: 1.25,
  protest: 1.5,
  thump: 1.55,
  slam: 3.2,
  toss: 2.4,
  clip: 1.85,
  flinch: 0.95,
  peek: 1.55,
  cover: 1.65,
  sip: 2.2,
  shrug: 1.6,
  triumph: 2.2,
  slide: 2.7,
};
export type Reaction = keyof typeof actions;
const big = new Set<Reaction>(['slam', 'toss', 'thump', 'clip', 'triumph', 'slide', 'protest']);
const usesHands = new Set<Reaction>([
  'point',
  'protest',
  'thump',
  'slam',
  'toss',
  'clip',
  'cover',
  'sip',
  'shrug',
  'triumph',
  'slide',
]);
interface Rule {
  signal: Signal;
  choices: Reaction[];
  cooldown: number;
  minTilt?: number;
}
function rule(signal: Signal, choices: Reaction[], cooldown = 2, minTilt = 0): Rule {
  return { signal, choices, cooldown, minTilt };
}
export const rules: Record<Persona, Rule[]> = {
  pro: [
    rule('death', ['exhale']),
    rule('elimination', ['nod']),
    rule('streak', ['smile']),
    rule('damage', ['lean']),
    rule('incoming', ['focus']),
    rule('contact', ['focus']),
    rule('low', ['lean']),
    rule('respawn', ['focus']),
    rule('won', ['shoulder']),
    rule('lost', ['shoulder']),
    rule('district', ['glance']),
    rule('vehicle', ['focus']),
    rule('purchase', ['nod']),
    rule('poll', ['glance']),
    rule('vote', ['nod']),
    rule('pause', ['exhale']),
    rule('resume', ['focus']),
    rule('chat', ['glance'], 9),
  ],
  rager: [
    rule('death', ['slam', 'toss', 'thump'], 2, 0.78),
    rule('death', ['thump', 'protest'], 2, 0.48),
    rule('death', ['shake', 'point']),
    rule('damage', ['thump', 'protest'], 4, 0.62),
    rule('damage', ['point', 'shake']),
    rule('low', ['protest', 'shake']),
    rule('incoming', ['shake'], 5),
    rule('contact', ['lean']),
    rule('elimination', ['clip', 'point']),
    rule('streak', ['triumph', 'clip']),
    rule('respawn', ['lean']),
    rule('won', ['clip', 'triumph']),
    rule('lost', ['protest', 'shake']),
    rule('district', ['nod']),
    rule('vehicle', ['lean']),
    rule('purchase', ['smile']),
    rule('poll', ['point']),
    rule('vote', ['smile']),
    rule('pause', ['exhale']),
    rule('resume', ['lean']),
    rule('chat', ['point'], 8),
  ],
  'comic-streamer': [
    rule('death', ['slide', 'exhale'], 2),
    rule('elimination', ['triumph', 'clip']),
    rule('streak', ['clip', 'triumph']),
    rule('damage', ['flinch']),
    rule('incoming', ['flinch'], 3),
    rule('contact', ['peek']),
    rule('low', ['cover']),
    rule('respawn', ['peek']),
    rule('won', ['triumph', 'shrug']),
    rule('lost', ['shrug']),
    rule('district', ['glance']),
    rule('vehicle', ['peek']),
    rule('purchase', ['shrug']),
    rule('poll', ['shrug']),
    rule('vote', ['nod']),
    rule('pause', ['exhale']),
    rule('resume', ['peek']),
    rule('quiet', ['sip'], 25),
    rule('chat', ['shrug', 'glance'], 4),
  ],
};
export class Acting {
  readonly input: DeskInput;
  time = 0;
  tilt = 0;
  reaction: Reaction | null = null;
  age = 0;
  gaze = 0;
  reload = false;
  poll = false;
  low = false;
  playing = false;
  private lastDeath = -Infinity;
  private lastSignal = 0;
  private lastBig: Reaction | null = null;
  headsetGone = false;
  private priority = 0;
  private emitted = false;
  private counts = new Map<Rule, number>();
  private next = new Map<Signal, number>();
  private started = 0;
  constructor(readonly persona: Persona, private clock?: () => number) {
    this.time = this.lastSignal = clock?.() ?? 0;
    this.input = new DeskInput(persona);
  }
  get progress() {
    return this.reaction ? clamp(this.age / actions[this.reaction]) : 0;
  }
  get handsBusy() {
    return !!this.reaction && usesHands.has(this.reaction);
  }
  private advance(dt: number) {
    const next = this.clock?.() ?? this.time + dt;
    this.tilt = Math.max(0, this.tilt - Math.max(0, next - this.time) * 0.009);
    this.time = next;
    this.age = next - this.started;
    if (this.progress >= 1) {
      this.reaction = null;
      this.priority = 0;
    }
  }
  perform(action: Reaction, priority = 0) {
    this.started = this.time;
    this.reaction = action;
    this.age = 0;
    this.emitted = false;
    this.priority = priority;
    if (big.has(action)) this.lastBig = action;
  }
  signal(s: Signal) {
    this.advance(0);
    this.lastSignal = this.time;
    if (this.persona === 'rager') {
      if (s === 'death') {
        this.tilt = clamp(this.tilt + (this.time - this.lastDeath < 22 ? 0.4 : 0.3));
        this.lastDeath = this.time;
      }
      if (s === 'damage') this.tilt = clamp(this.tilt + 0.16);
      if (s === 'elimination') this.tilt = clamp(this.tilt - 0.27);
    }
    const p =
      s === 'death'
        ? 6
        : s === 'won' || s === 'lost'
        ? 5
        : s === 'streak'
        ? 4
        : s === 'elimination' || s === 'low'
        ? 3
        : s === 'damage' || s === 'incoming' || s === 'contact'
        ? 2
        : 1;
    if (
      this.time < (this.next.get(s) ?? 0) ||
      (this.reaction && (this.priority > p || (this.handsBusy && p <= this.priority)))
    )
      return;
    const row = rules[this.persona].find((r) => r.signal === s && this.tilt >= (r.minTilt ?? 0));
    if (!row) return;
    const n = this.counts.get(row) ?? 0;
    for (let i = 0; i < row.choices.length; i++) {
      const action = row.choices[(n + i) % row.choices.length];
      if ((big.has(action) && action === this.lastBig) || (action === 'toss' && this.headsetGone)) continue;
      this.perform(action, p);
      this.counts.set(row, n + i + 1);
      this.next.set(s, this.time + row.cooldown);
      break;
    }
  }
  tick(dt: number, impact: (action: Reaction) => void, returning = false) {
    this.advance(dt);
    this.input.tick(dt, this.handsBusy || returning);
    if (this.input.fire || this.input.held.aim || this.gaze !== 0) this.lastSignal = this.time;
    if (this.reaction) {
      if (!this.emitted && this.progress >= 0.38) {
        this.emitted = true;
        // A starved renderer can miss the impact entirely. Only report a visible beat.
        if (this.progress <= 0.59) impact(this.reaction);
      }
    } else if (this.playing && this.persona === 'comic-streamer' && this.time - this.lastSignal > 18) this.signal('quiet');
  }
}
