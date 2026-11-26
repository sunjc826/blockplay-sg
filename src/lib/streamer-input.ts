import type { MenuPoll } from '../game/streamer-menu';

export function handleStreamerInput(event:Event,poll:MenuPoll|null,session:{pause():void; stop():void}) {
  if (!event.isTrusted) return;
  const key = event.type === 'keydown' ? (event as KeyboardEvent).key : undefined;
  if (key !== 'Escape') {
    if (poll?.voting) {
      const row = key && /^[1-3]$/.test(key) && poll.rows[Number(key)-1];
      if (row && poll.voting.vote(row.id)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      // Let the viewer move the pointer from anywhere on the screen to a vote button.
      if (event.type === 'pointermove' && !(event as PointerEvent).buttons) return;
    }
    if ((event.target as Element)?.closest?.('[data-streamer-controls]')) return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();
  if (key === 'Escape') session.stop();
  else session.pause();
}
