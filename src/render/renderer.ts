import type { World } from '../world';
import type { Kernel } from '../sim/kernel';
import type { Component, ComponentKind, Dir } from '../sim/types';
import { DIRS, opposite, terminalsOf, footprint, GATE_SYMBOL } from '../sim/geometry';
import { Camera } from './camera';
import { wireColor } from './palette';

const COL = {
  bg: '#0d1117',
  grid: '#1b222c',
  gridStrong: '#222c38',
  on: '#39d353',
  off: '#30404d',
  wireOff: '#2a3947',
  gateFill: '#1b2531',
  gateBorder: '#3a4756',
  text: '#c9d1d9',
  lampOff: '#3a2e1a',
  lampOn: '#ffd33d',
  bus: '#7ee0ff',
  busOff: '#274655',
  ghost: 'rgba(47,129,247,0.45)',
  ghostStroke: '#2f81f7',
};

export interface Ghost {
  kind: ComponentKind | 'DELETE';
  x: number;
  y: number;
  facing: Dir;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private frame = 0;
  cam = new Camera();

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.cam.viewW = w;
    this.cam.viewH = h;
  }

  private valOf(key: string, k: Kernel): number {
    const net = k.compiled.netOf[key];
    return net === undefined ? 0 : k.value(net);
  }

  draw(
    world: World,
    kernel: Kernel,
    ghosts: Ghost[] | null,
    selRect: { minX: number; minY: number; maxX: number; maxY: number } | null = null,
    probe: { x: number; y: number } | null = null,
  ): void {
    const ctx = this.ctx;
    const cam = this.cam;
    this.frame++;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);

    this.drawGrid();

    // visible cell bounds for culling (margin covers multi-cell footprints)
    const minX = Math.floor(cam.screenToWorldX(0)) - 2;
    const maxX = Math.ceil(cam.screenToWorldX(cam.viewW)) + 2;
    const minY = Math.floor(cam.screenToWorldY(0)) - 2;
    const maxY = Math.ceil(cam.screenToWorldY(cam.viewH)) + 2;

    for (const c of world.all()) {
      if (c.x < minX || c.x > maxX || c.y < minY || c.y > maxY) continue;
      this.drawComponent(c, world, kernel);
    }

    if (probe) this.drawProbe(world, kernel, probe);
    if (ghosts) for (const g of ghosts) this.drawGhost(g);
    if (selRect) this.drawSelection(selRect);
  }

  /** Hover-probe: highlight the whole net under the cursor and read its value. */
  private drawProbe(world: World, kernel: Kernel, cell: { x: number; y: number }): void {
    const comp = world.get(cell.x, cell.y);
    if (!comp) return;
    const here = terminalsOf(comp).filter((t) => t.x === cell.x && t.y === cell.y);
    if (here.length === 0) return;
    // prefer a wire/bus terminal so probing a line traces that line
    const term = here.find((t) => t.role === 'wire' || t.role === 'bus') ?? here[0];
    const net = kernel.compiled.netOf[term.key];
    if (net === undefined) return;

    // collect every cell carrying a terminal on this net
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#ffd33d';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#ffd33d';
    ctx.shadowBlur = 8;
    const seen = new Set<string>();
    for (const c of world.all()) {
      for (const t of terminalsOf(c)) {
        if (kernel.compiled.netOf[t.key] !== net) continue;
        const k = `${t.x},${t.y}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const { sx, sy, s } = this.cellRect(t.x, t.y);
        ctx.strokeRect(sx + 2, sy + 2, s - 4, s - 4);
      }
    }
    ctx.restore();

    // value readout near the cursor
    const v = kernel.value(net);
    const bus = term.role === 'bus';
    const label = bus ? `值 = ${v}  (0x${v.toString(16).toUpperCase()})` : `值 = ${v}`;
    const { sx, sy, s } = this.cellRect(cell.x, cell.y);
    ctx.font = '12px ui-monospace, monospace';
    const tw = ctx.measureText(label).width;
    const bx = sx + s + 6;
    const by = sy - 4;
    ctx.fillStyle = 'rgba(13,17,23,0.92)';
    ctx.strokeStyle = '#ffd33d';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, tw + 12, 20, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffd33d';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + 6, by + 11);
  }

  private drawSelection(r: { minX: number; minY: number; maxX: number; maxY: number }): void {
    const ctx = this.ctx;
    const tl = this.cellRect(r.minX, r.minY);
    const w = (r.maxX - r.minX + 1) * tl.s;
    const h = (r.maxY - r.minY + 1) * tl.s;
    ctx.fillStyle = 'rgba(47,129,247,0.12)';
    ctx.fillRect(tl.sx, tl.sy, w, h);
    ctx.strokeStyle = '#2f81f7';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(tl.sx + 0.5, tl.sy + 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
  }

  private drawGrid(): void {
    const ctx = this.ctx;
    const cam = this.cam;
    const px = cam.px;
    if (px < 6) return; // too zoomed out to bother
    const x0 = Math.floor(cam.screenToWorldX(0));
    const x1 = Math.ceil(cam.screenToWorldX(cam.viewW));
    const y0 = Math.floor(cam.screenToWorldY(0));
    const y1 = Math.ceil(cam.screenToWorldY(cam.viewH));
    ctx.lineWidth = 1;
    for (let x = x0; x <= x1; x++) {
      const sx = Math.round(cam.worldToScreenX(x));
      ctx.strokeStyle = x % 5 === 0 ? COL.gridStrong : COL.grid;
      ctx.beginPath();
      ctx.moveTo(sx + 0.5, 0);
      ctx.lineTo(sx + 0.5, cam.viewH);
      ctx.stroke();
    }
    for (let y = y0; y <= y1; y++) {
      const sy = Math.round(cam.worldToScreenY(y));
      ctx.strokeStyle = y % 5 === 0 ? COL.gridStrong : COL.grid;
      ctx.beginPath();
      ctx.moveTo(0, sy + 0.5);
      ctx.lineTo(cam.viewW, sy + 0.5);
      ctx.stroke();
    }
  }

  private cellRect(x: number, y: number): { sx: number; sy: number; s: number } {
    const cam = this.cam;
    return { sx: cam.worldToScreenX(x), sy: cam.worldToScreenY(y), s: cam.px };
  }

  private drawComponent(c: Component, world: World, kernel: Kernel): void {
    switch (c.kind) {
      case 'WIRE':
        this.drawWire(c, world, kernel);
        break;
      case 'BUTTON':
        this.drawButton(c, kernel);
        break;
      case 'LAMP':
        this.drawLamp(c, kernel);
        break;
      case 'CLOCK':
        this.drawClock(c, kernel);
        break;
      case 'BRIDGE':
        this.drawBridge(c, world, kernel);
        break;
      case 'BUS':
        this.drawBus(c, world, kernel);
        break;
      case 'DISPLAY':
        this.drawDisplay(c, kernel);
        break;
      default:
        this.drawGate(c, kernel);
    }
  }

  /** Marching-ants dash so powered lines look like flowing signal. */
  private flowDash(s: number): void {
    const dash = Math.max(3, s * 0.22);
    this.ctx.setLineDash([dash, dash * 0.8]);
    this.ctx.lineDashOffset = -(this.frame * 0.6);
  }

  private drawWire(c: Component, world: World, kernel: Kernel): void {
    const ctx = this.ctx;
    const { sx, sy, s } = this.cellRect(c.x, c.y);
    const cxp = sx + s / 2;
    const cyp = sy + s / 2;
    const on = this.valOf(`w:${c.id}`, kernel);
    const col = wireColor(c.color);
    const paint = on ? col.on : col.off;
    ctx.strokeStyle = paint;
    ctx.lineWidth = Math.max(2, s * 0.16);
    ctx.lineCap = 'round';
    if (on) this.flowDash(s);

    let armDrawn = false;
    for (let e = 0; e < 4; e++) {
      const d = DIRS[e];
      const nx = c.x + d.x;
      const ny = c.y + d.y;
      const n = world.get(nx, ny);
      if (!n) continue;
      // mirror the electrical rule: wire-wire only when colours match
      const connects =
        n.kind === 'WIRE'
          ? (n.color ?? 0) === (c.color ?? 0)
          : terminalsOf(n).some((t) => t.x === nx && t.y === ny && t.edge === opposite(e));
      if (connects) {
        ctx.beginPath();
        ctx.moveTo(cxp, cyp);
        ctx.lineTo(cxp + (d.x * s) / 2, cyp + (d.y * s) / 2);
        ctx.stroke();
        armDrawn = true;
      }
    }
    ctx.setLineDash([]);

    // node dot (always, so isolated wires are visible)
    ctx.fillStyle = paint;
    const r = Math.max(2, s * (armDrawn ? 0.1 : 0.16));
    ctx.beginPath();
    ctx.arc(cxp, cyp, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBus(c: Component, world: World, kernel: Kernel): void {
    const ctx = this.ctx;
    const { sx, sy, s } = this.cellRect(c.x, c.y);
    const cxp = sx + s / 2;
    const cyp = sy + s / 2;
    const on = this.valOf(`bus:${c.id}`, kernel) !== 0;
    const paint = on ? COL.bus : COL.busOff;
    ctx.strokeStyle = paint;
    ctx.lineWidth = Math.max(3, s * 0.3);
    ctx.lineCap = 'round';
    if (on) this.flowDash(s);
    let arm = false;
    for (let e = 0; e < 4; e++) {
      const d = DIRS[e];
      const nx = c.x + d.x;
      const ny = c.y + d.y;
      const n = world.get(nx, ny);
      if (!n) continue;
      const want = opposite(e);
      if (terminalsOf(n).some((t) => t.x === nx && t.y === ny && t.edge === want && t.role === 'bus')) {
        ctx.beginPath();
        ctx.moveTo(cxp, cyp);
        ctx.lineTo(cxp + (d.x * s) / 2, cyp + (d.y * s) / 2);
        ctx.stroke();
        arm = true;
      }
    }
    ctx.setLineDash([]);
    ctx.fillStyle = paint;
    const r = Math.max(2.5, s * (arm ? 0.13 : 0.2));
    ctx.beginPath();
    ctx.arc(cxp, cyp, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDisplay(c: Component, kernel: Kernel): void {
    const ctx = this.ctx;
    const { sx, sy, s } = this.cellRect(c.x, c.y);
    const v = this.valOf(`${c.id}:din`, kernel);
    const pad = s * 0.1;
    ctx.fillStyle = '#10171f';
    ctx.strokeStyle = v !== 0 ? COL.bus : COL.gateBorder;
    ctx.lineWidth = 2;
    roundRect(ctx, sx + pad, sy + pad, s - pad * 2, s - pad * 2, s * 0.12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = v !== 0 ? COL.bus : '#4a5560';
    ctx.font = `bold ${Math.round(s * 0.5)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(v.toString(16).toUpperCase(), sx + s / 2, sy + s / 2 + 1);
  }

  /** Colour of a wire neighbour on the given edges, so the bridge matches it. */
  private axisColor(c: Component, world: World, edges: number[]) {
    for (const e of edges) {
      const d = DIRS[e];
      const n = world.get(c.x + d.x, c.y + d.y);
      if (n && n.kind === 'WIRE') return wireColor(n.color);
    }
    return wireColor(0);
  }

  private drawBridge(c: Component, world: World, kernel: Kernel): void {
    const ctx = this.ctx;
    const { sx, sy, s } = this.cellRect(c.x, c.y);
    const cxp = sx + s / 2;
    const cyp = sy + s / 2;
    const h = this.valOf(`br:${c.id}:h`, kernel);
    const v = this.valOf(`br:${c.id}:v`, kernel);
    const hc = this.axisColor(c, world, [0, 2]); // E / W
    const vc = this.axisColor(c, world, [1, 3]); // S / N
    ctx.lineWidth = Math.max(2, s * 0.16);
    ctx.lineCap = 'round';

    // horizontal line passes straight through
    ctx.strokeStyle = h ? hc.on : hc.off;
    ctx.beginPath();
    ctx.moveTo(sx, cyp);
    ctx.lineTo(sx + s, cyp);
    ctx.stroke();

    // vertical line hops over the horizontal one (so they clearly don't connect)
    const r = s * 0.17;
    ctx.strokeStyle = v ? vc.on : vc.off;
    ctx.beginPath();
    ctx.moveTo(cxp, sy);
    ctx.lineTo(cxp, cyp - r);
    ctx.arc(cxp, cyp, r, -Math.PI / 2, Math.PI / 2, false);
    ctx.lineTo(cxp, sy + s);
    ctx.stroke();
  }

  private drawButton(c: Component, kernel: Kernel): void {
    const ctx = this.ctx;
    const { sx, sy, s } = this.cellRect(c.x, c.y);
    const on = this.valOf(`b:${c.id}`, kernel);
    const pad = s * 0.16;
    ctx.fillStyle = on ? COL.on : '#243240';
    ctx.strokeStyle = on ? COL.on : COL.gateBorder;
    ctx.lineWidth = 2;
    roundRect(ctx, sx + pad, sy + pad, s - pad * 2, s - pad * 2, s * 0.18);
    ctx.fill();
    ctx.stroke();
    this.label(c.x, c.y, on ? '1' : '0', on ? '#06210d' : COL.text);
  }

  private drawLamp(c: Component, kernel: Kernel): void {
    const ctx = this.ctx;
    const { sx, sy, s } = this.cellRect(c.x, c.y);
    const on = this.valOf(`l:${c.id}`, kernel);
    const cxp = sx + s / 2;
    const cyp = sy + s / 2;
    if (on) {
      const grad = ctx.createRadialGradient(cxp, cyp, 1, cxp, cyp, s * 0.6);
      grad.addColorStop(0, 'rgba(255,211,61,0.9)');
      grad.addColorStop(1, 'rgba(255,211,61,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(sx - s * 0.2, sy - s * 0.2, s * 1.4, s * 1.4);
    }
    ctx.beginPath();
    ctx.arc(cxp, cyp, s * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = on ? COL.lampOn : COL.lampOff;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = on ? '#fff3b0' : COL.gateBorder;
    ctx.stroke();
  }

  private drawGate(c: Component, kernel: Kernel): void {
    const ctx = this.ctx;
    const cells = footprint(c.kind, c.x, c.y, c.facing);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of cells) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const tl = this.cellRect(minX, minY);
    const s = tl.s;
    const bx = tl.sx;
    const by = tl.sy;
    const bw = (maxX - minX + 1) * s;
    const bh = (maxY - minY + 1) * s;
    const pad = s * 0.12;
    ctx.fillStyle = COL.gateFill;
    ctx.strokeStyle = COL.gateBorder;
    ctx.lineWidth = 2;
    roundRect(ctx, bx + pad, by + pad, bw - pad * 2, bh - pad * 2, s * 0.14);
    ctx.fill();
    ctx.stroke();

    // pins coloured by signal
    for (const t of terminalsOf(c)) {
      const cr = this.cellRect(t.x, t.y);
      const ccx = cr.sx + s / 2;
      const ccy = cr.sy + s / 2;
      const d = DIRS[t.edge];
      const px = ccx + (d.x * s) / 2;
      const py = ccy + (d.y * s) / 2;
      const on = this.valOf(t.key, kernel);
      const bus = t.role === 'bus';
      if (t.role === 'out' || bus) {
        ctx.strokeStyle = on ? (bus ? COL.bus : COL.on) : COL.off;
        ctx.lineWidth = Math.max(2, s * (bus ? 0.16 : 0.06));
        ctx.beginPath();
        ctx.moveTo(ccx, ccy);
        ctx.lineTo(px, py);
        ctx.stroke();
      }
      ctx.fillStyle = on ? (bus ? COL.bus : COL.on) : COL.off;
      if (bus) {
        ctx.fillRect(px - s * 0.13, py - s * 0.13, s * 0.26, s * 0.26);
      } else {
        ctx.beginPath();
        ctx.arc(px, py, s * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      // clock-edge wedge on the DFF's CLK pin
      if (t.key.endsWith(':clk')) {
        const wedge = s * 0.13;
        const perp = { x: -d.y, y: d.x };
        ctx.fillStyle = COL.text;
        ctx.beginPath();
        ctx.moveTo(px + perp.x * wedge, py + perp.y * wedge);
        ctx.lineTo(px - perp.x * wedge, py - perp.y * wedge);
        ctx.lineTo(px - d.x * wedge * 1.6, py - d.y * wedge * 1.6);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.fillStyle = COL.text;
    ctx.font = `${Math.round(s * 0.34)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(GATE_SYMBOL[c.kind], bx + bw / 2, by + bh / 2 + 1);
  }

  private drawClock(c: Component, kernel: Kernel): void {
    const ctx = this.ctx;
    const { sx, sy, s } = this.cellRect(c.x, c.y);
    const on = this.valOf(`c:${c.id}`, kernel);
    const pad = s * 0.14;
    ctx.fillStyle = on ? COL.on : '#243240';
    ctx.strokeStyle = on ? COL.on : COL.gateBorder;
    ctx.lineWidth = 2;
    roundRect(ctx, sx + pad, sy + pad, s - pad * 2, s - pad * 2, s * 0.16);
    ctx.fill();
    ctx.stroke();

    // square-wave glyph
    const fg = on ? '#06210d' : COL.text;
    ctx.strokeStyle = fg;
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.lineJoin = 'round';
    const w = s * 0.5;
    const h = s * 0.16;
    const x0 = sx + s / 2 - w / 2;
    const ym = sy + s / 2 - s * 0.04;
    ctx.beginPath();
    ctx.moveTo(x0, ym + h);
    ctx.lineTo(x0, ym - h);
    ctx.lineTo(x0 + w * 0.33, ym - h);
    ctx.lineTo(x0 + w * 0.33, ym + h);
    ctx.lineTo(x0 + w * 0.66, ym + h);
    ctx.lineTo(x0 + w * 0.66, ym - h);
    ctx.lineTo(x0 + w, ym - h);
    ctx.stroke();

    // half-period (ticks) so the player sees the speed
    if (s > 24 && c.period) {
      ctx.fillStyle = on ? '#06210d' : '#8b949e';
      ctx.font = `${Math.round(s * 0.2)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${c.period}t`, sx + s / 2, sy + s * 0.74);
    }
  }

  private label(wx: number, wy: number, text: string, color: string, size?: number): void {
    if (!text) return;
    const ctx = this.ctx;
    const { sx, sy, s } = this.cellRect(wx, wy);
    ctx.fillStyle = color;
    ctx.font = `${Math.round(size ?? s * 0.3)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, sx + s / 2, sy + s / 2 + 1);
  }

  private drawGhost(g: Ghost): void {
    const ctx = this.ctx;
    if (g.kind === 'DELETE') {
      const { sx, sy, s } = this.cellRect(g.x, g.y);
      ctx.strokeStyle = '#f85149';
      ctx.lineWidth = 2;
      roundRect(ctx, sx + 3, sy + 3, s - 6, s - 6, 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx + 6, sy + 6);
      ctx.lineTo(sx + s - 6, sy + s - 6);
      ctx.moveTo(sx + s - 6, sy + 6);
      ctx.lineTo(sx + 6, sy + s - 6);
      ctx.stroke();
      return;
    }
    ctx.fillStyle = COL.ghost;
    for (const p of footprint(g.kind, g.x, g.y, g.facing)) {
      const { sx, sy, s } = this.cellRect(p.x, p.y);
      roundRect(ctx, sx + 3, sy + 3, s - 6, s - 6, 4);
      ctx.fill();
    }
    // show facing for directional parts (arrow from the anchor cell)
    if (['AND', 'OR', 'XOR', 'NOT', 'DFF'].includes(g.kind)) {
      const { sx, sy, s } = this.cellRect(g.x, g.y);
      const d = DIRS[g.facing];
      ctx.strokeStyle = COL.ghostStroke;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx + s / 2, sy + s / 2);
      ctx.lineTo(sx + s / 2 + (d.x * s) / 2.4, sy + s / 2 + (d.y * s) / 2.4);
      ctx.stroke();
    }
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
