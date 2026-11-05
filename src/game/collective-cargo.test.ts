import { describe, expect, it } from 'vitest';
import { itemById } from './armory-catalog';
import { createPooledLoadout } from './ammo-pools';
import { createProfile, resolveLoadout } from './armory-state';
import { respawnEquipment } from './respawn-equipment';
import { carriedFamilies, isMainWeapon } from './armory-slots';
import { FPS_WEAPONS, fireWeapon } from './fps-rules';
import { comesWithCargoKit, recoverProxyWeapon, supplyProxyMagazines } from './proxy-equipment';
import { createProxyCampaign, createProxyOperations, PROXY_REWARDS, proxyWeaponName, validProxySnapshot } from './proxy-operations';
import { buildServiceWeapon } from './service-weapon-models';
import { weaponRange } from './weapon-range';
import { hasLauncherMode, isLauncherMode, launcherOf, OICW_LAUNCHER, OICW_RIFLE, physicalWeaponFamilies, primaryWeaponFamily, QTS_LAUNCHER, QTS_RIFLE, withWeaponModes } from './weapon-modes';

const at = { x: 0, y: 0, z: 0 }, entries = { 'freedom-force': { x: 28, y: 0, z: 0 }, 'collective-cops': { x: -28, y: 0, z: 0 } };
const BUILT = ['cc-gatekeeper', 'cc-network', 'cc-qts11'] as const;

describe('Collective Corps cargo weapons', () => {
  it('appends families after the Freedom Force ones, so saves and network indexes keep their meaning', () => {
    expect(FPS_WEAPONS.slice(13).map(weapon => weapon.id)).toEqual(['ff-oicw-launcher', 'cc-gatekeeper', 'cc-network', 'cc-qts11', 'cc-qts11-launcher']);
    expect(FPS_WEAPONS[OICW_RIFLE].id).toBe('ff-oicw'); expect(FPS_WEAPONS[QTS_RIFLE].id).toBe('cc-qts11'); expect(FPS_WEAPONS[QTS_LAUNCHER].id).toBe('cc-qts11-launcher');
  });
  it('offers every design from Collective cargo, keeps the SAR retrofit and never the launcher alone', () => {
    expect(PROXY_REWARDS['collective-cops']).toEqual(['sar-proxy-prototype', ...BUILT]);
    expect(PROXY_REWARDS['freedom-force'].some(id => id.startsWith('cc-'))).toBe(false);
    PROXY_REWARDS['collective-cops'].forEach((id, index, pool) => {
      const ops = createProxyOperations({ ...createProxyCampaign(), serial: 1 }, () => (index + .5) / pool.length);
      ops.start(at, entries);
      expect(ops.current()!.owner).toBe('collective-cops'); expect(ops.current()!.weaponId).toBe(id);
      expect(validProxySnapshot(ops.snapshot())).toBe(true);
      expect(itemById(id)!.tier).toBe('Mythic'); expect(proxyWeaponName(id)).toBe(itemById(id)!.name);
    });
  });
  it.each(BUILT)('%s is never sold, has a model and comes with spare magazines', id => {
    const item = itemById(id)!;
    expect(item.source).toBe('enemy'); expect(item.price).toBe(0);
    expect(buildServiceWeapon(id)).toBeDefined(); expect(comesWithCargoKit(id)).toBe(true);
    expect(weaponRange(FPS_WEAPONS[item.family!])).toBeGreaterThanOrEqual(300);
    const equipment = resolveLoadout(recoverProxyWeapon(createProfile(), id, 0)), states = createPooledLoadout(equipment.weapons, equipment.carriedFamilies);
    expect(states[item.family!].magazineGroup).toBe('5.80:magazine');
    supplyProxyMagazines(states, item.family!);
    expect(states[item.family!].magazineInventory!.slots.filter(mag => mag?.group === '5.80:magazine').length).toBeGreaterThanOrEqual(2);
  });
  it('leaves the SAR retrofit feeding from standard rifle stock', () => expect(comesWithCargoKit('sar-proxy-prototype')).toBe(false));
  it('trades the bullpup range for close-quarters pace against its service rifle', () => {
    const [bullpup, service] = BUILT.slice(0, 2).map(id => resolveLoadout(recoverProxyWeapon(createProfile(), id, 0)).weapons[itemById(id)!.family!]);
    expect(bullpup.interval).toBeLessThan(service.interval); expect(bullpup.mobility).toBeGreaterThan(service.mobility);
    expect(bullpup.reload).toBeGreaterThan(service.reload); expect(weaponRange(bullpup)).toBeLessThan(weaponRange(service));
  });
});

describe('integral launcher modes', () => {
  it('pairs each rifle with its own launcher', () => {
    expect(launcherOf(OICW_RIFLE)).toBe(OICW_LAUNCHER); expect(launcherOf(QTS_RIFLE)).toBe(QTS_LAUNCHER); expect(launcherOf(0)).toBeUndefined();
    expect(primaryWeaponFamily(QTS_LAUNCHER)).toBe(QTS_RIFLE); expect(primaryWeaponFamily(OICW_LAUNCHER)).toBe(OICW_RIFLE); expect(primaryWeaponFamily(14)).toBe(14);
    for (const family of [OICW_RIFLE, OICW_LAUNCHER, QTS_RIFLE, QTS_LAUNCHER]) expect(hasLauncherMode(family)).toBe(true);
    expect(hasLauncherMode(14)).toBe(false);
    expect(isLauncherMode(QTS_LAUNCHER)).toBe(true); expect(isLauncherMode(QTS_RIFLE)).toBe(false);
    expect(isMainWeapon(QTS_LAUNCHER)).toBe(false); expect(isMainWeapon(QTS_RIFLE)).toBe(true);
  });
  it('adds only the launchers of the rifles carried, even with both prototypes slung', () => {
    expect(withWeaponModes([QTS_RIFLE, 2])).toEqual([QTS_RIFLE, 2, QTS_LAUNCHER]);
    expect(withWeaponModes([OICW_RIFLE, QTS_RIFLE, 2])).toEqual([OICW_RIFLE, QTS_RIFLE, 2, OICW_LAUNCHER, QTS_LAUNCHER]);
    expect(physicalWeaponFamilies([OICW_RIFLE, QTS_RIFLE, 2, OICW_LAUNCHER, QTS_LAUNCHER])).toEqual([OICW_RIFLE, QTS_RIFLE, 2]);
    expect(carriedFamilies({ carry: { main: QTS_RIFLE, extra: null }, owned: [] })).toEqual([QTS_RIFLE, 2, QTS_LAUNCHER]);
  });
  it('keeps the QTS-11 modes in one carry slot with independent magazines, until death', () => {
    const profile = recoverProxyWeapon(createProfile(), 'cc-qts11', 0), equipment = resolveLoadout(profile);
    expect(physicalWeaponFamilies(equipment.carriedFamilies)).toEqual([QTS_RIFLE, 2]);
    const states = createPooledLoadout(equipment.weapons, equipment.carriedFamilies);
    const rifle = states[QTS_RIFLE].magazine, launcher = states[QTS_LAUNCHER].magazine;
    expect(fireWeapon(states[QTS_LAUNCHER], QTS_LAUNCHER, equipment.weapons)).toBe(true);
    expect(states[QTS_LAUNCHER].magazine).toBe(launcher - 1); expect(states[QTS_RIFLE].magazine).toBe(rifle);
    expect(states[QTS_LAUNCHER].magazineGroup).toBe('20.00:magazine');
    supplyProxyMagazines(states, QTS_RIFLE);
    expect(states[QTS_RIFLE].magazineInventory!.slots.filter(mag => mag?.caliberMm === 20).length).toBe(2);
    expect(resolveLoadout(respawnEquipment(profile, createProfile())).carriedFamilies).not.toContain(QTS_LAUNCHER);
  });
  it('animates the launcher magazine and fires from the launcher muzzle in that mode', () => {
    const rifle = buildServiceWeapon('cc-qts11')!, launcher = buildServiceWeapon('cc-qts11-launcher')!;
    const rifleMag = rifle.getObjectByName('cc-qts11__magazine')!, launcherMag = launcher.getObjectByName('cc-qts11-launcher__magazine')!;
    expect(rifleMag.position.z).toBeLessThan(0); expect(launcherMag.position.z).toBeGreaterThan(0);
    expect(launcher.getObjectByName('cc-qts11-launcher__socket_muzzle')!.position.y).toBeGreaterThan(rifle.getObjectByName('cc-qts11__socket_muzzle')!.position.y);
    expect(launcher.getObjectByName('cc-qts11-launcher__charging-handle')).toBeDefined();
  });
});
