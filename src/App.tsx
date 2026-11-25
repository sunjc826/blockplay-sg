import { SoloStreamer, StreamerHost, useStreamer, useStreamerActive } from './components/StreamerMode';
import NavigationConfirm from './components/NavigationConfirm';
import DebugApp from './DebugApp';
import GameMenu from './components/GameMenu';
import PwaUpdateModal from './components/PwaUpdateModal';
import PerfOverlay from './components/PerfOverlay';
import RouteShift from './components/RouteShift';
import ShaderWarmBar from './components/ShaderWarmBar';
import { isStreamerRoute, useRoute } from './lib/routes';
import { lazy, Suspense, useLayoutEffect } from 'react';

const PropDesigns = lazy(() => import('./components/PropDesigns'));
const FactionDesigns = lazy(() => import('./components/FactionDesigns'));

export default function App() {
  return <StreamerHost><Routes /></StreamerHost>;
}
function Routes() {
  const route = useRoute(), sandbox = useStreamerActive(), streamer = useStreamer();
  const solo = isStreamerRoute(route);
  useLayoutEffect(() => {
    if (sandbox && !solo) streamer?.stop('Streamer mode is available on solo screens.');
  },[sandbox,solo,streamer]);
  if (route === 'prop-designs') return <><Suspense fallback={<p>Loading street props…</p>}><PropDesigns /></Suspense><PwaUpdateModal /></>;
  if (route === 'faction-designs') return <><Suspense fallback={<p>Loading faction studies…</p>}><FactionDesigns /></Suspense><PwaUpdateModal /></>;
  return <>{route === 'debug' ? <DebugApp /> : <div style={{display:"contents"}} data-ai-solo={solo || undefined}><SoloStreamer.Provider value={solo}><GameMenu screen={route} sandbox={sandbox} /></SoloStreamer.Provider></div>}<NavigationConfirm /><PwaUpdateModal /><RouteShift route={route} /><ShaderWarmBar /><PerfOverlay /></>;
}
