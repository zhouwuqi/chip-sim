import type { Editor, Tool } from '../editor/editor';
import { LABEL } from '../sim/geometry';
import { drawToolIcon } from './icons';

interface Entry {
  tool: Tool;
  name: string;
  key: string;
}
type Row = Entry | 'sep';

const PALETTE: Row[] = [
  { tool: 'SELECT', name: '选择/移动', key: 'V' },
  { tool: 'HAND', name: '操作/探针', key: 'H' },
  'sep',
  { tool: 'WIRE', name: LABEL.WIRE, key: 'W' },
  { tool: 'AND', name: 'AND', key: 'A' },
  { tool: 'OR', name: 'OR', key: 'O' },
  { tool: 'XOR', name: 'XOR', key: 'X' },
  { tool: 'NOT', name: 'NOT', key: 'N' },
  'sep',
  { tool: 'BUTTON', name: LABEL.BUTTON, key: 'B' },
  { tool: 'LAMP', name: LABEL.LAMP, key: 'L' },
  { tool: 'CLOCK', name: LABEL.CLOCK, key: 'K' },
  { tool: 'DFF', name: LABEL.DFF, key: 'D' },
  'sep',
  { tool: 'BRIDGE', name: LABEL.BRIDGE, key: 'G' },
  { tool: 'BUS', name: LABEL.BUS, key: 'U' },
  { tool: 'MERGE', name: LABEL.MERGE, key: 'M' },
  { tool: 'SPLIT', name: LABEL.SPLIT, key: 'S' },
  { tool: 'DISPLAY', name: LABEL.DISPLAY, key: 'Y' },
  'sep',
  { tool: 'DELETE', name: '删除', key: 'E' },
];

export interface PaletteApi {
  refresh: (tool: Tool) => void;
}

export function buildToolPalette(el: HTMLElement, editor: Editor): PaletteApi {
  const dpr = window.devicePixelRatio || 1;
  const S = 26;
  const buttons = new Map<Tool, { btn: HTMLButtonElement; tool: Tool }>();

  for (const row of PALETTE) {
    if (row === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'palette-sep';
      el.appendChild(sep);
      continue;
    }
    const btn = document.createElement('button');
    btn.className = 'palette-btn';
    btn.title = `${row.name} (${row.key})`;
    const cv = document.createElement('canvas');
    cv.width = S * dpr;
    cv.height = S * dpr;
    cv.style.width = `${S}px`;
    cv.style.height = `${S}px`;
    const ctx = cv.getContext('2d')!;
    ctx.scale(dpr, dpr);
    drawToolIcon(ctx, row.tool, S, '#c9d1d9');
    btn.appendChild(cv);
    const kbd = document.createElement('span');
    kbd.className = 'palette-key';
    kbd.textContent = row.key;
    btn.appendChild(kbd);
    btn.onclick = () => editor.setTool(row.tool);
    el.appendChild(btn);
    buttons.set(row.tool, { btn, tool: row.tool });
    // redraw icon in accent when active (handled in refresh by toggling class only;
    // colour stays readable on both states, so a class highlight is enough)
  }

  const refresh = (tool: Tool) => {
    for (const [t, { btn }] of buttons) btn.classList.toggle('active', t === tool);
  };
  refresh(editor.tool);
  return { refresh };
}
