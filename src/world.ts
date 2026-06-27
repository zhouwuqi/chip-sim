import type { Component, ComponentKind, Dir } from './sim/types';
import { CLOCK_PERIODS } from './sim/types';
import { footprint } from './sim/geometry';

const cellKey = (x: number, y: number) => `${x},${y}`;

/** The placed-circuit grid. Components may occupy more than one cell. */
export class World {
  private comps = new Map<number, Component>();
  private occ = new Map<string, number>(); // cell -> component id
  private nextId = 1;
  /** bumped on every structural change so the host knows to recompile. */
  revision = 0;

  get(x: number, y: number): Component | undefined {
    const id = this.occ.get(cellKey(x, y));
    return id === undefined ? undefined : this.comps.get(id);
  }

  all(): IterableIterator<Component> {
    return this.comps.values();
  }

  count(): number {
    return this.comps.size;
  }

  private removeById(id: number): void {
    const c = this.comps.get(id);
    if (!c) return;
    for (const cell of footprint(c.kind, c.x, c.y, c.facing)) {
      this.occ.delete(cellKey(cell.x, cell.y));
    }
    this.comps.delete(id);
  }

  /** Place a component, replacing anything its footprint overlaps. */
  place(kind: ComponentKind, x: number, y: number, facing: Dir, color = 0): Component {
    const cells = footprint(kind, x, y, facing);

    // no-op when dragging over an identical single-cell component
    if (cells.length === 1) {
      const existing = this.get(x, y);
      if (
        existing &&
        existing.x === x &&
        existing.y === y &&
        existing.kind === kind &&
        existing.facing === facing &&
        (kind !== 'WIRE' || existing.color === color)
      ) {
        return existing;
      }
    }

    for (const cell of cells) {
      const id = this.occ.get(cellKey(cell.x, cell.y));
      if (id !== undefined) this.removeById(id);
    }

    const c: Component = { id: this.nextId++, kind, x, y, facing };
    if (kind === 'BUTTON') c.on = false;
    if (kind === 'CLOCK') c.period = CLOCK_PERIODS[2];
    if (kind === 'WIRE') c.color = color;
    this.comps.set(c.id, c);
    for (const cell of cells) this.occ.set(cellKey(cell.x, cell.y), c.id);
    this.revision++;
    return c;
  }

  remove(x: number, y: number): boolean {
    const id = this.occ.get(cellKey(x, y));
    if (id === undefined) return false;
    this.removeById(id);
    this.revision++;
    return true;
  }

  /** "Operate" a component: toggle a button, cycle a clock's speed. */
  interact(x: number, y: number): boolean {
    const c = this.get(x, y);
    if (!c) return false;
    if (c.kind === 'BUTTON') {
      c.on = !c.on; // kernel reads button state live, no recompile needed
      return true;
    }
    if (c.kind === 'CLOCK') {
      const i = CLOCK_PERIODS.indexOf(c.period ?? CLOCK_PERIODS[2]);
      c.period = CLOCK_PERIODS[(i + 1) % CLOCK_PERIODS.length];
      this.revision++; // period flows through compile -> kernel
      return true;
    }
    return false;
  }

  clear(): void {
    this.comps.clear();
    this.occ.clear();
    this.revision++;
  }

  // --- serialisation ---

  serialize(): string {
    return JSON.stringify({
      v: 1,
      components: [...this.comps.values()].map((c) => ({
        k: c.kind,
        x: c.x,
        y: c.y,
        f: c.facing,
        on: c.on ? 1 : 0,
        p: c.period,
        col: c.color,
      })),
    });
  }

  load(json: string): void {
    const data = JSON.parse(json) as {
      components: {
        k: ComponentKind;
        x: number;
        y: number;
        f: Dir;
        on?: number;
        p?: number;
        col?: number;
      }[];
    };
    // validate before touching current state, so a bad import doesn't wipe it
    if (!data || !Array.isArray(data.components)) {
      throw new Error('invalid circuit file');
    }
    this.comps.clear();
    this.occ.clear();
    this.nextId = 1;
    for (const c of data.components) {
      const facing = ((c.f ?? 0) & 3) as Dir;
      this.place(c.k, c.x, c.y, facing, c.col ?? 0);
      const placed = this.get(c.x, c.y);
      if (placed) {
        if (c.k === 'BUTTON') placed.on = !!c.on;
        if (c.k === 'CLOCK') placed.period = c.p ?? CLOCK_PERIODS[2];
      }
    }
    this.revision++;
  }
}
