// Logic analyzer: records the per-tick history of pinned nets so the renderer
// can draw a scrolling timing diagram. Nets are pinned by their stable terminal
// key (e.g. `w:12`); the net id is resolved fresh each sample (survives recompiles).

const CAP = 300; // ticks of history kept per net
const MAX_PINS = 8;

export interface Pin {
  key: string;
  label: string;
}

export class Analyzer {
  pins: Pin[] = [];
  private buf = new Map<string, number[]>();

  has(key: string): boolean {
    return this.pins.some((p) => p.key === key);
  }

  /** Pin or unpin a net. Returns true if it is now pinned. */
  toggle(key: string, label: string): boolean {
    if (this.has(key)) {
      this.pins = this.pins.filter((p) => p.key !== key);
      this.buf.delete(key);
      return false;
    }
    if (this.pins.length >= MAX_PINS) return false;
    this.pins.push({ key, label });
    this.buf.set(key, []);
    return true;
  }

  clear(): void {
    this.pins = [];
    this.buf.clear();
  }

  /** Append the current value of every pinned net. */
  sample(value: (key: string) => number): void {
    for (const p of this.pins) {
      const b = this.buf.get(p.key)!;
      b.push(value(p.key));
      if (b.length > CAP) b.shift();
    }
  }

  buffer(key: string): number[] {
    return this.buf.get(key) ?? [];
  }
}
