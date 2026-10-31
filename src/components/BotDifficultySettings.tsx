import { useSyncExternalStore } from 'react';
import { BOT_DIFFICULTIES, type BotDifficulty } from '../game/bot-difficulty';
import { getBotDifficulty, setBotDifficulty, subscribeBotDifficulty } from '../game/bot-difficulty-setting';

export default function BotDifficultySettings() {
  const difficulty = useSyncExternalStore(subscribeBotDifficulty, getBotDifficulty, getBotDifficulty);
  return <div className="armory-settings-group">
    <h2>AI difficulty</h2>
    <p>Enemy aim in solo Training and Open World. Saved on this device and applied immediately. Multiplayer uses Normal for everyone.</p>
    <div role="group" aria-label="AI difficulty">
      {(Object.keys(BOT_DIFFICULTIES) as BotDifficulty[]).map(id => <button key={id} type="button" data-difficulty={id} aria-pressed={difficulty === id} onClick={() => setBotDifficulty(id)}>
        <span><strong>{BOT_DIFFICULTIES[id].name}{id === 'normal' ? ' · Default' : ''}</strong><small>{BOT_DIFFICULTIES[id].description}</small></span>
      </button>)}
    </div>
  </div>;
}
