import type { ArenaMatch } from '../game/arena-match';
import { matchSummary } from '../game/match-menu';
export default function MatchSummary({match}:{match:ArenaMatch}){
 const info=matchSummary(match);
 return <section className="match-summary" aria-label="Match details"><strong>{info.name}</strong><span>{info.map}</span><p>{info.description}</p><small>{info.rules}</small><small>{info.capacity}</small></section>;
}
