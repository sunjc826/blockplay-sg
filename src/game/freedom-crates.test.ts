import * as THREE from 'three';
import { expect, it } from 'vitest';
import { PROXY_REWARDS } from './proxy-operations';
import { recoverProxyWeapon } from './proxy-equipment';
import { createProfile, resolveLoadout } from './armory-state';
import { itemById } from './armory-catalog';
import { buildProxyWeapon } from './proxy-weapon-models';
import { fitWeaponOptic, getWeaponSight } from './weapon-optics';
import { createWeaponHandling } from './fps-viewmodel';
import { magazineGroup, magazineOf, restoreMagazine } from './magazine-inventory';
import { createPooledLoadout, replacePooledWeapon } from './ammo-pools';
import { addReserveMagazines } from './magazine-inventory';
import { fireWeapon, beginReload, advanceWeapon } from './fps-rules';

it.each(PROXY_REWARDS['freedom-force'])('%s has a live, unobstructed sight and detachable magazine', id => {
  const family=itemById(id)!.family!, spec=resolveLoadout(recoverProxyWeapon(createProfile(),id,0)).weapons[family];
  const model=buildProxyWeapon(id,true), root=model.root;
  expect(root.userData.artStudy).toBe(false);
  expect(root.getObjectByName(`${id}__magazine`)!.children.length).toBeGreaterThan(0);
  expect(root.getObjectByName(`${id}__socket_muzzle`)).toBe(model.sockets.muzzle);
  const {height,lens}=root.userData.proxyOptic;
  root.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(0,height,.8),new THREE.Vector3(0,0,-1),0,2);
  const hits=ray.intersectObject(root,true);
  if(id==='ff-longwatch'||id==='ff-intervention') {
    // The objective seals the front of the telescope, behind its live image.
    // Housing or mount geometry must never cover the rear aiming plane.
    expect(hits.length).toBeGreaterThan(0);
    for(const hit of hits) {
      expect(hit.point.z).toBeLessThan(lens);
      expect(hit.object.name).toBe(`${id}__Study opaque lens`);
    }
  } else expect(hits).toHaveLength(0);
  const remove=fitWeaponOptic(root,spec), sight=getWeaponSight(root)!;
  expect(sight.aimHeight).toBe(height);
  if(id==='ff-longwatch') expect(sight.reticle).toBe('tmr');
  if(id==='ff-intervention') expect(sight.reticle).toBe('mil-dot');
  expect(sight.magnification).toBeCloseTo(id==='ff-intervention'?6:id==='ff-oicw'||id==='ff-longwatch'?4:id==='ff-scar-h'?2:1);
  const handling=createWeaponHandling(root,family);
  expect(Number.isFinite(handling.aimHeight)).toBe(true);
  handling.dispose(); remove(); model.dispose();
});
it.each(PROXY_REWARDS['freedom-force'])('%s can fire, reload and retain physical magazines across travel',id=>{
  const previous=resolveLoadout(createProfile()), next=resolveLoadout(recoverProxyWeapon(createProfile(),id,0)), family=itemById(id)!.family!, spec=next.weapons[family];
  const states=replacePooledWeapon(createPooledLoadout(previous.weapons,previous.carriedFamilies),previous.weapons,previous.carriedFamilies,next.weapons,next.carriedFamilies,family);
  const state=states[family]; addReserveMagazines(state,4);
  expect(fireWeapon(state,family,next.weapons)).toBe(true);
  state.cooldown=0;expect(beginReload(state,family,next.weapons)).toBe(true);advanceWeapon(state,family,spec.reload*2,next.weapons);
  expect(state.magazine).toBe(state.loadedCapacity!+1);
  expect(restoreMagazine(magazineOf(spec,family))?.family).toBe(family);
  expect(magazineGroup(spec)).toBe(id==='ff-intervention'?'10.36:magazine':id==='ff-scar-l'||id==='ff-oicw'?'5.56:magazine':'7.62:magazine');
  expect(magazineGroup(spec)).not.toBe('7.62:belt');
});

it('gives both precision rifles a larger clear sight picture than the assault rifle scope', () => {
  const assault = buildProxyWeapon('ff-oicw', true), reference = assault.root.userData.proxyOptic;
  const angularRadius = (optic: typeof reference) => optic.radius / -(optic.aimDepth + optic.lens);
  for (const id of ['ff-longwatch', 'ff-intervention'] as const) {
    const model = buildProxyWeapon(id, true), optic = model.root.userData.proxyOptic;
    // At least 50% wider on screen, with more than twice the visible area.
    expect(angularRadius(optic)).toBeGreaterThan(angularRadius(reference) * 1.5);
    model.root.updateMatrixWorld(true);
    const eye = new THREE.Vector3(0, optic.height, -optic.aimDepth);
    // Test the complete enlarged aperture from the actual aiming position.
    // Stop at the image plane: the objective behind it intentionally has glass.
    for (const fraction of [0, .5, .95]) for (let step = 0; step < 16; step++) {
      const angle = step * Math.PI / 8;
      const point = new THREE.Vector3(Math.cos(angle) * optic.radius * fraction, optic.height + Math.sin(angle) * optic.radius * fraction, optic.lens);
      const direction = point.clone().sub(eye);
      const ray = new THREE.Raycaster(eye, direction.clone().normalize(), 0, direction.length() - .0001);
      expect(ray.intersectObject(model.root, true), `${id} aperture ${fraction}/${step}`).toHaveLength(0);
    }
    const spec = resolveLoadout(recoverProxyWeapon(createProfile(), id, 0)).weapons[itemById(id)!.family!];
    const remove = fitWeaponOptic(model.root, spec), sight = getWeaponSight(model.root)!;
    expect(sight.radius).toBe(optic.radius);
    expect(sight.magnification).toBeCloseTo(id === 'ff-longwatch' ? 4 : 6);
    remove();model.dispose();
  }
  assault.dispose();
});
