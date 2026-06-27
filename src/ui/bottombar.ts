import type { Editor, Tool } from '../editor/editor';
import { LABEL } from '../sim/geometry';
import { WIRE_COLORS } from '../render/palette';
import { drawToolIcon } from './icons';

interface Entry {
  tool: Tool;
  name: string;
  key: string;
}
type Row = Entry | 'sep' | 'color';

const ROWS: Row[] = [
  { tool: 'SELECT', name: '选择/移动', key: 'V' },
  { tool: 'HAND', name: '操作/探针', key: 'H' },
  'sep',
  { tool: 'WIRE', name: LABEL.WIRE, key: 'W' },
  'color',
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

export interface BottomBarApi {
  refresh: (tool: Tool) => void;
}

export function buildBottomBar(el: HTMLElement, editor: Editor): BottomBarApi {
  const dpr = window.devicePixelRatio || 1;
  const S = 24;
  const buttons = new Map<Tool, HTMLButtonElement>();

  const makeIcon = (tool: Tool, color: string) => {
    const cv = document.createElement('canvas');
    cv.width = S * dpr;
    cv.height = S * dpr;
    cv.style.width = `${S}px`;
    cv.style.height = `${S}px`;
    const ctx = cv.getContext('2d')!;
    ctx.scale(dpr, dpr);
    drawToolIcon(ctx, tool, S, color);
    return cv;
  };

  const tip = (name: string, key: string) => {
    const t = document.createElement('span');
    t.className = 'tip';
    t.innerHTML = `${name}<kbd>${key}</kbd>`;
    return t;
  };

  for (const row of ROWS) {
    if (row === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'tsep';
      el.appendChild(sep);
      continue;
    }
    if (row === 'color') {
      el.appendChild(buildColorButton(editor, S, dpr));
      continue;
    }
    const btn = document.createElement('button');
    btn.className = 'tool';
    btn.appendChild(makeIcon(row.tool, '#e6edf3'));
    btn.appendChild(tip(row.name, row.key));
    btn.onclick = () => editor.setTool(row.tool);
    el.appendChild(btn);
    buttons.set(row.tool, btn);
  }

  const refresh = (tool: Tool) => {
    for (const [t, b] of buttons) b.classList.toggle('active', t === tool);
  };
  refresh(editor.tool);
  return { refresh };
}

function buildColorButton(editor: Editor, S: number, dpr: number): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'tool';

  const dot = document.createElement('span');
  dot.className = 'colordot';
  dot.style.background = WIRE_COLORS[editor.wireColor].on;
  btn.appendChild(dot);
  btn.appendChild(tipEl('线色'));

  const pop = document.createElement('div');
  pop.className = 'pop';
  const swatches: HTMLButtonElement[] = [];
  WIRE_COLORS.forEach((wc, i) => {
    const sw = document.createElement('button');
    sw.className = 'swatch';
    sw.title = wc.name;
    sw.style.background = wc.on;
    sw.onclick = (e) => {
      e.stopPropagation();
      editor.setWireColor(i);
      dot.style.background = wc.on;
      swatches.forEach((s, j) => s.classList.toggle('active', j === i));
      pop.classList.remove('open');
    };
    pop.appendChild(sw);
    swatches.push(sw);
  });
  swatches[editor.wireColor]?.classList.add('active');
  btn.appendChild(pop);

  btn.onclick = (e) => {
    e.stopPropagation();
    pop.classList.toggle('open');
  };
  window.addEventListener('pointerdown', (e) => {
    if (!btn.contains(e.target as Node)) pop.classList.remove('open');
  });
  void S;
  void dpr;
  return btn;
}

function tipEl(name: string): HTMLSpanElement {
  const t = document.createElement('span');
  t.className = 'tip';
  t.textContent = name;
  return t;
}
