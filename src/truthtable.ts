import { compile } from './sim/compile';
import { Kernel } from './sim/kernel';
import type { Component } from './sim/types';

// Auto truth table for a selected combinational sub-circuit: BUTTONs are the
// inputs, LAMPs the outputs. Enumerate every input combination, settle, read.

export interface TruthTable {
  inputs: string[];
  outputs: string[];
  rows: { in: number[]; out: number[] }[];
}
export type TTResult = TruthTable | { error: string };

const NAMES = 'ABCDEFGH';

export function computeTruthTable(comps: Component[]): TTResult {
  const byPos = (a: Component, b: Component) => a.y - b.y || a.x - b.x;
  const inputs = comps.filter((c) => c.kind === 'BUTTON').sort(byPos);
  const outputs = comps.filter((c) => c.kind === 'LAMP').sort(byPos);
  if (inputs.length === 0) return { error: '选区里没有按钮（输入）' };
  if (outputs.length === 0) return { error: '选区里没有灯（输出）' };
  if (inputs.length > 8) return { error: `输入太多（${inputs.length} 个），最多 8 个` };

  const compiled = compile(comps);
  const state = new Map<number, boolean>();
  const rows: { in: number[]; out: number[] }[] = [];
  const combos = 1 << inputs.length;
  for (let combo = 0; combo < combos; combo++) {
    inputs.forEach((b, i) => state.set(b.id, ((combo >> i) & 1) === 1));
    const ker = new Kernel(compiled, (id) => state.get(id) ?? false); // fresh per row (no carry-over)
    for (let t = 0; t < 64; t++) ker.tick();
    rows.push({
      in: inputs.map((_, i) => (combo >> i) & 1),
      out: outputs.map((l) => (ker.value(compiled.netOf[`l:${l.id}`]) ? 1 : 0)),
    });
  }
  return {
    inputs: inputs.map((_, i) => NAMES[i]),
    outputs: outputs.map((_, i) => `O${i + 1}`),
    rows,
  };
}
