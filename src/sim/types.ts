// Core data model for ChipSim.
//
// World model = a grid of 1x1 components (hybrid: grid placement on top, a
// compiled netlist underneath). The simulation never looks at the grid — it
// runs over the flat netlist produced by compile().

/** Rotation / facing in 90° steps, clockwise. 0=E, 1=S, 2=W, 3=N. */
export type Dir = 0 | 1 | 2 | 3;

export type ComponentKind =
  | 'WIRE'
  | 'AND'
  | 'OR'
  | 'XOR'
  | 'NOT'
  | 'BUTTON'
  | 'LAMP'
  | 'CLOCK'
  | 'DFF'
  | 'BRIDGE'
  | 'BUS'
  | 'MERGE'
  | 'SPLIT'
  | 'DISPLAY'
  | 'REGISTER'
  | 'TRISTATE'
  | 'ALU';

export const GATE_KINDS: ComponentKind[] = ['AND', 'OR', 'XOR', 'NOT'];

/** Half-period presets for CLOCK, in ticks (slow -> fast). */
export const CLOCK_PERIODS = [60, 30, 16, 8, 4];

/** Bus width (bits). Fixed for now; variable width is a later phase. */
export const BUS_WIDTH = 4;

export interface Component {
  id: number;
  kind: ComponentKind;
  x: number;
  y: number;
  /** Facing of the output. Only meaningful for gates/DFF; ignored for symmetric parts. */
  facing: Dir;
  /** Toggle state for BUTTON. */
  on?: boolean;
  /** Half-period in ticks for CLOCK. */
  period?: number;
  /** Cosmetic palette index for WIRE (see render/palette). */
  color?: number;
}

/** Logic op codes used by the kernel. */
export enum Op {
  AND = 0,
  OR = 1,
  XOR = 2,
  NOT = 3,
}

export interface CompiledGate {
  op: Op;
  /** Net index of input A. */
  a: number;
  /** Net index of input B (equals `a` for NOT — unused). */
  b: number;
  /** Net index this gate drives. */
  out: number;
}

export interface CompiledSource {
  /** Net this button drives when on. */
  net: number;
  compId: number;
}

export interface CompiledLamp {
  net: number;
  compId: number;
}

export interface CompiledClock {
  net: number;
  compId: number;
  /** Half-period in ticks. */
  period: number;
}

export interface CompiledDff {
  d: number;
  clk: number;
  q: number;
  compId: number;
}

/** MERGE: pack 1-bit input nets into one bus net (bit i = bits[i]). */
export interface CompiledMerge {
  bits: number[];
  out: number;
}

/** SPLIT: unpack a bus net into 1-bit output nets. */
export interface CompiledSplit {
  in: number;
  bits: number[];
}

export interface CompiledDisplay {
  net: number;
  width: number;
  compId: number;
}

/**
 * REGISTER: an N-bit edge-triggered register with a load enable.
 * On the rising edge of `clk`, latches the `busIn` value iff `load` is high;
 * otherwise holds. Its stored value is always driven onto `out` (a bus net) —
 * gate it onto a shared bus through a TRISTATE.
 */
export interface CompiledRegister {
  busIn: number;
  load: number;
  clk: number;
  out: number;
  compId: number;
}

/**
 * TRISTATE: a bus driver. When `en` is high it drives `in` onto `out`;
 * otherwise it contributes nothing (high-Z). Multiple tristates can share one
 * bus net — drivers OR together, so exactly one should be enabled at a time.
 */
export interface CompiledTristate {
  in: number;
  en: number;
  out: number;
  compId: number;
}

/**
 * ALU: combinational 4-bit add/subtract. result = a + b (sub=0) or a - b
 * (sub=1, two's complement). `carry` is the carry-out of the addition (in
 * subtract mode, carry=1 means no borrow). `zero` is high when result == 0.
 * Like a gate, it has a 1-tick delay; gate the result onto a bus with a TRISTATE.
 */
export interface CompiledAlu {
  a: number;
  b: number;
  sub: number;
  out: number;
  carry: number;
  zero: number;
  compId: number;
}

export interface Compiled {
  numNets: number;
  gates: CompiledGate[];
  sources: CompiledSource[];
  lamps: CompiledLamp[];
  clocks: CompiledClock[];
  dffs: CompiledDff[];
  merges: CompiledMerge[];
  splits: CompiledSplit[];
  displays: CompiledDisplay[];
  registers: CompiledRegister[];
  tristates: CompiledTristate[];
  alus: CompiledAlu[];
  /** terminal-key -> net index, used by the renderer to colour pins/wires. */
  netOf: Record<string, number>;
}
