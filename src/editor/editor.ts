import type { World } from '../world';
import type { Camera } from '../render/camera';
import type { ComponentKind, Dir } from '../sim/types';
import type { Ghost } from '../render/renderer';
import { placeTemplate, stampTemplate, extractTemplate, type TemplateDef } from '../templates';
import { footprint } from '../sim/geometry';

export type Tool = ComponentKind | 'DELETE' | 'HAND' | 'TEMPLATE' | 'SELECT';

export interface SelRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class Editor {
  tool: Tool = 'WIRE';
  facing: Dir = 0;
  wireColor = 0;
  template: TemplateDef | null = null;
  clipboard: TemplateDef | null = null;
  onUndo: (() => void) | null = null;
  onRedo: (() => void) | null = null;
  onStatus: ((msg: string) => void) | null = null;
  private hover: { x: number; y: number } | null = null;
  private painting = false;
  private panning = false;
  private spaceDown = false;
  private selecting = false;
  private selStart: { x: number; y: number } | null = null;
  private selRect: SelRect | null = null;
  private lastScreen = { x: 0, y: 0 };
  private lastCell = { x: NaN, y: NaN };
  onToolChange: ((tool: Tool, facing: Dir) => void) | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private world: World,
    private cam: Camera,
  ) {
    this.bind();
  }

  /** Current box-selection rectangle (for rendering / save-as-template). */
  selection(): SelRect | null {
    return this.tool === 'SELECT' ? this.selRect : null;
  }

  /** Cell to probe (highlight its net + show value): hover while in 操作 mode. */
  probe(): { x: number; y: number } | null {
    return this.tool === 'HAND' && this.hover ? this.hover : null;
  }

  /** Cells to draw as a translucent placement preview under the cursor. */
  preview(): Ghost[] | null {
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
    if (t !== 'SELECT') this.selRect = null;
    this.onToolChange?.(this.tool, this.facing);
  }

  /** Pick a wire colour and switch to the wire tool. */
  setWireColor(i: number): void {
    this.wireColor = i;
    this.setTool('WIRE');
  }

  /** Select a template to stamp. */
  setTemplate(def: TemplateDef): void {
    this.template = def;
    this.setTool('TEMPLATE');
  }

  /** Extract the components fully inside the current selection as a template. */
  private grabSelection(): TemplateDef | null {
    if (!this.selRect) {
      this.onStatus?.('请先用「框选」(B) 框住元件');
      return null;
    }
    const def = extractTemplate([...this.world.all()], '剪贴板', this.selRect);
    if (def.parts.length === 0) {
      this.onStatus?.('选区内没有元件');
      return null;
    }
    return def;
  }

  /** Delete every component fully inside the current selection. */
  private deleteSelection(): number {
    if (!this.selRect) return 0;
    const r = this.selRect;
    const victims = [...this.world.all()].filter((c) =>
      footprint(c.kind, c.x, c.y, c.facing).every(
        (p) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY,
      ),
    );
    for (const c of victims) this.world.remove(c.x, c.y);
    return victims.length;
  }

  /** Copy the selection and immediately enter the rubber-stamp paste mode. */
  copy(): void {
    const def = this.grabSelection();
    if (!def) return;
    this.clipboard = def;
    this.setTemplate(def); // R 旋转 · 点击连续盖章 · Esc 退出
    this.onStatus?.(`已复制 ${def.parts.length} 个元件 · R 旋转 · 点击盖章 · Esc 退出`);
  }

  cut(): void {
    const def = this.grabSelection();
    if (!def) return;
    this.clipboard = def;
    const n = this.deleteSelection(); // while still SELECT (selRect valid)
    this.setTemplate(def); // enter stamp mode after deleting
    this.onStatus?.(`已剪切 ${n} 个元件 · R 旋转 · 点击盖章 · Esc 退出`);
  }

  paste(): void {
    if (!this.clipboard) {
      this.onStatus?.('剪贴板为空');
      return;
    }
    this.setTemplate(this.clipboard);
    this.onStatus?.('粘贴模式：R 旋转 · 点击盖章 · Esc 退出');
  }

  /** Rotate the selected region 90° in place (anchored at its top-left). */
  rotateSelection(): void {
    const def = this.grabSelection();
    if (!def || !this.selRect) return;
    const r = this.selRect;
    const w = r.maxX - r.minX + 1;
    const h = r.maxY - r.minY + 1;
    this.deleteSelection();
    stampTemplate(this.world, def, r.minX, r.minY, 1);
    // a WxH block becomes HxW, anchored at the same top-left
    this.selRect = { minX: r.minX, minY: r.minY, maxX: r.minX + h - 1, maxY: r.minY + w - 1 };
    this.onStatus?.('已整体旋转选区（再按 R 继续）');
  }

  rotate(): void {
    this.facing = ((this.facing + 1) % 4) as Dir;
    this.onToolChange?.(this.tool, this.facing);
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
        this.world.remove(cell.x, cell.y); // right-click = quick delete
        return;
      }
      if (e.button !== 0) return;

      if (this.tool === 'HAND') {
        if (!this.world.interact(cell.x, cell.y)) this.panning = true;
        return;
      }
      if (this.tool === 'SELECT') {
        this.selecting = true;
        this.selStart = cell;
        this.selRect = { minX: cell.x, minY: cell.y, maxX: cell.x, maxY: cell.y };
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
      if (this.selecting && this.selStart) {
        const c = this.hover;
        this.selRect = {
          minX: Math.min(this.selStart.x, c.x),
          minY: Math.min(this.selStart.y, c.y),
          maxX: Math.max(this.selStart.x, c.x),
          maxY: Math.max(this.selStart.y, c.y),
        };
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
      this.painting = false;
      this.panning = false;
      this.selecting = false;
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

        // Trackpad pinch and ctrl+wheel both arrive with ctrlKey set.
        if (e.ctrlKey) {
          const dy = Math.max(-40, Math.min(40, e.deltaY));
          cam.zoomAt(e.clientX, e.clientY, Math.exp(-dy * 0.01));
          return;
        }

        // Classic mouse wheel: discrete vertical steps, no horizontal travel.
        const mouseWheel = e.deltaMode !== 0 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50);
        if (mouseWheel) {
          cam.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
          return;
        }

        // Trackpad two-finger scroll: pan.
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
        }
        return;
      }
      if (e.repeat) return;

      switch (e.key.toLowerCase()) {
        case 'r':
          if (this.tool === 'SELECT' && this.selRect) this.rotateSelection();
          else this.rotate();
          break;
        // left-hand letter layout
        case 'q':
        case '1':
          this.setTool('WIRE');
          break;
        case 'w':
        case '2':
          this.setTool('AND');
          break;
        case 'e':
        case '3':
          this.setTool('OR');
          break;
        case 'a':
        case '4':
          this.setTool('XOR');
          break;
        case 's':
        case '5':
          this.setTool('NOT');
          break;
        case 'z':
        case '6':
          this.setTool('BUTTON');
          break;
        case 'x':
        case '7':
          this.setTool('LAMP');
          break;
        case 'c':
        case '8':
          this.setTool('CLOCK');
          break;
        case 'g':
        case '9':
          this.setTool('DFF');
          break;
        case 'v':
        case '0':
          this.setTool('BRIDGE');
          break;
        case 't':
          this.setTool('BUS');
          break;
        case 'd':
          this.setTool('DELETE');
          break;
        case 'b':
          this.setTool('SELECT');
          break;
        case 'f':
        case 'escape':
          this.setTool('HAND');
          break;
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.spaceDown = false;
    });
  }
}
