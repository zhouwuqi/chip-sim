import type { Compiled, CompiledGate, Component } from './types';
import { Op, CLOCK_PERIODS, BUS_WIDTH } from './types';
import { DIRS, opposite, terminalsOf } from './geometry';

class UnionFind {
  private parent = new Map<string, string>();

  find(a: string): string {
    if (!this.parent.has(a)) {
      this.parent.set(a, a);
      return a;
    }
    let root = a;
    while (this.parent.get(root)! !== root) root = this.parent.get(root)!;
    // path-compress
    let cur = a;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const cellKey = (x: number, y: number) => `${x},${y}`;

/**
 * Compile the grid of components into a flat netlist.
 *
 * Two adjacent components connect when the edges that touch are both live: a
 * wire side, a driver side, or a matching gate pin. Connected terminals form a
 * net (one entry in the kernel's state array).
 */
interface TermEntry {
  key: string;
  x: number;
  y: number;
  edge: number;
  bus: boolean;
  comp: Component;
}

export function compile(components: Iterable<Component>): Compiled {
  const list = [...components];

  // flatten all terminals (absolute cells) and index them by cell
  const all: TermEntry[] = [];
  const byCell = new Map<string, TermEntry[]>();
  for (const c of list) {
    for (const t of terminalsOf(c)) {
      const e: TermEntry = { key: t.key, x: t.x, y: t.y, edge: t.edge, bus: t.role === 'bus', comp: c };
      all.push(e);
      const ck = cellKey(t.x, t.y);
      const arr = byCell.get(ck);
      if (arr) arr.push(e);
      else byCell.set(ck, [e]);
    }
  }

  const uf = new UnionFind();
  // register every terminal key so singletons (unconnected pins) still get nets
  for (const e of all) uf.find(e.key);

  // join terminals on touching edges of adjacent cells
  for (const t of all) {
    const d = DIRS[t.edge];
    const neighbours = byCell.get(cellKey(t.x + d.x, t.y + d.y));
    if (!neighbours) continue;
    const want = opposite(t.edge);
    for (const nt of neighbours) {
      if (nt.edge !== want) continue;
      // bus terminals only connect to bus terminals (and 1-bit to 1-bit)
      if (t.bus !== nt.bus) continue;
      // wire-to-wire only connects when colours match (different colours are
      // insulated); wires connect to anything else normally.
      if (
        t.comp.kind === 'WIRE' &&
        nt.comp.kind === 'WIRE' &&
        (t.comp.color ?? 0) !== (nt.comp.color ?? 0)
      ) {
        continue;
      }
      uf.union(t.key, nt.key);
    }
  }

  // assign dense net ids
  const netId = new Map<string, number>();
  const netOf: Record<string, number> = {};
  const idOf = (key: string): number => {
    const root = uf.find(key);
    let id = netId.get(root);
    if (id === undefined) {
      id = netId.size;
      netId.set(root, id);
    }
    netOf[key] = id;
    return id;
  };
  // make sure every terminal key is mapped (for the renderer)
  for (const e of all) idOf(e.key);

  const gates: CompiledGate[] = [];
  const sources: Compiled['sources'] = [];
  const lamps: Compiled['lamps'] = [];
  const clocks: Compiled['clocks'] = [];
  const dffs: Compiled['dffs'] = [];
  const merges: Compiled['merges'] = [];
  const splits: Compiled['splits'] = [];
  const displays: Compiled['displays'] = [];
  const registers: Compiled['registers'] = [];
  const tristates: Compiled['tristates'] = [];

  for (const c of list) {
    switch (c.kind) {
      case 'BUTTON':
        sources.push({ net: idOf(`b:${c.id}`), compId: c.id });
        break;
      case 'LAMP':
        lamps.push({ net: idOf(`l:${c.id}`), compId: c.id });
        break;
      case 'CLOCK':
        clocks.push({
          net: idOf(`c:${c.id}`),
          compId: c.id,
          period: c.period ?? CLOCK_PERIODS[2],
        });
        break;
      case 'DFF':
        dffs.push({
          d: idOf(`${c.id}:d`),
          clk: idOf(`${c.id}:clk`),
          q: idOf(`${c.id}:q`),
          compId: c.id,
        });
        break;
      case 'NOT': {
        const a = idOf(`${c.id}:in0`);
        gates.push({ op: Op.NOT, a, b: a, out: idOf(`${c.id}:out`) });
        break;
      }
      case 'AND':
      case 'OR':
      case 'XOR': {
        const op = c.kind === 'AND' ? Op.AND : c.kind === 'OR' ? Op.OR : Op.XOR;
        gates.push({
          op,
          a: idOf(`${c.id}:in0`),
          b: idOf(`${c.id}:in1`),
          out: idOf(`${c.id}:out`),
        });
        break;
      }
      case 'MERGE': {
        const bits: number[] = [];
        for (let i = 0; i < BUS_WIDTH; i++) bits.push(idOf(`${c.id}:in${i}`));
        merges.push({ bits, out: idOf(`${c.id}:mout`) });
        break;
      }
      case 'SPLIT': {
        const bits: number[] = [];
        for (let i = 0; i < BUS_WIDTH; i++) bits.push(idOf(`${c.id}:out${i}`));
        splits.push({ in: idOf(`${c.id}:sin`), bits });
        break;
      }
      case 'DISPLAY':
        displays.push({ net: idOf(`${c.id}:din`), width: BUS_WIDTH, compId: c.id });
        break;
      case 'REGISTER':
        registers.push({
          busIn: idOf(`${c.id}:rin`),
          load: idOf(`${c.id}:load`),
          clk: idOf(`${c.id}:clk`),
          out: idOf(`${c.id}:rout`),
          compId: c.id,
        });
        break;
      case 'TRISTATE':
        tristates.push({
          in: idOf(`${c.id}:tin`),
          en: idOf(`${c.id}:ten`),
          out: idOf(`${c.id}:tout`),
          compId: c.id,
        });
        break;
      // WIRE / BUS / BRIDGE have no behaviour; they only contribute connectivity.
    }
  }

  return {
    numNets: netId.size,
    gates,
    sources,
    lamps,
    clocks,
    dffs,
    merges,
    splits,
    displays,
    registers,
    tristates,
    netOf,
  };
}
