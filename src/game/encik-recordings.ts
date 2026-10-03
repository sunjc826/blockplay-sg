import manifest from '../audio/encik/manifest.json';
import rankManifest from '../audio/encik/rank-manifest.json';
import type { EncikCallout } from './fps-callouts';

const recordings = new Map([...manifest.clips, ...rankManifest.clips].map(clip => [`${clip.event}\n${clip.text}`, clip.file]));
export function encikRecordingUrl(line: Pick<EncikCallout, 'event' | 'text'>, base = import.meta.env.BASE_URL) {
  const file = recordings.get(`${line.event}\n${line.text}`);
  return file ? `${base}audio/encik/${file}` : null;
}
