import type { World } from '../world';
import type { Camera } from '../render/camera';
import type { Component, ComponentKind, Dir } from '../sim/types';
import type { Ghost } from '../render/renderer';
import {
  placeTemplate,
  stampTemplate,
  stampTemplateCells,
  extractComps,
  type TemplateDef,
} from '../templates';
import { footprint, terminalsOf, LABEL } from '../sim/geometry';

export type Tool = ComponentKind | 'DELETE' | 'HAND' | 'TEMPLATE' | 'SELECT';

export interface SelRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class Editor {
  tool: Tool = 'SELECT';
  facing: Dir = 0;
  wireColor = 0;
  template: TemplateDef | null = null;
  clipboard: TemplateDef | null = null;
  onUndo: (() => void) | null = null;
  onRedo: (() => void) | null = null;
  onStatus: ((msg: string) => void) | null = null;
  onPin: ((key: string, label: string) => void) | null = null;
  onContextMenu: ((sx: number, sy: number) => void) | null = null;
  onToolChange: ((tool: Tool, facing: Dir) => void) | null = null;

  private selected = new Set<number>();
  private hover: { x: number; y: number } | null = null;
  private painting = false;
  private panning = false;
  private spaceDown = false;
  // marquee + move state for the SELECT (arrow) tool
  private marqueeing = false;
  private marqueeStart: { x: number; y: number } | null = null;
  private marqueeBase = new Set<number>();
  private marqueeRect: SelRect | null = null;
  private moveArmed = false;
  private moving = false;
  private moveStart = { x: 0, y: 0 };
  private lastScreen = { x: 0, y: 0 };
  private lastCell = { x: NaN, y: NaN };

  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
    private cam: Camera,
  ) {
    this.bind();
  }

  // --- queries used by the renderer / host ---

  selectedIds(): Set<number> {
    return this.selected;
  }

  /** Live components in the selection (also prunes ids that no longer exist). */
  selectedComponents(): Component[] {
    const out: Component[] = [];
    for (const c of this.world.all()) if (this.selected.has(c.id)) out.push(c);
    if (out.length !== this.selected.size) this.selected = new Set(out.map((c) => c.id));
    return out;
  }

  marquee(): SelRect | null {
    return this.marqueeing ? this.marqueeRect : null;
  }

  hasSelection(): boolean {
    return this.selectedComponents().length > 0;
  }

  /** Cell to probe (highlight its net + show value): hover while in 操作 mode. */
  probe(): { x: number; y: number } | null {
    return this.tool === 'HAND' && this.hover ? this.hover : null;
  }

  /** Translucent placement preview under the cursor. */
  preview(): Ghost[] | null {
    if (this.moving && this.hover) {
      const dx = this.hover.x - this.moveStart.x;
      const dy = this.hover.y - this.moveStart.y;
      return this.selectedComponents().map((c) => ({
        kind: c.kind,
        x: c.x + dx,
        y: c.y + dy,
        facing: c.facing,
      }));
    }
    if (!this.hover || this.tool === 'HAND' || this.tool === 'SELECT') return null;
    if (this.tool === 'TEMPLATE') {
      if (!this.template) return null;
      return placeTemplate(this.template, this.hover.x, this.hover.y, this.facing).map((p) => ({
        kind: p.kind,
        x: p.x,
        y: p.y,
        facing: p.facing,
      }));
    }
    return [{ kind: this.tool, x: this.hover.x, y: this.hover.y, facing: this.facing }];
  }

  setTool(t: Tool): void {
    this.tool = t;
    this.onToolChange?.(this.tool, this.facing);
  }

  setWireColor(i: number): void {
    this.wireColor = i;
    this.setTool('WIRE');
  }

  setTemplate(def: TemplateDef): void {
    this.template = def;
    this.setTool('TEMPLATE');
  }

  rotate(): void {
    this.facing = ((this.facing + 1) % 4) as Dir;
    this.onToolChange?.(this.tool, this.facing);
  }

  // --- selection operations (act on the selected object set) ---

  copy(): void {
    const comps = this.selectedComponents();
    if (comps.length === 0) {
      this.onStatus?.('请先用箭头(V)选中元件');
      return;
    }
    this.clipboard = extractComps(comps).def;
    this.onStatus?.(`已复制 ${comps.length} 个元件（Ctrl+V 粘贴）`);
  }

  deleteSelected(): void {
    const comps = this.selectedComponents();
    if (comps.length === 0) return;
    for (const c of comps) this.world.remove(c.x, c.y);
    this.selected.clear();
    this.onStatus?.(`已删除 ${comps.length} 个元件`);
  }

  cut(): void {
    const comps = this.selectedComponents();
    if (comps.length === 0) {
      this.onStatus?.('请先用箭头(V)选中元件');
      return;
    }
    this.clipboard = extractComps(comps).def;
    for (const c of comps) this.world.remove(c.x, c.y);
    this.selected.clear();
    this.onStatus?.(`已剪切 ${comps.length} 个元件（Ctrl+V 粘贴）`);
  }

  paste(): void {
    if (!this.clipboard) {
      this.onStatus?.('剪贴板为空');
      return;
    }
    this.setTemplate(this.clipboard);
    this.onStatus?.('粘贴：移动鼠标，点击放置（R 旋转，Esc 退出）');
  }

  duplicate(): void {
    const comps = this.selectedComponents();
    if (comps.length === 0) return;
    const { def, minX, minY } = extractComps(comps);
    const cells = stampTemplateCells(this.world, def, minX + 1, minY + 1, 0);
    this.reselect(cells);
    this.onStatus?.(`已生成副本（${comps.length} 个元件）`);
  }

  rotateSelection(): void {
    const comps = this.selectedComponents();
    if (comps.length === 0) {
      this.rotate();
      return;
    }
    const { def, minX, minY } = extractComps(comps);
    for (const c of comps) this.world.remove(c.x, c.y);
    const cells = stampTemplateCells(this.world, def, minX, minY, 1);
    this.reselect(cells);
    this.onStatus?.('已旋转选区（再按 R 继续）');
  }

  private reselect(cells: { x: number; y: number }[]): void {
    const ids = new Set<number>();
    for (const p of cells) {
      const c = this.world.get(p.x, p.y);
      if (c) ids.add(c.id);
    }
    this.selected = ids;
  }

  private apply(x: number, y: number): void {
    if (this.tool === 'DELETE') {
      this.world.remove(x, y);
    } else if (this.tool === 'TEMPLATE') {
      if (this.template) stampTemplate(this.world, this.template, x, y, this.facing);
    } else if (this.tool !== 'HAND' && this.tool !== 'SELECT') {
      this.world.place(this.tool, x, y, this.facing, this.wireColor);
    }
  }

  private pinComp(c: Component): void {
    const here = terminalsOf(c).filter((t) => t.x === c.x && t.y === c.y);
    const term =
      here.find((t) => t.role === 'wire' || t.role === 'bus') ??
      here.find((t) => t.role === 'out') ??
      here[0];
    if (term) this.onPin?.(term.key, `${LABEL[c.kind]}${c.id}`);
  }

  private compsInRect(r: SelRect): number[] {
    const ids: number[] = [];
    for (const c of this.world.all()) {
      const hit = footprint(c.kind, c.x, c.y, c.facing).some(
        (p) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY,
      );
      if (hit) ids.push(c.id);
    }
    return ids;
  }

  private bind(): void {
    const cv = this.canvas;

    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.lastScreen = { x: e.clientX, y: e.clientY };
      const cell = this.cam.cellAt(e.clientX, e.clientY);

      if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
        this.panning = true;
        return;
      }
      if (e.button === 2) {
        // right-click: select what's under the cursor, then open the context menu
        const comp = this.world.get(cell.x, cell.y);
        if (comp && !this.selected.has(comp.id)) this.selected = new Set([comp.id]);
        this.onContextMenu?.(e.clientX, e.clientY);
        return;
      }
      if (e.button !== 0) return;

      if (this.tool === 'HAND') {
        const comp = this.world.get(cell.x, cell.y);
        if (e.shiftKey) {
          if (comp) this.pinComp(comp);
          else this.panning = true;
          return;
        }
        if (this.world.interact(cell.x, cell.y)) return;
        if (comp) this.pinComp(comp);
        else this.panning = true;
        return;
      }

      if (this.tool === 'SELECT') {
        const comp = this.world.get(cell.x, cell.y);
        if (e.shiftKey) {
          if (comp) {
            if (this.selected.has(comp.id)) this.selected.delete(comp.id);
            else this.selected.add(comp.id);
          } else {
            this.marqueeing = true;
            this.marqueeStart = cell;
            this.marqueeBase = new Set(this.selected);
            this.marqueeRect = { minX: cell.x, minY: cell.y, maxX: cell.x, maxY: cell.y };
          }
          return;
        }
        if (comp) {
          if (!this.selected.has(comp.id)) this.selected = new Set([comp.id]);
          this.moveArmed = true;
          this.moveStart = cell;
        } else {
          this.selected.clear();
          this.marqueeing = true;
          this.marqueeStart = cell;
          this.marqueeBase = new Set();
          this.marqueeRect = { minX: cell.x, minY: cell.y, maxX: cell.x, maxY: cell.y };
        }
        return;
      }

      this.painting = true;
      this.lastCell = cell;
      this.apply(cell.x, cell.y);
    });

    cv.addEventListener('pointermove', (e) => {
      this.hover = this.cam.cellAt(e.clientX, e.clientY);
      if (this.panning) {
        const dx = e.clientX - this.lastScreen.x;
        const dy = e.clientY - this.lastScreen.y;
        this.cam.cx -= dx / this.cam.px;
        this.cam.cy -= dy / this.cam.px;
        this.lastScreen = { x: e.clientX, y: e.clientY };
        return;
      }
      if (this.moveArmed && this.hover) {
        if (this.hover.x !== this.moveStart.x || this.hover.y !== this.moveStart.y) this.moving = true;
        return;
      }
      if (this.marqueeing && this.marqueeStart && this.hover) {
        const c = this.hover;
        this.marqueeRect = {
          minX: Math.min(this.marqueeStart.x, c.x),
          minY: Math.min(this.marqueeStart.y, c.y),
          maxX: Math.max(this.marqueeStart.x, c.x),
          maxY: Math.max(this.marqueeStart.y, c.y),
        };
        this.selected = new Set([...this.marqueeBase, ...this.compsInRect(this.marqueeRect)]);
        return;
      }
      if (this.painting && this.tool !== 'TEMPLATE') {
        const c = this.hover;
        if (c.x !== this.lastCell.x || c.y !== this.lastCell.y) {
          this.lastCell = c;
          this.apply(c.x, c.y);
        }
      }
    });

    const end = () => {
      if (this.moving && this.hover) {
        const dx = this.hover.x - this.moveStart.x;
        const dy = this.hover.y - this.moveStart.y;
        if (dx !== 0 || dy !== 0) {
          const comps = this.selectedComponents();
          const { def, minX, minY } = extractComps(comps);
          for (const c of comps) this.world.remove(c.x, c.y);
          const cells = stampTemplateCells(this.world, def, minX + dx, minY + dy, 0);
          this.reselect(cells);
        }
      }
      this.painting = false;
      this.panning = false;
      this.marqueeing = false;
      this.moveArmed = false;
      this.moving = false;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => {
      this.hover = null;
    });

    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const cam = this.cam;
        if (e.ctrlKey) {
          const dy = Math.max(-40, Math.min(40, e.deltaY));
          cam.zoomAt(e.clientX, e.clientY, Math.exp(-dy * 0.01));
          return;
        }
        const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50);
        if (mouseWheel) {
          cam.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
          return;
        }
        cam.cx += e.deltaX / cam.px;
        cam.cy += e.deltaY / cam.px;
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        this.spaceDown = true;
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'z' && !e.shiftKey) {
          e.preventDefault();
          this.onUndo?.();
        } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
          e.preventDefault();
          this.onRedo?.();
        } else if (k === 'c') {
          e.preventDefault();
          this.copy();
        } else if (k === 'x') {
          e.preventDefault();
          this.cut();
        } else if (k === 'v') {
          e.preventDefault();
          this.paste();
        } else if (k === 'd') {
          e.preventDefault();
          this.duplicate();
        }
        return;
      }
      if (e.repeat) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        this.deleteSelected();
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'r':
          this.rotateSelection();
          break;
        case 'v':
          this.setTool('SELECT');
          break;
        case 'h':
          this.setTool('HAND');
          break;
        case 'escape':
          this.selected.clear();
          this.setTool('SELECT');
          break;
        case 'w':
          this.setTool('WIRE');
          break;
        case 'a':
          this.setTool('AND');
          break;
        case 'o':
          this.setTool('OR');
          break;
        case 'x':
          this.setTool('XOR');
          break;
        case 'n':
          this.setTool('NOT');
          break;
        case 'b':
          this.setTool('BUTTON');
          break;
        case 'l':
          this.setTool('LAMP');
          break;
        case 'k':
          this.setTool('CLOCK');
          break;
        case 'd':
          this.setTool('DFF');
          break;
        case 'g':
          this.setTool('BRIDGE');
          break;
        case 'u':
          this.setTool('BUS');
          break;
        case 'm':
          this.setTool('MERGE');
          break;
        case 's':
          this.setTool('SPLIT');
          break;
        case 'y':
          this.setTool('DISPLAY');
          break;
        case 'e':
          this.setTool('DELETE');
          break;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.spaceDown = false;
    });
  }
}
