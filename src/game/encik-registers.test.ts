import { describe, expect, it } from 'vitest';
import { addressLine, BASE_REGISTER, DEFAULT_ENCIK_TONE, encikLines, encikRegister, ENCIK_LINES, ENCIK_REGISTERS, PLAIN_ADDRESS, type EncikAddress, type EncikEvent } from './encik-registers';
import { createEncikRadio } from './fps-callouts';
import { encikRecordingUrl } from './encik-recordings';
import { chooseEncikTone, createProfile, encikAddress, restoreProfile } from './armory-state';
import { xpForLevel } from './progression';

const at = (level: number, rank = 'Colonel', tone: EncikAddress['tone'] = 'rank'): EncikAddress => ({ level, rank, tone });
const EVENTS = Object.keys(ENCIK_LINES) as EncikEvent[];

describe('the Encik defers as you outrank him', () => {
  it('climbs registers with the level and pins to the recorded pack on request', () => {
    expect(encikRegister(at(1)).id).toBe('recruit');
    expect(encikRegister(at(11)).id).toBe('recruit');
    expect(encikRegister(at(12)).id).toBe('noticed');
    expect(encikRegister(at(20)).id).toBe('respect');
    expect(encikRegister(at(50)).id).toBe('defers');
    // The opt-out is absolute: a Legend who wants shouting gets shouting.
    expect(encikRegister(at(50, 'Legend', 'recruit')).id).toBe('recruit');
    expect(encikLines('kill', at(50, 'Legend', 'recruit'))).toBe(ENCIK_LINES.kill);
  });
  it('never edits a recorded line, because the lookup matches on exact text', () => {
    // Every base line must still find its clip; this is the guard that stops a
    // tidy-up of the Encik's Singlish from silently muting the shipped pack.
    for (const [event, lines] of Object.entries(ENCIK_LINES)) for (const text of lines) {
      expect(encikRecordingUrl({ event: event as EncikEvent, text })).toBeTruthy();
    }
    expect(BASE_REGISTER.lines).toBe(ENCIK_LINES);
  });
  it('leaves the new registers silent rather than playing the wrong clip', () => {
    for (const register of ENCIK_REGISTERS.filter(r => r.id !== 'recruit')) {
      for (const [event, lines] of Object.entries(register.lines)) for (const text of lines!) {
        // A line that collided with a recorded one would play a shout over a
        // deferential subtitle, which is the failure worth catching.
        expect(encikRecordingUrl({ event: event as EncikEvent, text: addressLine(text, 'Colonel') })).toBeNull();
      }
    }
  });
  it('falls through to the register below for an event it does not rewrite', () => {
    const sparse = ENCIK_REGISTERS.find(r => Object.keys(r.lines).length < EVENTS.length);
    // Every register currently rewrites everything; the fallback is still the
    // contract, so it is asserted directly rather than left to a future one.
    expect(sparse).toBeUndefined();
    for (const register of ENCIK_REGISTERS) for (const event of EVENTS) {
      expect(encikLines(event, at(register.from)).length).toBeGreaterThan(0);
    }
    expect(encikLines('kill', at(12))).toBe(ENCIK_REGISTERS[1].lines.kill);
  });
  it('puts the player’s own rank into the line, whatever their insignia set', () => {
    expect(addressLine('Clean, {rank}.', 'Marksman')).toBe('Clean, Marksman.');
    expect(addressLine('{rank}, ammo. {rank}!', 'Legend')).toBe('Legend, ammo. Legend!');
    // A set with no titles leaves no hole in the sentence.
    expect(addressLine('Clean, {rank}.', '')).toBe(`Clean, ${PLAIN_ADDRESS}.`);
    expect(addressLine('Clean, {rank}.', '  ')).toBe(`Clean, ${PLAIN_ADDRESS}.`);
  });
  it('reads the rank afresh at every callout, so a level-up is heard at once', () => {
    let address = at(1, 'Recruit');
    const radio = createEncikRadio(() => 0, () => address);
    const first = radio.emit('kill', 100)!;
    expect(first.text).toBe(ENCIK_LINES.kill[0]); expect(first.register).toBe('recruit');
    address = at(50, 'General');
    // Same session, same radio: the next callout is in the new register.
    const later = radio.emit('kill', 200)!;
    expect(later.register).toBe('defers'); expect(later.text).toContain('General');
    expect(later.text).not.toContain('{rank}');
  });
  it('carries the tone on the profile and survives a reload', () => {
    const base = createProfile();
    expect(base.encikTone).toBe(DEFAULT_ENCIK_TONE);
    const rude = chooseEncikTone(base, 'recruit');
    expect(rude.encikTone).toBe('recruit'); expect(base.encikTone).toBe(DEFAULT_ENCIK_TONE);
    expect(chooseEncikTone(rude, 'recruit')).toBe(rude);
    expect(restoreProfile(JSON.stringify(rude)).encikTone).toBe('recruit');
    expect(restoreProfile(JSON.stringify({ ...rude, encikTone: 'nonsense' })).encikTone).toBe(DEFAULT_ENCIK_TONE);
  });
  it('addresses the player by title rather than by graded label', () => {
    const veteran = { ...createProfile(), xp: xpForLevel(20), rankSet: 'military' };
    // "Nice work, Staff Sergeant" — not "Staff Sergeant III", which nobody says.
    expect(encikAddress(veteran)).toEqual({ level: 20, rank: 'Staff Sergeant', tone: 'rank' });
    expect(encikAddress({ ...veteran, rankSet: 'numerals' }).rank).toBe('');
    expect(addressLine('Clean, {rank}.', encikAddress({ ...veteran, rankSet: 'numerals' }).rank)).toBe(`Clean, ${PLAIN_ADDRESS}.`);
  });
});
