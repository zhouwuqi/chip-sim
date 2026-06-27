import type { Component, ComponentKind, Dir } from './sim/types';
import { footprint } from './sim/geometry';
import type { World } from './world';

// A template is a TRANSPARENT, editable blueprint — stamping it drops real,
// fully-visible components onto the grid (glass-box philosophy: no black boxes).
// Coordinates are relative; the cursor anchors the bounding-box top-left.

export interface TemplatePart {
  kind: ComponentKind;
  dx: number;
  dy: number;
  facing?: Dir;
  color?: number;
  period?: number;
}

export interface TemplateDef {
  name: string;
  desc: string;
  parts: TemplatePart[];
  /** present on user-saved templates so they can be deleted */
  custom?: boolean;
}

// colour indices (see render/palette): 0 green, 1 red, 2 blue, 3 yellow
const GREEN = 0;
const RED = 1;
const BLUE = 2;
const YEL = 3;

// Gates are 2 tall with both inputs on the LEFT. The two input wires sit in
// adjacent cells, so they use different colours (red A / blue B) to stay
// insulated. Output exits on the right.
function compound(name: string, gate: 'AND' | 'OR' | 'XOR', desc: string): TemplateDef {
  return {
    name,
    desc,
    parts: [
      { kind: 'WIRE', dx: -1, dy: 0, color: RED }, // A in
      { kind: 'WIRE', dx: -1, dy: 1, color: BLUE }, // B in
      { kind: gate, dx: 0, dy: 0 },
      { kind: 'NOT', dx: 1, dy: 0 },
      { kind: 'WIRE', dx: 2, dy: 0, color: GREEN }, // out
    ],
  };
}

export const TEMPLATES: TemplateDef[] = [
  compound('NAND 与非', 'AND', '左侧两输入(红A/蓝B)，右侧输出 = NOT(A AND B)'),
  compound('NOR 或非', 'OR', '左侧两输入(红A/蓝B)，右侧输出 = NOT(A OR B)'),
  compound('XNOR 同或', 'XOR', '左侧两输入(红A/蓝B)，右侧输出 = NOT(A XOR B)'),
  {
    name: '半加器',
    desc: 'A(红)、B(蓝)两输入；Sum=(3,0) Carry=(3,3)。Sum=A XOR B, Carry=A AND B',
    parts: [
      // rail A (red): col 0, taps into both gates' top input
      { kind: 'WIRE', dx: 0, dy: 0, color: RED },
      { kind: 'WIRE', dx: 0, dy: 2, color: RED },
      { kind: 'WIRE', dx: 0, dy: 3, color: RED },
      { kind: 'WIRE', dx: 1, dy: 0, color: RED },
      { kind: 'WIRE', dx: 1, dy: 3, color: RED },
      { kind: 'BRIDGE', dx: 0, dy: 1 }, // lets blue B cross red A
      // rail B (blue): col -1, taps into both gates' bottom input
      { kind: 'WIRE', dx: -1, dy: 1, color: BLUE },
      { kind: 'WIRE', dx: -1, dy: 2, color: BLUE },
      { kind: 'WIRE', dx: -1, dy: 3, color: BLUE },
      { kind: 'WIRE', dx: -1, dy: 4, color: BLUE },
      { kind: 'WIRE', dx: 1, dy: 1, color: BLUE },
      { kind: 'WIRE', dx: 0, dy: 4, color: BLUE },
      { kind: 'WIRE', dx: 1, dy: 4, color: BLUE },
      // gates + outputs
      { kind: 'XOR', dx: 2, dy: 0 },
      { kind: 'AND', dx: 2, dy: 3 },
      { kind: 'WIRE', dx: 3, dy: 0, color: GREEN }, // Sum
      { kind: 'WIRE', dx: 3, dy: 3, color: GREEN }, // Carry
    ],
  },
  {
    name: 'T 触发器',
    desc: '每个时钟上升沿翻转一次。底=CLK(黄)输入，右=Q(绿)输出；对时钟二分频',
    parts: [
      { kind: 'DFF', dx: 0, dy: 0 },
      { kind: 'NOT', dx: 0, dy: -1, facing: 1 }, // NOT(Q) -> D
      { kind: 'WIRE', dx: 1, dy: 0 }, // Q
      { kind: 'WIRE', dx: 1, dy: -1 }, // feedback
      { kind: 'WIRE', dx: 1, dy: -2 },
      { kind: 'WIRE', dx: 0, dy: -2 },
      { kind: 'WIRE', dx: 0, dy: 1, color: YEL }, // CLK stub
      { kind: 'WIRE', dx: 2, dy: 0, color: GREEN }, // Q out stub
    ],
  },
];

function rotateRel(dx: number, dy: number, r: Dir): { x: number; y: number } {
  switch (r) {
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

export interface PlacedPart {
  kind: ComponentKind;
  x: number;
  y: number;
  facing: Dir;
  color: number;
}

/** Resolve a template to absolute cells: rotate, then anchor bbox top-left at (ax,ay). */
export function placeTemplate(def: TemplateDef, ax: number, ay: number, rot: Dir): PlacedPart[] {
  const rotated = def.parts.map((p) => {
    const r = rotateRel(p.dx, p.dy, rot);
    return {
      kind: p.kind,
      x: r.x,
      y: r.y,
      facing: (((p.facing ?? 0) + rot) % 4) as Dir,
      color: p.color ?? 0,
    };
  });
  const minX = Math.min(...rotated.map((p) => p.x));
  const minY = Math.min(...rotated.map((p) => p.y));
  return rotated.map((p) => ({ ...p, x: ax + p.x - minX, y: ay + p.y - minY }));
}

/** Build a template from an explicit component list, relative to their top-left. */
export function extractComps(comps: Component[], name = '剪贴板'): { def: TemplateDef; minX: number; minY: number } {
  let minX = Infinity;
  let minY = Infinity;
  for (const c of comps) {
    for (const p of footprint(c.kind, c.x, c.y, c.facing)) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
    }
  }
  if (!isFinite(minX)) {
    minX = 0;
    minY = 0;
  }
  const def: TemplateDef = {
    name,
    desc: '自定义模板',
    custom: true,
    parts: comps.map((c) => ({
      kind: c.kind,
      dx: c.x - minX,
      dy: c.y - minY,
      facing: c.facing,
      color: c.color,
      period: c.period,
    })),
  };
  return { def, minX, minY };
}

/** Stamp a template and return the anchor cell of every placed component. */
export function stampTemplateCells(
  world: World,
  def: TemplateDef,
  ax: number,
  ay: number,
  rot: Dir,
): { x: number; y: number }[] {
  const placed = placeTemplate(def, ax, ay, rot);
  placed.forEach((c, i) => {
    const comp = world.place(c.kind, c.x, c.y, c.facing, c.color);
    const period = def.parts[i].period;
    if (period !== undefined) comp.period = period;
  });
  return placed.map((c) => ({ x: c.x, y: c.y }));
}

export function stampTemplate(world: World, def: TemplateDef, ax: number, ay: number, rot: Dir): void {
  const placed = placeTemplate(def, ax, ay, rot);
  placed.forEach((c, i) => {
    const comp = world.place(c.kind, c.x, c.y, c.facing, c.color);
    const period = def.parts[i].period;
    if (period !== undefined) comp.period = period;
  });
}

/**
 * Build a template from the components fully contained in a selection rect.
 * Coordinates become relative to the selection's top-left.
 */
export function extractTemplate(
  comps: Component[],
  name: string,
  rect: { minX: number; minY: number; maxX: number; maxY: number },
): TemplateDef {
  const inside = comps.filter((c) =>
    footprint(c.kind, c.x, c.y, c.facing).every(
      (p) => p.x >= rect.minX && p.x <= rect.maxX && p.y >= rect.minY && p.y <= rect.maxY,
    ),
  );
  return {
    name,
    desc: '自定义模板',
    custom: true,
    parts: inside.map((c) => ({
      kind: c.kind,
      dx: c.x - rect.minX,
      dy: c.y - rect.minY,
      facing: c.facing,
      color: c.color,
      period: c.period,
    })),
  };
}
