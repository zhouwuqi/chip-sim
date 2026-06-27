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
  | 'DISPLAY';

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
  /** terminal-key -> net index, used by the renderer to colour pins/wires. */
  netOf: Record<string, number>;
}
