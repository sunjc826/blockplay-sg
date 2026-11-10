import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { scenes, opening, endingCount } from '../public/story.js';
test('every route terminates in a reachable ending, without cycles or missing scenes',()=>{
  const visited=new Set(), endings=new Set();
  function walk(id,path=[]) {
    assert.ok(scenes[id],`Missing scene ${id}`); assert.ok(!path.includes(id),`Cycle at ${id}`); visited.add(id);
    const scene=scenes[id]; assert.ok(scene.text.length>50);
    if(scene.ending) { assert.equal(scene.choices.length,0);endings.add(id);return; }
    assert.equal(scene.choices.length,2);
    for(const choice of scene.choices) walk(choice.next,[...path,id]);
  }
  walk(opening); assert.equal(visited.size,Object.keys(scenes).length); assert.equal(endings.size,4); assert.equal(endingCount,4);
});
test('published narration matches every scene and contains actual audio',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../public/audio/manifest.json',import.meta.url),'utf8'));
  for(const [id,scene] of Object.entries(scenes)) {
    const clip=manifest.clips.find(c=>c.id===id); assert.ok(clip,`Missing clip ${id}`); assert.equal(clip.text,scene.text);
    const file=await readFile(new URL(`../public/audio/${id}.mp3`,import.meta.url)); assert.ok(file.length>1000);
    assert.equal(createHash('sha256').update(file).digest('hex'),clip.sha256,`Corrupt clip ${id}`);
  }
  const ambience=await readFile(new URL('../public/audio/atmosphere.mp3',import.meta.url));
  assert.ok(ambience.length>1000); assert.equal(createHash('sha256').update(ambience).digest('hex'),manifest.atmosphere.sha256);
});
