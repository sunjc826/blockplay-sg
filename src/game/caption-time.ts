/** How long a cast caption stays up, from how long it takes to read mid-game. */
export const CAPTION_TIME = {
  /** Time to notice the caption and find its start. */
  lead: 1.5,
  /** Seconds per word. Slower than reading prose: the player is also playing. */
  perWord: .4,
  min: 4,
  max: 16,
  /** Kept on screen this long after a spoken line's audio ends. */
  afterSpeech: 1,
} as const;

/** Seconds on screen for `text`; a spoken line also stays until its audio is over. */
export function captionSeconds(text: string, speechSeconds = 0): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const reading = Math.min(CAPTION_TIME.max, Math.max(CAPTION_TIME.min, CAPTION_TIME.lead + words * CAPTION_TIME.perWord));
  return speechSeconds > 0 ? Math.max(reading, speechSeconds + CAPTION_TIME.afterSpeech) : reading;
}

/**
 * Keep a caption up for its reading time and, when it is being spoken, until the
 * audio is over and a moment more. Returns the cancel for an effect cleanup.
 */
export function holdCaption(text: string, speechDone: () => Promise<unknown>, dismiss: () => void): () => void {
  let cancelled = false, after: ReturnType<typeof setTimeout> | undefined;
  const timer = setTimeout(() => {
    const asked = Date.now();
    void speechDone().then(() => {
      if (cancelled) return;
      // Audio that was still playing when the reading time ran out gets its trailing beat.
      if (Date.now() - asked > 50) after = setTimeout(dismiss, CAPTION_TIME.afterSpeech * 1000);
      else dismiss();
    });
  }, captionSeconds(text) * 1000);
  return () => { cancelled = true; clearTimeout(timer); clearTimeout(after); };
}
