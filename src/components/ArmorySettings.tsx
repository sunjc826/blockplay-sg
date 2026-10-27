import RankBadge from './RankBadge';
import { progression } from '../game/progression';
import { rankInsignia, rankSets } from '../game/rank-insignia';
import { addressLine, encikLines, encikRegister, type EncikTone } from '../game/encik-registers';
import type { ArmoryStore } from '../game/use-armory';

const TONES = [{ id: 'rank', name: 'Follows your rank' }, { id: 'recruit', name: 'Treats you like a recruit' }] as const;

/** Profile preferences that cost nothing: how your rank is drawn and how the Encik talks to you. */
export default function ArmorySettings({ store }: { store: Pick<ArmoryStore, 'profile' | 'wearRankSet' | 'setEncikTone'> }) {
  const { profile } = store;
  const level = progression(profile.xp), insignia = rankInsignia(level.level, profile.rankSet);
  // A sample in the player's own rank, so the setting shows the joke rather
  // than describing it. `kill` is short and every register rewrites it.
  const encikSample = (tone: EncikTone) => addressLine(encikLines('kill', { level: level.level, rank: insignia.title, tone })[0], insignia.title);
  const encikNow = encikRegister({ level: level.level, rank: insignia.title, tone: profile.encikTone });
  return <section className="armory-settings" aria-label="Profile settings">
    <div className="armory-settings-group">
      <h2>Rank insignia</h2><p>The badge your rank is drawn with, previewed at your level.</p>
      <div role="group" aria-label="Rank insignia set">{rankSets().map(set => {
        const preview = rankInsignia(level.level, set.id);
        return <button key={set.id} data-set={set.id} aria-pressed={profile.rankSet === set.id} title={set.description} onClick={() => store.wearRankSet(set.id)}><RankBadge insignia={preview} size={26} /><span><strong>{set.name}</strong><small>{preview.label}</small></span></button>;
      })}</div>
    </div>
    <div className="armory-settings-group armory-encik">
      <h2>Encik</h2><p>How the range instructor talks to you.</p>
      <div role="group" aria-label="Encik tone">
        {TONES.map(tone => <button key={tone.id} data-tone={tone.id} aria-pressed={profile.encikTone === tone.id} onClick={() => store.setEncikTone(tone.id)}><span><strong>{tone.name}</strong><small>“{encikSample(tone.id)}”</small></span></button>)}
      </div>
      <small className="armory-encik-note">{profile.encikTone === 'recruit' ? 'Recorded pack, every level.' : `${encikNow.name} · ${encikNow.description}`}{profile.encikTone === 'rank' && encikNow.id !== 'recruit' ? ' Not voiced yet, so he subtitles.' : ''}</small>
    </div>
  </section>;
}
