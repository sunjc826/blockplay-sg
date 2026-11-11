import { useEffect, useRef, useState } from 'react';
import type { ReviewCollection, ReviewDocument } from '../game/level-review';
import { readReviewAccess, REVIEW_ACCESS_KEY, ReviewCloudError, reviewEndpoint, syncReview, tokenFromLink } from '../lib/level-review-cloud';
import { IS_STATIC_SITE } from '../lib/deployment';

export function useLevelReviewCloud(document: ReviewDocument, read: () => ReviewDocument, apply: (document: ReviewDocument) => void, blocked: boolean, collection: ReviewCollection = 'level') {
  const [token, setToken] = useState(() => IS_STATIC_SITE ? '' : readReviewAccess());
  const [status, setStatus] = useState('Browser only');
  const [problem, setProblem] = useState('');
  const latest = useRef({ read, apply, blocked }); latest.current = { read, apply, blocked };
  const trigger = useRef<() => void>(() => {});
  const stop = useRef<() => void>(() => {});
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === REVIEW_ACCESS_KEY) { stop.current(); setToken(tokenFromLink(event.newValue ?? '')); } };
    window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed);
  }, []);
  useEffect(() => {
    if (!token || IS_STATIC_SITE) { setStatus('Browser only'); return; }
    let stopped = false, running = false, again = false, accessDenied = false;
    const controller = new AbortController();
    stop.current = () => { stopped = true; controller.abort(); };
    const run = async () => {
      if (stopped || accessDenied || latest.current.blocked) return;
      if (running) { again = true; return; }
      running = true; setStatus('Syncing…');
      try {
        const result = await syncReview({ token, endpoint: reviewEndpoint(collection), signal: controller.signal,
          read: () => latest.current.read(), apply: data => latest.current.apply(data) });
        if (!stopped) { setProblem(''); setStatus(result.pending ? 'Saved locally · sync pending' : `Cloud saved · revision ${result.revision}`); again ||= result.pending; }
      } catch (error) {
        if (!stopped) {
          accessDenied = error instanceof ReviewCloudError && [401, 403, 409, 413].includes(error.status);
          setStatus(accessDenied ? 'Sync needs attention' : 'Offline · saved locally');
          setProblem(error instanceof Error ? error.message : 'Cloud unavailable. Your browser copy is safe.');
        }
      } finally {
        running = false;
        if (!stopped && again && !accessDenied) { again = false; queueMicrotask(() => void run()); }
      }
    };
    trigger.current = () => { accessDenied = false; void run(); };
    const wake = () => { if (window.document.visibilityState === 'visible') void run(); };
    const timer = window.setInterval(wake, 15_000);
    window.addEventListener('online', wake); window.addEventListener('focus', wake);
    window.document.addEventListener('visibilitychange', wake);
    void run();
    return () => { stopped = true; controller.abort(); clearInterval(timer); trigger.current = () => {}; window.removeEventListener('online', wake); window.removeEventListener('focus', wake); window.document.removeEventListener('visibilitychange', wake); };
  }, [token, collection]);
  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => trigger.current(), 500);
    return () => clearTimeout(timer);
  }, [document, token]);
  function connect(value: string) {
    const next = tokenFromLink(value);
    if (!next) { setProblem('Paste the private collaboration link or its access key.'); return false; }
    try { localStorage.setItem(REVIEW_ACCESS_KEY, next); if (next !== token) { stop.current(); setToken(next); } else trigger.current(); setProblem(''); return true; }
    catch { setProblem('Browser storage is unavailable. Enable storage before connecting.'); return false; }
  }
  function disconnect() {
    try { localStorage.removeItem(REVIEW_ACCESS_KEY); stop.current(); setToken(''); setProblem(''); }
    catch { setProblem('Could not remove saved access. Clear site data to disconnect this browser.'); }
  }
  return { token, status, problem, connect, disconnect, changed: () => { if (token) setStatus('Saved locally · sync pending'); }, retry: () => trigger.current(), available: !IS_STATIC_SITE };
}
