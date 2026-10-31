import { describe, expect, it } from 'vitest';
import { createSfxBank, SFX_GROUPS, sfxUrls } from './sfx-bank';

/** A context whose decode returns a distinct stand-in buffer per request. */
function fakeContext() {
  let n = 0;
  return { decodeAudioData: async () => ({ id: n++, duration: .3 }) } as unknown as BaseAudioContext;
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('sfx bank', () => {
  it('has a published file for every take of every group', () => {
    for (const group of SFX_GROUPS) expect(sfxUrls(group, '/').every(url => /^\/audio\/(?:sfx|reload)\/[\w-]+\.mp3$/.test(url))).toBe(true);
    expect(SFX_GROUPS).toEqual(expect.arrayContaining(['rifle-556', 'pistol-9', 'mg-762', 'hmg-127', 'walk', 'run', 'bolt-release']));
  });
  it('gives nothing until loaded, then never the same take twice running', async () => {
    const bank = createSfxBank(async () => new Response(new ArrayBuffer(8)));
    expect(bank.pick('walk')).toBeNull();
    bank.load(fakeContext()); await settle();
    let last = bank.pick('walk');
    for (let i = 0; i < 40; i++) { const next = bank.pick('walk'); expect(next).not.toBeNull(); expect(next).not.toBe(last); last = next; }
  });
  it('leaves a group empty when its files fail, so callers fall back to synthesis', async () => {
    const bank = createSfxBank(async () => new Response(null, { status: 404 }));
    bank.load(fakeContext()); await settle();
    expect(bank.pick('rifle-556')).toBeNull();
  });
  it('keeps reference takes stable independently of rotating impact and footstep takes', async () => {
    const bank = createSfxBank(async () => new Response(new ArrayBuffer(8)));
    expect(bank.get('rifle-556')).toBeNull(); bank.load(fakeContext()); await settle();
    const reference = bank.get('rifle-556', 2);
    expect(reference).not.toBeNull(); expect(reference).not.toBe(bank.get('rifle-556', 0));
    for (let i = 0; i < 20; i++) { bank.pick('rifle-556'); expect(bank.get('rifle-556', 2)).toBe(reference); }
    expect(bank.get('rifle-556', 99)).toBe(bank.get('rifle-556', 0));
    bank.dispose(); expect(bank.get('rifle-556')).toBeNull();
  });
});
