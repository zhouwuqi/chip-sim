import type { Compiled } from './types';
import { Op } from './types';

/**
 * Synchronous delta-step simulator (the Turing-Complete model).
 *
 * Every tick, all gates read the PREVIOUS snapshot (`cur`) and write the next
 * one (`next`), then we swap. This makes feedback loops (latches, flip-flops)
 * work naturally, is fully deterministic, and gives each gate a 1-tick delay.
 * A whole connected wire run is a single net, so wire length adds no delay.
 */
export class Kernel {
  // net values are integers: 1-bit nets hold 0/1, bus nets hold an N-bit number
  private cur: Int32Array;
  private next: Int32Array;
  compiled: Compiled;
  /** Looks up a button's live on/off state by component id. */
  private buttonState: (compId: number) => boolean;

  // sequential state, indexed parallel to compiled.clocks / compiled.dffs
  private clkPhase: Int32Array;
  private clkOut: Uint8Array;
  private dffPrevClk: Uint8Array;
  private dffQ: Uint8Array;

  constructor(compiled: Compiled, buttonState: (compId: number) => boolean) {
    this.compiled = compiled;
    this.buttonState = buttonState;
    this.cur = new Int32Array(compiled.numNets);
    this.next = new Int32Array(compiled.numNets);
    this.clkPhase = new Int32Array(compiled.clocks.length);
    this.clkOut = new Uint8Array(compiled.clocks.length);
    this.dffPrevClk = new Uint8Array(compiled.dffs.length);
    this.dffQ = new Uint8Array(compiled.dffs.length);
  }

  tick(): void {
    const { gates, sources, clocks, dffs, merges, splits } = this.compiled;
    const cur = this.cur;
    const next = this.next;
    next.fill(0);

    // sources: a net is OR of everything driving it
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      if (this.buttonState(s.compId)) next[s.net] = 1;
    }

    // clocks: a free-running square wave, toggling every `period` ticks
    for (let i = 0; i < clocks.length; i++) {
      if (++this.clkPhase[i] >= clocks[i].period) {
        this.clkPhase[i] = 0;
        this.clkOut[i] ^= 1;
      }
      if (this.clkOut[i]) next[clocks[i].net] = 1;
    }

    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      let v: number;
      switch (g.op) {
        case Op.AND:
          v = cur[g.a] & cur[g.b];
          break;
        case Op.OR:
          v = cur[g.a] | cur[g.b];
          break;
        case Op.XOR:
          v = cur[g.a] ^ cur[g.b];
          break;
        case Op.NOT:
          v = cur[g.a] ? 0 : 1;
          break;
      }
      if (v) next[g.out] = 1;
    }

    // D flip-flops: latch D on the rising edge of CLK (reads previous snapshot)
    for (let i = 0; i < dffs.length; i++) {
      const f = dffs[i];
      const clk = cur[f.clk];
      if (clk && !this.dffPrevClk[i]) this.dffQ[i] = (cur[f.d] ? 1 : 0) as 0 | 1;
      this.dffPrevClk[i] = clk;
      if (this.dffQ[i]) next[f.q] = 1;
    }

    // MERGE: pack 1-bit inputs into a bus value
    for (let i = 0; i < merges.length; i++) {
      const m = merges[i];
      let v = 0;
      for (let b = 0; b < m.bits.length; b++) if (cur[m.bits[b]]) v |= 1 << b;
      next[m.out] = v;
    }

    // SPLIT: unpack a bus value into 1-bit outputs
    for (let i = 0; i < splits.length; i++) {
      const sp = splits[i];
      const v = cur[sp.in];
      for (let b = 0; b < sp.bits.length; b++) next[sp.bits[b]] = (v >> b) & 1;
    }

    this.cur = next;
    this.next = cur;
  }

  /** Current value of a net (for rendering). */
  value(net: number): number {
    return this.cur[net];
  }

  state(): Uint8Array {
    return this.cur;
  }
}
