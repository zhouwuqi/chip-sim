export const TILE = 30; // base pixels per tile at scale 1

/** Camera centred on world coordinate (cx, cy) with a zoom scale. */
export class Camera {
  cx = 0;
  cy = 0;
  scale = 1;
  viewW = 0;
  viewH = 0;

  get px(): number {
    return TILE * this.scale;
  }

  worldToScreenX(wx: number): number {
    return (wx - this.cx) * this.px + this.viewW / 2;
  }

  worldToScreenY(wy: number): number {
    return (wy - this.cy) * this.px + this.viewH / 2;
  }

  screenToWorldX(sx: number): number {
    return (sx - this.viewW / 2) / this.px + this.cx;
  }

  screenToWorldY(sy: number): number {
    return (sy - this.viewH / 2) / this.px + this.cy;
  }

  cellAt(sx: number, sy: number): { x: number; y: number } {
    return { x: Math.floor(this.screenToWorldX(sx)), y: Math.floor(this.screenToWorldY(sy)) };
  }

  /** Zoom toward a screen point so it stays under the cursor. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const wx = this.screenToWorldX(sx);
    const wy = this.screenToWorldY(sy);
    this.scale = Math.max(0.25, Math.min(4, this.scale * factor));
    // re-anchor so (wx,wy) maps back to (sx,sy)
    this.cx = wx - (sx - this.viewW / 2) / this.px;
    this.cy = wy - (sy - this.viewH / 2) / this.px;
  }
}
