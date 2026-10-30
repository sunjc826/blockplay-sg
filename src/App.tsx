import DebugApp from './DebugApp';
import GameMenu from './components/GameMenu';
import PwaUpdateModal from './components/PwaUpdateModal';
import RouteWipe from './components/RouteWipe';
import { useRoute } from './lib/routes';

export default function App() {
  const route = useRoute();
  return <>{route === 'debug' ? <DebugApp /> : <GameMenu screen={route} />}<PwaUpdateModal /><RouteWipe /></>;
}
