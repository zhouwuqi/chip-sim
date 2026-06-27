import { GATE_SYMBOL } from '../sim/geometry';
import type { Tool } from '../editor/editor';

/** Draw a small icon for a tool onto a canvas context (size S, given colour). */
export function drawToolIcon(ctx: CanvasRenderingContext2D, tool: Tool, S: number, color: string): void {
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.4, S * 0.07);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const box = () => ctx.strokeRect(S * 0.24, S * 0.24, S * 0.52, S * 0.52);
  const sym = (t: string, size = 0.34) => {
    ctx.font = `${Math.round(S * size)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t, S / 2, S / 2 + 1);
  };

  switch (tool) {
    case 'SELECT': {
      ctx.beginPath();
      ctx.moveTo(S * 0.32, S * 0.16);
      ctx.lineTo(S * 0.32, S * 0.82);
      ctx.lineTo(S * 0.46, S * 0.65);
      ctx.lineTo(S * 0.57, S * 0.87);
      ctx.lineTo(S * 0.67, S * 0.82);
      ctx.lineTo(S * 0.56, S * 0.6);
      ctx.lineTo(S * 0.75, S * 0.58);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'HAND': {
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S * 0.24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S * 0.07, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'WIRE': {
      ctx.beginPath();
      ctx.moveTo(S * 0.18, S * 0.72);
      ctx.lineTo(S * 0.46, S * 0.72);
      ctx.lineTo(S * 0.46, S * 0.3);
      ctx.lineTo(S * 0.82, S * 0.3);
      ctx.stroke();
      break;
    }
    case 'BUS': {
      ctx.lineWidth = Math.max(3, S * 0.16);
      ctx.beginPath();
      ctx.moveTo(S * 0.16, S * 0.5);
      ctx.lineTo(S * 0.84, S * 0.5);
      ctx.stroke();
      break;
    }
    case 'BUTTON': {
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S * 0.22, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'LAMP': {
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, S * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      for (let a = 0; a < 8; a++) {
        const an = (a * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(S / 2 + Math.cos(an) * S * 0.26, S / 2 + Math.sin(an) * S * 0.26);
        ctx.lineTo(S / 2 + Math.cos(an) * S * 0.33, S / 2 + Math.sin(an) * S * 0.33);
        ctx.stroke();
      }
      break;
    }
    case 'CLOCK': {
      const ylo = S * 0.62;
      const yhi = S * 0.38;
      ctx.beginPath();
      ctx.moveTo(S * 0.2, ylo);
      ctx.lineTo(S * 0.2, yhi);
      ctx.lineTo(S * 0.4, yhi);
      ctx.lineTo(S * 0.4, ylo);
      ctx.lineTo(S * 0.6, ylo);
      ctx.lineTo(S * 0.6, yhi);
      ctx.lineTo(S * 0.8, yhi);
      ctx.stroke();
      break;
    }
    case 'BRIDGE': {
      const cx = S / 2;
      const cy = S * 0.52;
      const r = S * 0.12;
      ctx.beginPath();
      ctx.moveTo(S * 0.16, cy);
      ctx.lineTo(S * 0.84, cy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, S * 0.82);
      ctx.lineTo(cx, cy + r);
      ctx.arc(cx, cy, r, Math.PI / 2, -Math.PI / 2, false);
      ctx.lineTo(cx, S * 0.18);
      ctx.stroke();
      break;
    }
    case 'DELETE': {
      box();
      ctx.beginPath();
      ctx.moveTo(S * 0.34, S * 0.34);
      ctx.lineTo(S * 0.66, S * 0.66);
      ctx.moveTo(S * 0.66, S * 0.34);
      ctx.lineTo(S * 0.34, S * 0.66);
      ctx.stroke();
      break;
    }
    case 'MERGE':
      box();
      sym('M');
      break;
    case 'SPLIT':
      box();
      sym('S');
      break;
    case 'DISPLAY':
      box();
      sym('8');
      break;
    case 'AND':
    case 'OR':
    case 'XOR':
    case 'NOT':
    case 'DFF':
      box();
      sym(GATE_SYMBOL[tool] || '?', tool === 'OR' || tool === 'XOR' ? 0.26 : 0.34);
      break;
    default:
      box();
  }
}
