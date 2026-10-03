import { SKILLS } from '../content/skills';
import type { ColonistView } from '../protocol';

const ACTIVITY: Record<string, string> = {
  idle: 'Standing around',
  wander: 'Wandering',
  walk: 'Walking (ordered)',
  eat: 'Eating a ration',
  sleep: 'Sleeping',
  work: 'Working',
};

function Bar(props: { label: string; value: number }) {
  const pct = Math.round(props.value * 100);
  const tone = props.value < 0.3 ? 'low' : props.value < 0.6 ? 'mid' : 'ok';
  return (
    <div class="need">
      <span>{props.label}</span>
      <span class="bar">
        <span class={`fill ${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span class="pct">{pct}%</span>
    </div>
  );
}

/** Details of the selected colonist. */
export function Inspector(props: { colonist: ColonistView; onClose(): void }) {
  const c = props.colonist;
  const skills = SKILLS.map((s) => ({ name: s.name, level: c.person.skills[s.id] ?? 0 })).sort((a, b) => b.level - a.level);
  return (
    <div class="panel inspector">
      <div class="title">
        <strong>{c.person.name}</strong>
        <span class="muted">, {c.person.age}</span>
        <button class="close" onClick={props.onClose} title="Close">
          ×
        </button>
      </div>
      <div class="muted">{c.task || (ACTIVITY[c.activity] ?? c.activity)}</div>
      <Bar label="Food" value={c.needs.food} />
      <Bar label="Rest" value={c.needs.rest} />
      <div class="muted">Rations left: {c.needs.rations}</div>
      <div class="skills">
        {skills.map((s) => (
          <div key={s.name} class="skill">
            <span>{s.name}</span>
            <span class="bar">
              <span class="fill skillfill" style={{ width: `${(s.level / 20) * 100}%` }} />
            </span>
            <span class="pct">{s.level}</span>
          </div>
        ))}
      </div>
      <div class="hint">Right-click the map to send {c.person.name.split(' ')[0]} there.</div>
    </div>
  );
}

/** Everyone in the colony, with a warning dot when hungry or exhausted. Click to select. */
export function ColonistList(props: { colonists: ColonistView[]; selected: number | null; onSelect(id: number): void }) {
  return (
    <div class="panel roster">
      {props.colonists.map((c) => {
        const warn = c.needs.food < 0.3 || c.needs.rest < 0.25;
        return (
          <button key={c.id} class={c.id === props.selected ? 'active' : ''} onClick={() => props.onSelect(c.id)}>
            {warn && <span class="warn">●</span>} {c.person.name}
          </button>
        );
      })}
    </div>
  );
}
