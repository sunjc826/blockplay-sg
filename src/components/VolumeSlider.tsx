export default function VolumeSlider({ volume, onChange }: { volume: number; onChange: (volume: number) => void }) {
  const percent = Math.round(volume * 100), text = percent === 0 ? 'Off' : `${percent}%`;
  return <label className="armory-volume">
    <span>Volume</span>
    <input type="range" min={0} max={100} step={5} value={percent} aria-valuetext={text} onChange={event => onChange(Number(event.currentTarget.value) / 100)} />
    <output>{text}</output>
  </label>;
}
