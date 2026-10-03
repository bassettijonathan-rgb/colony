import { BUILDINGS } from '../content/buildings';
import type { ColonistView, WorkStatus } from '../protocol';

/** Area tools: mine, cancel, or build one of the buildings (`build:<id>`). */
export type Tool = 'mine' | 'cancel' | `build:${string}`;

interface ToolInfo {
  tool: Tool;
  label: string;
  key: string;
  hint: string;
}

const TOOLS: ToolInfo[] = [
  { tool: 'mine', label: 'Mine', key: 'M', hint: 'Drag over rock to mark it for mining' },
  ...BUILDINGS.map((b, k): ToolInfo => {
    const cost = b.cost.map((c) => `${c.count} ${c.tag}`).join(' and ');
    const shape = b.drag === 'outline' ? 'drag a box and walls go round its edge' : 'click or drag to place';
    return { tool: `build:${b.id}`, label: b.name, key: String(k + 1), hint: `${b.name}: ${cost} each; ${shape}` };
  }),
  { tool: 'cancel', label: 'Cancel', key: 'X', hint: 'Drag to remove mining marks and blueprints' },
];

/** The tool a key picks, if any. */
export function toolForKey(key: string): Tool | null {
  return TOOLS.find((t) => t.key.toLowerCase() === key)?.tool ?? null;
}

/** Bottom bar: area tools and the work priorities toggle. */
export function Toolbar(props: {
  tool: Tool | null;
  showWork: boolean;
  jobs: number;
  onTool(tool: Tool | null): void;
  onToggleWork(): void;
}) {
  const active = TOOLS.find((t) => t.tool === props.tool);
  return (
    <div class="panel toolbar">
      {TOOLS.map((t) => (
        <button key={t.tool} class={props.tool === t.tool ? 'active' : ''} title={t.hint} onClick={() => props.onTool(props.tool === t.tool ? null : t.tool)}>
          {t.label} <span class="key">{t.key}</span>
        </button>
      ))}
      <button class={props.showWork ? 'active' : ''} onClick={props.onToggleWork}>
        Work <span class="key">P</span>
      </button>
      <span class="muted">{active ? `${active.hint}. Esc or right-click to stop.` : `${props.jobs} job${props.jobs === 1 ? '' : 's'} waiting or under way`}</span>
    </div>
  );
}

/** Priority shown in a cell, and what a click moves it to: 1 → 2 → 3 → 4 → off → 1. */
const next = (p: number): number => (p === 0 ? 1 : p === 4 ? 0 : p + 1);
const previous = (p: number): number => (p === 1 ? 0 : p === 0 ? 4 : p - 1);

/** Colonists down the side, work types across the top; click a cell to change a priority. */
export function WorkPanel(props: {
  work: WorkStatus;
  colonists: ColonistView[];
  onPriority(id: number, workType: string, priority: number): void;
  onClose(): void;
}) {
  return (
    <div class="panel workpanel">
      <div class="title">
        <strong>Work priorities</strong>
        <button class="close" onClick={props.onClose} title="Close">
          ×
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th />
            {props.work.types.map((t) => (
              <th key={t.id}>{t.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.colonists.map((c) => (
            <tr key={c.id}>
              <td class="who">{c.person.name}</td>
              {props.work.types.map((t) => {
                const p = props.work.priorities[c.id]?.[t.id] ?? 3;
                const skill = t.skill ? (c.person.skills[t.skill] ?? 0) : null;
                return (
                  <td key={t.id}>
                    <button
                      class={`prio p${p}`}
                      title={`${c.person.name}: ${t.name}${skill === null ? '' : ` skill ${skill}`}. Click to raise, right-click to lower.`}
                      onClick={() => props.onPriority(c.id, t.id, next(p))}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        props.onPriority(c.id, t.id, previous(p));
                      }}
                    >
                      {p === 0 ? '·' : p}
                      <span class="skillnum">{skill}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div class="hint">1 is done first, 4 last, · never. Small number: skill.</div>
    </div>
  );
}
