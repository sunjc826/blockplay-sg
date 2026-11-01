# Contested prototype operations

The first proxy gameplay slice is enabled in Open World expeditions. It is not
in training, solo arena or LAN. No global alliance changes are introduced.

After 60 seconds of simulation time, the director searches for clear ground
45–65 m from a living, playing human, with two clear approach corridors. A failed
search waits 20 seconds before trying again. A successful operation has an 18 s
cargo descent/warning, then two Freedom Force and two Collective Corps operators
walk in from the announced approaches. They fight each other and seek the crate;
they initially leave the player and both local factions alone. Owners alternate
between operations. The next operation waits seven minutes after the previous
one finishes. The debug menu can request an operation; disabling random events
also disables automatic proxy operations.

Approach the landed cargo within 4 m and press E (or tap Inspect cargo / choose).
The choice panel shows consequences before acting. Desktop uses keys 1–4; touch
uses buttons. Movement/fire stop while choosing, but the world continues.

| Choice | Favor | Benefit / cost |
| --- | --- | --- |
| Return to owner | Owner +15; rival unchanged | Relinquish the prototype; surviving owner cell withdraws |
| Hand over to rival | Rival +12; owner −20 | Owner pursues the player; requires a surviving recipient |
| Keep upgrade | Owner −20; rival unchanged | Mythic **SAR 21 · Unauthorised Upgrade**, a powerful retrofit for the current life |
| Carry to Armed Forces | Owner −20; rival unchanged | Deliver within 4 m of an operational friendly facility for up to 60 district supplies, full equipment repair and immediate deployment readiness |

Delivery requires a real beneficiary: damaged equipment, a deployment cooldown,
or room in the district supply stock. The receipt reports the actual supply gain
when the cap prevents all 60 being added. Carrying is not a remote donation:
the player must reach the facility alive. Death or leaving the district forfeits
undelivered cargo. Cargo can still be delivered after the recovery team departs;
it prevents another operation from replacing that unfinished delivery.

Favor ranges from −100 to +100 independently for each proxy. It is personal and
lasts this expedition, including district travel and player deaths; leaving Open
World starts a new campaign. This slice records favor but does not yet unlock
shops, contracts or global diplomatic changes. Returning stolen property costs
the valuable upgrade. Merely hurting one proxy never earns the other's favor.
The pause menu shows the current favor ledger.

## Hostility and aftermath

The cargo tracker explicitly broadcasts its location; taking or diverting it
identifies the player to its owner. A deliberate landed bullet or damaging blast
against a neutral operator also provokes that cell (−10 once per player/cell).
Nearby Armed Forces soldiers may defend a targeted player when they can see the
approaching proxy. Only those individual defenders become targets. Distant
friendly soldiers and facilities retain their normal relationships. The actor
relationship is symmetric so defenders can return fire. Neutral proxies are
labelled neutral on the minimap and excluded from AI-pilot targeting.

The existing cells conduct a single 65 s recovery operation, then have 18 s to
withdraw. They do not summon an endless pursuit army. Dead operators do not
respawn or drop repeatable prototype rewards. Teams can retreat earlier by
reaching their approach point; all remaining encounter actors are removed at the
end. Personal favor remains, but encounter targets are cleared.

Unattended cargo can be secured by either proxy after an uninterrupted eight
seconds within 3 m, with no rival within 8 m and a clear line to the crate. A
three-minute unresolved contest ends in withdrawal. Ignoring the event has no
favor penalty. Outcomes and actual rewards appear in the comms feed.

## Equipment and implementation boundaries

The prototype is experimental fire-control hardware fitted to the existing SAR
platform: +34 damage, +6 magazine capacity, a faster cycle and reduced recoil.
It uses ordinary compatible rifle ammunition and the existing model/reload/audio.
It replaces a carried main weapon according to normal pickup-slot rules, grants
no permanent ownership and is removed on death. The XM29/QTS-11 and other proxy
weapon art studies remain separate; this does not implement their launchers.

`proxy-operations.ts` owns bounded personal state, choice validation, claims and
lifetimes. `arena-rules.ts` owns placement, actors, sight/reach checks, combat
provocation and facility rewards. `arena-runtime.ts` accepts operation state only
in opted-in environments; guests cannot submit proxy actions or targets. Shared
visual identity lives in `proxy-faction-catalog.ts`; it has no rendering imports.
`ProxyOperationHud` and `proxy-operation-visuals.ts` present the decisions and the
single reusable cargo/parachute model. The normal two-faction squad heat and
facility ownership rules are unchanged.
