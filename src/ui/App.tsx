import { ITEMS } from '../content/items';
import type { ColonistView, SkyStatus, Speed, WorkStatus } from '../protocol';
import { ColonistList, Inspector } from './Inspector';
import { Toolbar, WorkPanel, type Tool } from './Work';

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
  /** Null when the work module is off. */
  work: WorkStatus | null;
  /** Item id to how many the colony has. */
  stock: Record<string, number>;
  tool: Tool | null;
  showWork: boolean;
  showRooms: boolean;
  onSpeed(speed: Speed): void;
  onSelect(id: number | null): void;
  onTool(tool: Tool | null): void;
  onToggleWork(): void;
  onToggleRooms(): void;
  onPriority(id: number, workType: string, priority: number): void;
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
      {props.work && (
        <Toolbar
          tool={props.tool}
          showWork={props.showWork}
          showRooms={props.showRooms}
          jobs={props.work.jobs}
          onTool={props.onTool}
          onToggleWork={props.onToggleWork}
          onToggleRooms={props.onToggleRooms}
        />
      )}
      {props.work && props.showWork && (
        <WorkPanel work={props.work} colonists={props.colonists} onPriority={props.onPriority} onClose={props.onToggleWork} />
      )}
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
      {Object.keys(props.stock).length > 0 && <span class="stock">{describeStock(props.stock)}</span>}
      <span class="muted">{props.tickMs.toFixed(2)} ms/tick</span>
      <span class="muted">modules: {props.modules.length === 0 ? 'none yet' : props.modules.join(', ')}</span>
      {props.error && <span class="error">{props.error}</span>}
      {props.hover && <span class="hover">{props.hover}</span>}
    </div>
  );
}

/** "Steel 300 · Stone 12 · Iron ore 10": stone chunks of every rock count together. */
function describeStock(stock: Record<string, number>): string {
  const parts = new Map<string, number>();
  for (const item of ITEMS) {
    const n = stock[item.id];
    if (!n) continue;
    const name = item.tags.includes('stone') ? 'Stone' : item.name;
    parts.set(name, (parts.get(name) ?? 0) + n);
  }
  return [...parts].map(([name, n]) => `${name} ${n}`).join(' · ');
}
