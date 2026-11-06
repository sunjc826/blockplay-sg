import DebugApp from './DebugApp';
import GameMenu from './components/GameMenu';
import PwaUpdateModal from './components/PwaUpdateModal';
import PerfOverlay from './components/PerfOverlay';
import RouteShift from './components/RouteShift';
import { useRoute } from './lib/routes';
import { lazy, Suspense } from 'react';

const FactionDesigns = lazy(() => import('./components/FactionDesigns'));

export default function App() {
  const route = useRoute();
  if (route === 'faction-designs') return <><Suspense fallback={<p>Loading faction studies…</p>}><FactionDesigns /></Suspense><PwaUpdateModal /></>;
  return <>{route === 'debug' ? <DebugApp /> : <GameMenu screen={route} />}<PwaUpdateModal /><RouteShift route={route} /><PerfOverlay /></>;
}
