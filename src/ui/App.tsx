import type { ColonistView, SkyStatus, Speed } from '../protocol';
import { ColonistList, Inspector } from './Inspector';

export interface AppProps {
  seed: number;
  tick: number;
  tickMs: number;
  speed: Speed;
  modules: string[];
  /** Biome and hilliness. */
  summary: string;
  sky: SkyStatus | null;
  /** Description of the tile under the mouse. */
  hover: string;
  error: string | null;
  colonists: ColonistView[];
  selected: number | null;
  onSpeed(speed: Speed): void;
  onSelect(id: number | null): void;
}

const SPEEDS: { speed: Speed; label: string }[] = [
  { speed: 0, label: 'Pause' },
  { speed: 1, label: '1x' },
  { speed: 3, label: '3x' },
];

export function App(props: AppProps) {
  const selected = props.colonists.find((c) => c.id === props.selected);
  return (
    <>
      <TopBar {...props} />
      {props.colonists.length > 0 && <ColonistList colonists={props.colonists} selected={props.selected} onSelect={props.onSelect} />}
      {selected && <Inspector colonist={selected} onClose={() => props.onSelect(null)} />}
    </>
  );
}

function TopBar(props: AppProps) {
  return (
    <div class="topbar">
      <strong>Colony</strong>
      <span>seed {props.seed}</span>
      {props.summary && <span>{props.summary}</span>}
      {props.sky ? (
        <span>
          {props.sky.date} · {Math.round(props.sky.temperature)}°C · {props.sky.weather}
        </span>
      ) : (
        <span>tick {props.tick}</span>
      )}
      <span class="speeds">
        {SPEEDS.map((s) => (
          <button key={s.speed} class={props.speed === s.speed ? 'active' : ''} onClick={() => props.onSpeed(s.speed)}>
            {s.label}
          </button>
        ))}
      </span>
      <span class="muted">{props.tickMs.toFixed(2)} ms/tick</span>
      <span class="muted">modules: {props.modules.length === 0 ? 'none yet' : props.modules.join(', ')}</span>
      {props.error && <span class="error">{props.error}</span>}
      {props.hover && <span class="hover">{props.hover}</span>}
    </div>
  );
}
