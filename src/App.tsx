import NavigationConfirm from './components/NavigationConfirm';
import DebugApp from './DebugApp';
import GameMenu from './components/GameMenu';
import PwaUpdateModal from './components/PwaUpdateModal';
import PerfOverlay from './components/PerfOverlay';
import RouteShift from './components/RouteShift';
import { useRoute } from './lib/routes';
import { lazy, Suspense } from 'react';

const PropDesigns = lazy(() => import('./components/PropDesigns'));
const FactionDesigns = lazy(() => import('./components/FactionDesigns'));

export default function App() {
  const route = useRoute();
  if (route === 'prop-designs') return <><Suspense fallback={<p>Loading street props…</p>}><PropDesigns /></Suspense><PwaUpdateModal /></>;
  if (route === 'faction-designs') return <><Suspense fallback={<p>Loading faction studies…</p>}><FactionDesigns /></Suspense><PwaUpdateModal /></>;
  return <>{route === 'debug' ? <DebugApp /> : <GameMenu screen={route} />}<NavigationConfirm /><PwaUpdateModal /><RouteShift route={route} /><PerfOverlay /></>;
}
