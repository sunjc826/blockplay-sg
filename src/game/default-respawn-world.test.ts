import { expect, it } from 'vitest';
import { buildDistrictWorld } from './district-world';
import { getWorldZone } from './world-zones';

it('keeps the authored district home separate from the gateway arrival used for this life', () => {
  const arrival={x:42,z:68,yaw:1.2,pitch:0};
  const world=buildDistrictWorld('queenstown',arrival);
  expect(world.environment.playerSpawn).toEqual(arrival);
  expect(world.environment.defaultPlayerSpawn).toEqual(getWorldZone('queenstown').spawn);
  expect(world.environment.defaultPlayerSpawn).not.toEqual(arrival);
});
