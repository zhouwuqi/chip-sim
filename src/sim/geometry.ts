import type { Component, ComponentKind, Dir } from './types';
import { BUS_WIDTH } from './types';

/** Unit step for each edge index. 0=E, 1=S, 2=W, 3=N. */
export const DIRS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

export function opposite(edge: number): Dir {
  return ((edge + 2) % 4) as Dir;
}

function rotEdge(edge: number, facing: Dir): Dir {
  return ((edge + facing) % 4) as Dir;
}

/** Rotate a relative cell offset by `facing` (90° steps, clockwise, y-down). */
function rotCell(dx: number, dy: number, facing: Dir): { x: number; y: number } {
  switch (facing) {
    case 1:
      return { x: -dy, y: dx };
    case 2:
      return { x: -dx, y: -dy };
    case 3:
      return { x: dy, y: -dx };
    default:
      return { x: dx, y: dy };
  }
}

// Component heights (in cells). 2-input gates are 2 tall (inputs stacked on the
// left); MERGE/SPLIT are BUS_WIDTH tall (one cell per bit).
export function heightOf(kind: ComponentKind): number {
  if (kind === 'AND' || kind === 'OR' || kind === 'XOR') return 2;
  if (kind === 'MERGE' || kind === 'SPLIT') return BUS_WIDTH;
  return 1;
}

/** Absolute cells a component occupies (stacked vertically in local frame). */
export function footprint(kind: ComponentKind, x: number, y: number, facing: Dir): { x: number; y: number }[] {
  const h = heightOf(kind);
  if (h <= 1) return [{ x, y }];
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < h; i++) {
    const r = rotCell(0, i, facing);
    cells.push({ x: x + r.x, y: y + r.y });
  }
  return cells;
}

export type TerminalRole = 'wire' | 'in' | 'out' | 'bus';

interface LocalPort {
  dx: number;
  dy: number;
  edge: Dir;
  role: TerminalRole;
  tag: string;
  inputIndex?: number;
}

function localPorts(kind: ComponentKind): LocalPort[] {
  switch (kind) {
    case 'WIRE':
      return ([0, 1, 2, 3] as Dir[]).map((e) => ({ dx: 0, dy: 0, edge: e, role: 'wire', tag: 'w' }));
    case 'BUTTON':
      return ([0, 1, 2, 3] as Dir[]).map((e) => ({ dx: 0, dy: 0, edge: e, role: 'out', tag: 'b' }));
    case 'LAMP':
      return ([0, 1, 2, 3] as Dir[]).map((e) => ({ dx: 0, dy: 0, edge: e, role: 'in', tag: 'l' }));
    case 'CLOCK':
      return ([0, 1, 2, 3] as Dir[]).map((e) => ({ dx: 0, dy: 0, edge: e, role: 'out', tag: 'c' }));
    case 'BRIDGE':
      return [
        { dx: 0, dy: 0, edge: 0, role: 'wire', tag: 'h' }, // E
        { dx: 0, dy: 0, edge: 2, role: 'wire', tag: 'h' }, // W
        { dx: 0, dy: 0, edge: 1, role: 'wire', tag: 'v' }, // S
        { dx: 0, dy: 0, edge: 3, role: 'wire', tag: 'v' }, // N
      ];
    case 'NOT':
      return [
        { dx: 0, dy: 0, edge: 2, role: 'in', tag: 'in0', inputIndex: 0 },
        { dx: 0, dy: 0, edge: 0, role: 'out', tag: 'out' },
      ];
    case 'DFF':
      return [
        { dx: 0, dy: 0, edge: 3, role: 'in', tag: 'd', inputIndex: 0 }, // D: top
        { dx: 0, dy: 0, edge: 1, role: 'in', tag: 'clk', inputIndex: 1 }, // CLK: bottom
        { dx: 0, dy: 0, edge: 0, role: 'out', tag: 'q' }, // Q: right
      ];
    case 'AND':
    case 'OR':
    case 'XOR':
      return [
        { dx: 0, dy: 0, edge: 2, role: 'in', tag: 'in0', inputIndex: 0 }, // top-left
        { dx: 0, dy: 1, edge: 2, role: 'in', tag: 'in1', inputIndex: 1 }, // bottom-left
        { dx: 0, dy: 0, edge: 0, role: 'out', tag: 'out' }, // right
      ];
    case 'BUS':
      return ([0, 1, 2, 3] as Dir[]).map((e) => ({ dx: 0, dy: 0, edge: e, role: 'bus', tag: 'bus' }));
    case 'DISPLAY':
      return ([0, 1, 2, 3] as Dir[]).map((e) => ({ dx: 0, dy: 0, edge: e, role: 'bus', tag: 'din' }));
    case 'MERGE': {
      // BUS_WIDTH 1-bit inputs on the left (top..bottom) -> one bus out on the right
      const ports: LocalPort[] = [];
      for (let i = 0; i < BUS_WIDTH; i++) {
        ports.push({ dx: 0, dy: i, edge: 2, role: 'in', tag: `in${i}`, inputIndex: i });
      }
      ports.push({ dx: 0, dy: 0, edge: 0, role: 'bus', tag: 'mout' });
      return ports;
    }
    case 'SPLIT': {
      const ports: LocalPort[] = [{ dx: 0, dy: 0, edge: 2, role: 'bus', tag: 'sin' }];
      for (let i = 0; i < BUS_WIDTH; i++) {
        ports.push({ dx: 0, dy: i, edge: 0, role: 'out', tag: `out${i}` });
      }
      return ports;
    }
  }
}

function keyFor(tag: string, id: number): string {
  switch (tag) {
    case 'w':
      return `w:${id}`;
    case 'b':
      return `b:${id}`;
    case 'l':
      return `l:${id}`;
    case 'c':
      return `c:${id}`;
    case 'h':
      return `br:${id}:h`;
    case 'v':
      return `br:${id}:v`;
    case 'bus':
      return `bus:${id}`;
    default:
      return `${id}:${tag}`; // in0 / in1 / out / d / clk / q / mout / sin / din
  }
}

export interface Terminal {
  /** Union-find key. Terminals sharing a key are the same electrical node. */
  key: string;
  /** Absolute cell the port sits on. */
  x: number;
  y: number;
  /** Global edge (already rotated by facing). */
  edge: Dir;
  role: TerminalRole;
  inputIndex?: number;
}

/** All electrical terminals a component exposes, in absolute coordinates. */
export function terminalsOf(c: Component): Terminal[] {
  return localPorts(c.kind).map((p) => {
    const rc = rotCell(p.dx, p.dy, c.facing);
    return {
      key: keyFor(p.tag, c.id),
      x: c.x + rc.x,
      y: c.y + rc.y,
      edge: rotEdge(p.edge, c.facing),
      role: p.role,
      inputIndex: p.inputIndex,
    };
  });
}

export const GATE_SYMBOL: Record<ComponentKind, string> = {
  AND: '&',
  OR: '≥1',
  XOR: '=1',
  NOT: '1',
  DFF: 'D',
  WIRE: '',
  BUTTON: '',
  LAMP: '',
  CLOCK: '',
  BRIDGE: '',
  BUS: '',
  MERGE: 'M',
  SPLIT: 'S',
  DISPLAY: '',
};

export const LABEL: Record<ComponentKind, string> = {
  WIRE: '线',
  AND: 'AND',
  OR: 'OR',
  XOR: 'XOR',
  NOT: 'NOT',
  BUTTON: '按钮',
  LAMP: '灯',
  CLOCK: '时钟',
  DFF: '触发器',
  BRIDGE: '桥',
  BUS: '总线',
  MERGE: '合并',
  SPLIT: '拆分',
  DISPLAY: '显示',
};
