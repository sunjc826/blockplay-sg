import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export function voiceTickets(key: string, now = Date.now) {
  const secret = createHash('sha256').update('blockplay.cast.voice.v1\0').update(key).digest();
  const sign = (personaId: string, line: string, prefix: string) =>
    createHmac('sha256', secret).update(JSON.stringify([personaId, line, prefix])).digest('hex');
  return {
    issue(personaId: string, line: string) {
      const prefix = (now() + 120000) + '.' + randomUUID();
      return prefix + '.' + sign(personaId, line, prefix);
    },
    verify(personaId: string, line: string, ticket: string) {
      const parts = /^(\d{1,16})\.([a-f0-9-]{36})\.([a-f0-9]{64})$/.exec(ticket);
      if (!parts || +parts[1] <= now()) return null;
      const expected = sign(personaId, line, parts[1] + '.' + parts[2]);
      return timingSafeEqual(Buffer.from(parts[3]), Buffer.from(expected)) ? +parts[1] : null;
    },
  };
}
