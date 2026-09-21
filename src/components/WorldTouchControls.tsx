import type { StickVector } from '../game/touch-controls';
import TouchStick from './TouchStick';
import './touch-controls.css';

/**
 * The thumb layer for the walk/drive districts. Fewer commands than the range
 * needs: the stick's own outer ring is the run, and only the car has a button —
 * its brake, which has no equivalent on foot.
 */
export default function WorldTouchControls({ travel, onMove, onLook, onBrake }: {
  travel: 'walk' | 'drive';
  onMove: (stick: StickVector) => void;
  onLook: (stick: StickVector) => void;
  onBrake: (held: boolean) => void;
}) {
  const driving = travel === 'drive';
  return <div className="touch-layer" data-touch-layer={travel}>
    <div className="touch-side is-left"><TouchStick kind="move" label={driving ? 'DRIVE' : 'MOVE'} onChange={onMove} /></div>
    <div className="touch-side is-right">
      {driving && <div className="touch-actions"><button
        type="button" className="touch-button" data-touch-action="brake"
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onBrake(true); }}
        onPointerUp={() => onBrake(false)}
        onPointerCancel={() => onBrake(false)}
        onLostPointerCapture={() => onBrake(false)}
      >Brake</button></div>}
      <div className="touch-primary"><TouchStick kind="look" label={driving ? 'ORBIT' : 'LOOK'} onChange={onLook} /></div>
    </div>
  </div>;
}
