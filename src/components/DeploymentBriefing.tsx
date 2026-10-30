/** The cinematic's clock drives the reveal, so pausing never restarts a line. */
export function deploymentText(text: string, elapsed: number, delay: number, reduced: boolean) {
  return reduced ? text : text.slice(0, Math.max(0, Math.floor((elapsed - delay) * 50)));
}

export default function DeploymentBriefing({ location, time, weather, elapsed, reduced }: {
  location: string; time: string; weather: string; elapsed: number; reduced: boolean;
}) {
  const lines = [`LOCATION  ${location.toUpperCase()}, SINGAPORE`, `TIME      ${time} SGT`, `WEATHER   ${weather.toUpperCase()}`];
  return <div className="deployment-briefing" role="status" aria-label={lines.join('. ')}>
    {lines.map((line, i) => <div className="deployment-briefing-line" data-line={['location', 'time', 'weather'][i]} key={i} aria-hidden="true">
      {deploymentText(line, elapsed, .15 + i * .55, reduced)}
    </div>)}
  </div>;
}
