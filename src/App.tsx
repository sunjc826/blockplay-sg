import DebugApp from './DebugApp';
import GameMenu from './components/GameMenu';
import { useRoute } from './lib/routes';

export default function App() {
  const route = useRoute();
  return route === 'debug' ? <DebugApp /> : <GameMenu screen={route} />;
}
