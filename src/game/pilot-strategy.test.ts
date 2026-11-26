import { expect, it, vi } from 'vitest';
import { createStrategyPlanner, llmPilotStrategy } from './pilot-strategy';
import { parsePilotObservation, validPilotPlan, type PilotPlan } from './pilot-strategy-contract';
import type { PilotObservation } from './fps-pilot';
import { HITSCAN } from './fps-ballistics';
const observation: PilotObservation = { time: 1, alive: true, health: 100, maxHealth: 100, armor: 0, magazine: 30, reserve: 120, weapon: 0,
  reloading: false, aiming: false, position: { x: 0, z: 0 }, yaw: 0, pitch: 0, contacts: [], waypoints: [], lootPrompt: '', travelPrompt: '', ballistics: HITSCAN };
const plan: PilotPlan = { goal: 'explore', waypointId: null, summary: 'Scout for supplies' };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
it('uses local planning while a strategy is pending, throttles calls and cancels stale replies', async () => {
  let finish!: (p: PilotPlan) => void, clock = 0;
  const strategy = { id: 'test', plan: vi.fn((_o, _signal) => new Promise<PilotPlan>(resolve => { finish = resolve; })) };
  const planner = createStrategyPlanner(strategy, () => clock);
  expect(planner.chooseGoal(observation)).toBe('explore'); planner.chooseGoal(observation); expect(strategy.plan).toHaveBeenCalledOnce();
  planner.reset(); expect(strategy.plan.mock.calls[0][1].aborted).toBe(true);
  finish({ ...plan, goal: 'resupply' }); await flush();
  expect(planner.chooseGoal(observation)).toBe('explore');
  finish({ ...plan, goal: 'resupply' }); await flush(); expect(planner.chooseGoal(observation)).toBe('resupply');
  clock = 25000; expect(planner.chooseGoal(observation)).toBe('explore'); planner.reset();
});
it('falls back after service errors and rejects invented waypoints', async () => {
  const planner = createStrategyPlanner({ id: 'broken', plan: async () => { throw new Error('Unavailable'); } });
  planner.chooseGoal(observation); await flush();
  expect(planner.status()).toContain('local fallback'); expect(planner.chooseGoal(observation)).toBe('explore');
  expect(validPilotPlan({ ...plan, waypointId: 'hidden-enemy' }, observation)).toBe(false);
  planner.reset();
});
it('whitelists observations and keeps private actor fields out of model input', () => {
  const parsed = parsePilotObservation({ ...observation, arena: { actors: ['hidden'] }, contacts: [{ id: 'seen', yawError: 0, pitchError: 0, angularRadius: .1, distance: 30, health: 90, x: 12 }] });
  expect(parsed).not.toHaveProperty('arena'); expect(parsed?.contacts[0]).not.toHaveProperty('health'); expect(parsed?.contacts[0]).not.toHaveProperty('x');
  expect(parsePilotObservation({ ...observation, health: Infinity })).toBeNull();
  expect(parsePilotObservation({ ...observation, waypoints: [null] })).toBeNull();
});
it('requests a strategy through the backend and validates its result', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ plan })));
  expect(await llmPilotStrategy(fetcher).plan(observation, new AbortController().signal)).toEqual(plan);
  expect(fetcher.mock.calls[0][0]).toBe('/api/adventure/pilot-plan');
  expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
});
it('discards plans for waypoints removed while the request was in flight and clears completed summaries', async () => {
  let finish!: (p: PilotPlan) => void;
  const planner = createStrategyPlanner({ id: 'delayed', plan: () => new Promise(resolve => { finish = resolve; }) }, () => 0);
  const withLoot: PilotObservation = { ...observation, waypoints: [{ id: 'crate', x: 0, z: 1, kind: 'ammo' }] };
  const lootPlan: PilotPlan = { goal: 'resupply', waypointId: 'crate', summary: 'Collect the crate' };
  planner.chooseGoal(withLoot); planner.chooseGoal(observation);
  finish(lootPlan); await flush();
  expect(planner.preferredWaypoint?.()).toBeNull(); expect(planner.status()).toContain('no longer available');
  planner.reset(); planner.chooseGoal(withLoot); finish(lootPlan); await flush();
  expect(planner.preferredWaypoint?.()).toBe('crate');
  planner.chooseGoal(observation);
  expect(planner.preferredWaypoint?.()).toBeNull(); expect(planner.status()).toContain('finished or expired');
  planner.reset();
});

it('carries contact range and ballistics through the observation whitelist', () => {
  // The whitelist drops unknown fields silently, so a compensation input that is
  // not copied here would leave the bot aiming straight with no error anywhere.
  const parsed = parsePilotObservation({ ...observation, ballistics: { velocity: 350, drop: 25 },
    contacts: [{ id: 'a', yawError: .1, pitchError: -.2, angularRadius: .02, distance: 44 }] });
  expect(parsed?.contacts[0].distance).toBe(44);
  expect(parsed?.ballistics).toEqual({ velocity: 350, drop: 25 });
  // Infinity does not survive JSON, so a hitscan spec arrives as null and must
  // come back as instant rather than being rejected as malformed.
  const overWire = JSON.parse(JSON.stringify({ ...observation, ballistics: { velocity: Infinity, drop: 0 } }));
  expect(overWire.ballistics.velocity).toBeNull();
  expect(parsePilotObservation(overWire)?.ballistics.velocity).toBe(Infinity);
  expect(parsePilotObservation({ ...observation, ballistics: { velocity: 350, drop: -1 } })).toBeNull();
  expect(parsePilotObservation({ ...observation, ballistics: undefined })).toBeNull();
  expect(parsePilotObservation({ ...observation, contacts: [{ id: 'a', yawError: 0, pitchError: 0, angularRadius: .02 }] })).toBeNull();
});

it('whitelists public recovery cues and belt options without leaking extra item data', () => {
  const parsed = parsePilotObservation({ ...observation, usingSupply: true, underThreat: false,
    supplies: [{ kind: 'food', health: 30, seconds: 2.5, privateData: 'hidden' }] });
  expect(parsed).toMatchObject({ usingSupply: true, underThreat: false, supplies: [{ kind: 'food', health: 30, seconds: 2.5 }] });
  expect(parsed?.supplies?.[0]).not.toHaveProperty('privateData');
  for (const patch of [{ usingSupply: 'yes' }, { underThreat: 1 }, { supplies: [null] }, { supplies: [{ kind: 'ammo', health: 20, seconds: 2 }] }, { supplies: [{ kind: 'food', health: Infinity, seconds: 2 }] }]) {
    expect(parsePilotObservation({ ...observation, ...patch })).toBeNull();
  }
});

it('whitelists grenade warnings and rejects invented or non-finite fields', () => {
 const grenade = { x: 2, z: 0, radius: 8, remaining: 1, privateCaller: 'secret' };
 expect(parsePilotObservation({ ...observation, grenades: [grenade] })?.grenades).toEqual([{ x: 2, z: 0, radius: 8, remaining: 1 }]);
 expect(parsePilotObservation({ ...observation, grenades: [{ ...grenade, remaining: NaN }] })).toBeNull();
 expect(parsePilotObservation({ ...observation, grenades: Array(25).fill(grenade) })).toBeNull();
});

it('maps streamer replies and coalesces major events until the three-second minimum', async () => {
  const { streamerPilotStrategy } = await import('./streamer-strategy');
  const { hudEvents } = await import('./ai-cast');
  const speak = vi.fn(), request = vi.fn().mockResolvedValue({goal:'resupply',waypointId:null,line:'Looking for supplies.'});
  let now = 0;
  const strategy = streamerPilotStrategy(request,speak), planner = createStrategyPlanner(strategy,()=>now);
  const hud = {health:100,maxHealth:100,phase:'playing',magazine:1,reserve:0,comms:[],chain:0} as unknown as import('./fps-engine').FpsHud;
  const diff = hudEvents((_text,major) => {if (major) planner.replan();});
  planner.chooseGoal(observation); diff(hud,0);
  await vi.waitFor(()=>expect(planner.status()).toBe('resupply'));
  expect(speak).toHaveBeenCalledWith('Looking for supplies.');
  now=500; diff({...hud,health:60,magazine:0},now);
  now=2999; expect(planner.chooseGoal(observation)).toBe('resupply'); expect(request).toHaveBeenCalledOnce();
  let finish!: (v:unknown) => void;
  request.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  now=3000; planner.chooseGoal(observation); expect(request).toHaveBeenCalledTimes(2);
  planner.replan(); now=6500; planner.chooseGoal(observation); expect(request).toHaveBeenCalledTimes(2);
  finish({goal:'resupply',waypointId:'gone',line:'stale'});
  await vi.waitFor(()=>expect(planner.status()).toContain('local fallback'));
  expect(planner.chooseGoal(observation)).toBe('explore'); expect(speak).not.toHaveBeenCalledWith('stale');
  planner.reset();
});

it('walks to a named sector, keeps walking past expiry and a failed re-ask, yields to threats and finishes at the boundary',async () => {
  const { createPlayerPilot } = await import('./fps-pilot');
  const { sectorTravelPoint } = await import('./pilot-sector');
  const sector = {id:'court',name:'Gate court',bounds:{minX:-5,maxX:5,minZ:-48,maxZ:-40},anchors:[],cover:'broken' as const,lootWeight:1};
  const travel = {sectors:[sector],point:() => sectorTravelPoint(sector,sector.bounds,observation.position,[{x:0,z:-44}],() => true)};
  const plan = {goal:'travel' as const,waypointId:null,sectorId:'court',summary:'Take the court'};
  expect(validPilotPlan(plan,observation,['court'])).toBe(true);
  expect(validPilotPlan(plan,observation)).toBe(false);
  expect(validPilotPlan({...plan,sectorId:'fake'},observation,['court'])).toBe(false);
  expect(validPilotPlan({...plan,waypointId:'known'},{...observation,waypoints:[{id:'known',kind:'ammo',x:0,z:0}]},['court'])).toBe(false);
  let now = 0;
  const request = vi.fn().mockResolvedValueOnce(plan).mockRejectedValue(Error('offline'));
  const planner = createStrategyPlanner({id:'streamer',plan:request},()=>now,travel), pilot = createPlayerPilot(planner);
  const o = {...observation,position:{x:0,z:0}};
  pilot.decide(o); await flush();
  for (let step=0;step<400;step++) {
    now += 100; o.time=now/1000;
    if (step === 220) {
      expect(pilot.decide({...o,contacts:[{id:'seen',yawError:0,pitchError:0,angularRadius:.02,distance:10}]}).status).toBe('Engaging visible target');
      continue;
    }
    const d = pilot.decide(o); await flush();
    expect(d.status).toBe('Heading to Gate court');
    if (d.action.forward) o.position.z -= .12;
    if (o.position.z <= -40) break;
  }
  expect(o.position.z).toBeLessThanOrEqual(-40); expect(request.mock.calls.length).toBeGreaterThan(2);
  pilot.decide(o); expect(planner.preferredSector?.()).toBeNull();
  expect(planner.status()).toMatch(/Arrived|Planning/);
});

it('clips sector approaches to the arena, prefers walkable navigation anchors and searches out from a blocked centre',async () => {
  const {sectorTravelPoint} = await import('./pilot-sector');
  const bounds = {minX:0,maxX:10,minZ:0,maxZ:10};
  const sector = {id:'post',name:'Post',bounds,anchors:[{x:5,z:4}],cover:'open' as const,lootWeight:1};
  const from = {x:0,z:0}, walkable = (p:{x:number}) => p.x >= 3;
  expect(sectorTravelPoint(sector,bounds,from,[{x:-1,z:2},{x:3,z:2}],walkable)).toEqual({x:3,z:2});
  expect(sectorTravelPoint(sector,bounds,from,[],walkable)).toEqual(sector.anchors[0]);
  const small = {minX:8,maxX:10,minZ:8,maxZ:10};
  expect(sectorTravelPoint(sector,small,from,[],p => p.x > 9)).toMatchObject({x:9.25,z:9});
  expect(sectorTravelPoint(sector,small,from,[],()=>false)).toBeNull();
});
it('keeps exits selectable in a crowded streamer turn without modifying local observations',async () => {
  const {streamerObservation} = await import('./streamer-strategy');
  const waypoints:PilotObservation['waypoints'][number][] = Array.from({length:50},(_,i) => ({id:String(i),x:i,z:0,kind:'ammo'}));
  waypoints.push({id:'district-exit',kind:'checkpoint',x:100,z:10});
  const wire = streamerObservation({...observation,waypoints});
  expect(wire.waypoints).toHaveLength(40);
  expect(wire.waypoints[0].id).toBe('district-exit');
  expect(waypoints).toHaveLength(51);
  expect(parsePilotObservation(wire)).toBeTruthy();
});

it('preserves the local and LLM waypoint contracts even when sector geometry is available',async () => {
  const {localPilotStrategy} = await import('./pilot-strategy');
  const area = {id:'square',name:'Square',bounds:{minX:0,maxX:5,minZ:0,maxZ:5},cover:'open' as const,anchors:[],lootWeight:1};
  const geometry = {sectors:[area],point:vi.fn(()=>({x:3,z:3}))};
  const loot = {...observation,waypoints:[{kind:'ammo' as const,id:'crate',x:4,z:1}]};
  const local = createStrategyPlanner(localPilotStrategy,()=>0,geometry);
  local.chooseGoal(loot); await flush();
  expect(local.preferredSector?.()).toBeNull();
  expect(local.preferredWaypoint?.()).toBeNull();
  const reply = {goal:'resupply',waypointId:'crate',summary:'Collect crate'};
  const fetcher = vi.fn().mockImplementation(async()=>new Response(JSON.stringify({plan:reply})));
  const llm=llmPilotStrategy(fetcher), planner=createStrategyPlanner(llm,()=>0,geometry);
  planner.chooseGoal(loot); await vi.waitFor(()=>expect(planner.preferredWaypoint?.()).toBe('crate'));
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({observation:JSON.parse(JSON.stringify(loot))});
  expect(planner.preferredSector?.()).toBeNull(); expect(geometry.point).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({plan:{...reply,waypointId:null,sectorId:'square'}})));
  await expect(llm.plan(loot,new AbortController().signal)).rejects.toThrow('Invalid strategy response');
  planner.reset(); local.reset();
});
