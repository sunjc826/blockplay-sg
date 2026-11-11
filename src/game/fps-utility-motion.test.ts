import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { itemById } from './armory-catalog';
import { UTILITY_MODEL_IDS } from './utility-models';
import { supplyProfile } from './fps-healing';
import { utilityMotion } from './fps-utility-motion';
import { createSupplyViewmodel } from './fps-supply-viewmodel';
import { createGrenadeViewmodel } from './grenade-models';
import { GRENADE_CATALOG } from './grenade-catalog';
import { heldGrenadeMotion } from './fps-grenade-motion';

const visibleState = (root: THREE.Object3D) => {
  const result: unknown[] = [];root.updateMatrixWorld(true);
  root.traverseVisible(n => result.push([n.name,n.position.toArray(),n.rotation.toArray(),n.scale.toArray(), n instanceof THREE.Mesh ? n.geometry.drawRange : null]));return result;
};
describe('non-food utility animations', () => {
  it.each(UTILITY_MODEL_IDS)('%s has finite motion, fixed prop proportions and resets after interruption', id => {
    const style = supplyProfile(itemById(id)!).style, scene = new THREE.Scene(), view = createSupplyViewmodel(scene);
    view.update(style,.12,id);const before=visibleState(view.root);
    let previous=utilityMotion(style,0,id);
    for(let i=0;i<=300;i++) {
      const p=i/300,motion=utilityMotion(style,p,id);
      for(const part of ['right','left','item'] as const) {
        expect(Object.values(motion[part]).every(Number.isFinite)).toBe(true);
        for(const axis of ['x','y','z'] as const) expect(Math.abs(motion[part][axis]-previous[part][axis])).toBeLessThan(.1);
      }
      previous=motion;view.update(style,p,id);
      expect(view.root.getObjectByName('supply-'+style)!.scale.toArray()).toEqual([1,1,1]);
    }
    view.update(null,0);expect(view.root.visible).toBe(false);
    view.update('eat',.6,'food-kaya-toast');view.update(style,.12,id);expect(visibleState(view.root)).toEqual(before);
    view.dispose();expect(scene.children).toHaveLength(0);
  });
  it('winds fixed-width ribbon on the actual arm and uses a separate dressing pad', () => {
    const view=createSupplyViewmodel(new THREE.Scene());
    const roll=view.root.getObjectByName('bandage-roll')!,wrap=view.root.getObjectByName('bandage-wrap') as THREE.Mesh;
    view.update('bandage',.4,'kit-bandage');const early=wrap.geometry.drawRange.count;
    const scale=roll.scale.clone();expect(wrap.parent!.parent!.name).toBe('viewmodel-hand-left');
    view.update('bandage',.8,'kit-bandage');expect(wrap.geometry.drawRange.count).toBeGreaterThan(early);expect(roll.scale.equals(scale)).toBe(true);
    expect(view.root.getObjectByName('dressing-pad')!.visible).toBe(false);
    view.update('bandage',.4,'kit-dressing');expect(view.root.getObjectByName('dressing-pad')!.visible).toBe(true);
    view.update('bandage',.17,'kit-dressing');expect(view.root.getObjectByName('dressing-wrapper')!.visible).toBe(true);expect(wrap.visible).toBe(false);
    view.dispose();
  });
  it('uses spray for first aid, a moving plunger for trauma, and releases ammo at its commit', () => {
    const view=createSupplyViewmodel(new THREE.Scene());
    view.update('medkit',.2,'kit-first-aid');expect(view.root.getObjectByName('antiseptic-spray')!.visible).toBe(false);
    view.update('medkit',.65,'kit-first-aid');expect(view.root.getObjectByName('antiseptic-spray')!.visible).toBe(true);expect(view.root.getObjectByName('antiseptic-mist')!.visible).toBe(true);expect(view.root.getObjectByName('medical-injector')!.visible).toBe(false);
    view.update('medkit',.4,'kit-trauma');const z=view.root.getObjectByName('injector-plunger')!.position.z;
    view.update('medkit',.65,'kit-trauma');expect(view.root.getObjectByName('injector-plunger')!.position.z).toBeLessThan(z);expect(view.root.getObjectByName('antiseptic-spray')!.visible).toBe(false);
    view.update('ammo',.71,'kit-ammo-refill');expect(view.root.getObjectByName('supply-magazine')!.visible).toBe(true);
    view.update('ammo',.72,'kit-ammo-refill');expect(view.root.getObjectByName('supply-magazine')!.visible).toBe(false);
    view.dispose();
  });
  it.each(GRENADE_CATALOG.map(item=>item.id))('%s restores its own pin and lever on reuse', id => {
    const view=createGrenadeViewmodel(new THREE.Scene()),hold={ready:.35,cooked:0,pinned:false,swingAt:null,under:0,fuseLeft:2};
    view.update({id,hold});const before=visibleState(view.root);
    view.update({id,hold:{...hold,pinned:true,cooked:.2}});
    const pulled=view.root.getObjectByName('pulled-'+id)!;
    if(view.parts(id).pin) {
      const original=view.root.getObjectByName(id)!.getObjectByName('grenade-pin') as THREE.Mesh;
      expect((pulled.children[0] as THREE.Mesh).geometry).toBe(original.geometry);expect(original.visible).toBe(false);
    }
    view.update({id,release:{thrown:true,elapsed:.2,under:1}});view.update(null);
    view.update({id,hold});expect(visibleState(view.root)).toEqual(before);
    view.update({id,hold},.46);expect(view.framingDepth).toBeLessThan(-.3);
    view.dispose();
  });
  it('does not pinch an imaginary pin on pinless props', () => {
    const m=heldGrenadeMotion({ready:.35,cooked:.12,pinned:true,swingAt:null,under:0,fuseLeft:2,ring:null});expect(m.pinOut).toBe(false);expect(m.leftPinch).toBe(0);
  });
});
