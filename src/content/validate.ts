/** Small checks for content files, run when the owning module starts and in tests. */

export class ContentError extends Error {}

export function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ContentError(message);
}

export function checkUniqueIds(file: string, entries: readonly { id: string }[]): void {
  const seen = new Set<string>();
  for (const e of entries) {
    check(/^[a-z][a-z0-9-]*$/.test(e.id), `${file}: id "${e.id}" must be lowercase words joined by dashes`);
    check(!seen.has(e.id), `${file}: id "${e.id}" appears twice`);
    seen.add(e.id);
  }
}

export function checkColour(file: string, id: string, colour: string): void {
  check(/^#[0-9a-f]{6}$/i.test(colour), `${file}: "${id}" has colour "${colour}", expected #rrggbb`);
}

export function checkRange(file: string, id: string, field: string, value: number, min: number, max: number): void {
  check(
    Number.isFinite(value) && value >= min && value <= max,
    `${file}: "${id}" ${field} is ${value}, expected ${min} to ${max}`,
  );
}
