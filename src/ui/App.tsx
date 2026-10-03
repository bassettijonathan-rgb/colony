import type { Speed } from '../protocol';

export interface AppProps {
  seed: number;
  tick: number;
  tickMs: number;
  speed: Speed;
  modules: string[];
  error: string | null;
  onSpeed(speed: Speed): void;
}

const SPEEDS: { speed: Speed; label: string }[] = [
  { speed: 0, label: 'Pause' },
  { speed: 1, label: '1x' },
  { speed: 3, label: '3x' },
];

/** Five in-game seconds per tick. */
function formatTime(tick: number): string {
  const seconds = tick * 5;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function App(props: AppProps) {
  return (
    <div class="topbar">
      <strong>Colony</strong>
      <span>seed {props.seed}</span>
      <span>
        tick {props.tick} ({formatTime(props.tick)})
      </span>
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
    </div>
  );
}
