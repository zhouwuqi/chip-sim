import './style.css';
import { World } from './world';
import { Renderer } from './render/renderer';
import { Editor } from './editor/editor';
import { Kernel } from './sim/kernel';
import { compile } from './sim/compile';
import { buildTopNav } from './ui/topnav';
import { buildBottomBar } from './ui/bottombar';
import { History } from './history';
import { Analyzer } from './analyzer';
import { TEMPLATES, extractComps, type TemplateDef } from './templates';
import { computeTruthTable, type TruthTable } from './truthtable';
import type { Component } from './sim/types';

const SAVE_KEY = 'chipsim:autosave';
const TEMPLATES_KEY = 'chipsim:templates';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const topnavEl = document.getElementById('topnav') as HTMLElement;
const bottombarEl = document.getElementById('bottombar') as HTMLElement;
const speedEl = document.getElementById('speed') as HTMLElement;
const hintEl = document.getElementById('hint') as HTMLElement;
const ctxEl = document.getElementById('ctxmenu') as HTMLElement;

const world = new World();
const renderer = new Renderer(canvas);
const editor = new Editor(canvas, world, renderer.cam);

let kernel: Kernel = build();
let lastRevision = world.revision;
let ticksPerFrame = 8;

function build(): Kernel {
  const compiled = compile(world.all());
  const byId = new Map<number, Component>();
  for (const c of world.all()) byId.set(c.id, c);
  return new Kernel(compiled, (id) => byId.get(id)?.on ?? false);
}

function persist(): void {
  try {
    localStorage.setItem(SAVE_KEY, world.serialize());
  } catch {
    /* storage may be unavailable */
  }
}

// --- load: shared URL > previous session > demo ---
function tryLoadFromHash(): boolean {
  const m = location.hash.match(/[#&]c=([^&]+)/);
  if (!m) return false;
  try {
    world.load(decodeURIComponent(escape(atob(m[1]))));
    return true;
  } catch {
    return false;
  }
}
if (!tryLoadFromHash()) {
  const saved = localStorage.getItem(SAVE_KEY);
  if (saved) {
    try {
      world.load(saved);
    } catch {
      seedDemo();
    }
  } else {
    seedDemo();
  }
}
renderer.cam.cx = 3;
renderer.cam.cy = 1;
kernel = build();
lastRevision = world.revision;

const history = new History(world.serialize());

// restore a snapshot (from undo/redo) without re-recording it as a new change
function applyState(s: string): void {
  world.load(s);
  lastRevision = world.revision;
  kernel = build();
  persist();
}
function undo(): void {
  const s = history.undo(world.serialize());
  if (s !== null) {
    applyState(s);
    flash('已撤销');
  } else {
    flash('没有可撤销的操作');
  }
}
function redo(): void {
  const s = history.redo(world.serialize());
  if (s !== null) {
    applyState(s);
    flash('已重做');
  } else {
    flash('没有可重做的操作');
  }
}
editor.onUndo = undo;
editor.onRedo = redo;
editor.onStatus = (m) => flash(m);

const analyzer = new Analyzer();
editor.onPin = (key, label) => {
  const pinned = analyzer.toggle(key, label);
  flash(pinned ? `已钉选 ${label} 到波形` : `已取消钉选 ${label}`);
};

// hidden file input for JSON import
const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'application/json,.json';
fileInput.style.display = 'none';
document.body.appendChild(fileInput);
fileInput.addEventListener('change', async () => {
  const f = fileInput.files?.[0];
  fileInput.value = '';
  if (!f) return;
  try {
    world.load(await f.text());
    flash('已导入电路');
  } catch {
    flash('导入失败：不是有效的电路 JSON');
  }
});

// --- custom templates (saved locally) ---
let customTemplates: TemplateDef[] = [];
try {
  const raw = localStorage.getItem(TEMPLATES_KEY);
  if (raw) customTemplates = JSON.parse(raw) as TemplateDef[];
} catch {
  customTemplates = [];
}
function persistTemplates(): void {
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(customTemplates));
  } catch {
    /* storage may be unavailable */
  }
}

// --- file / share actions ---
const doSave = () => {
  persist();
  flash('已保存到本地');
};
const doLoad = () => {
  const s = localStorage.getItem(SAVE_KEY);
  if (s) {
    world.load(s);
    flash('已读取存档');
  } else flash('没有存档');
};
const doClear = () => {
  if (confirm('清空当前电路？')) {
    world.clear();
    flash('已清空');
  }
};
const doExport = () => {
  const blob = new Blob([world.serialize()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chipsim-circuit.json';
  a.click();
  URL.revokeObjectURL(url);
  flash('已导出 JSON');
};
const doShare = async () => {
  const data = btoa(unescape(encodeURIComponent(world.serialize())));
  const url = `${location.origin}${location.pathname}#c=${data}`;
  try {
    await navigator.clipboard.writeText(url);
    flash('🔗 分享链接已复制到剪贴板');
  } catch {
    location.hash = `c=${data}`;
    flash('🔗 已生成链接（在地址栏，可复制）');
  }
};

// --- selection-context actions (also offered in the right-click menu) ---
const doSaveTemplate = () => {
  const comps = editor.selectedComponents();
  if (comps.length === 0) {
    flash('请先用箭头(V)选中要保存的电路');
    return;
  }
  const name = prompt('模板名称：', `自定义 ${customTemplates.length + 1}`);
  if (!name) return;
  const def = extractComps(comps, name).def;
  customTemplates.push(def);
  persistTemplates();
  nav.refreshTemplates();
  editor.setTemplate(def);
  flash(`已保存模板「${name}」（${def.parts.length} 个元件）`);
};
const doTruthTable = () => {
  const comps = editor.selectedComponents();
  if (comps.length === 0) {
    flash('请先用箭头(V)选中含按钮/灯的电路');
    return;
  }
  const res = computeTruthTable(comps);
  if ('error' in res) flash(res.error);
  else showTruthTable(res);
};
const doDeleteTemplate = (i: number) => {
  const ci = i - TEMPLATES.length;
  if (ci < 0 || ci >= customTemplates.length) {
    flash('内置模板不可删，请先选中自定义(★)模板');
    return;
  }
  const [removed] = customTemplates.splice(ci, 1);
  persistTemplates();
  nav.refreshTemplates();
  flash(`已删除模板「${removed.name}」`);
};

// --- theme accent colour (switchable from the top-right 🎨) ---
const ACCENTS = [
  { name: '青', hex: '#2dd4bf', strong: '#14b8a6' },
  { name: '蓝', hex: '#3b82f6', strong: '#2563eb' },
  { name: '紫', hex: '#a78bfa', strong: '#8b5cf6' },
  { name: '绿', hex: '#22c55e', strong: '#16a34a' },
  { name: '橙', hex: '#fb923c', strong: '#f97316' },
  { name: '粉', hex: '#f472b6', strong: '#ec4899' },
];
const ACCENT_KEY = 'chipsim:accent';
function applyAccent(a: { hex: string; strong: string }): void {
  document.documentElement.style.setProperty('--accent', a.hex);
  document.documentElement.style.setProperty('--accent-strong', a.strong);
  renderer.setAccent(a.hex);
  try {
    localStorage.setItem(ACCENT_KEY, a.hex);
  } catch {
    /* ignore */
  }
}
const initAccent = ACCENTS.find((a) => a.hex === localStorage.getItem(ACCENT_KEY)) ?? ACCENTS[0];
applyAccent(initAccent);

// --- top nav + bottom tool pill ---
const nav = buildTopNav(topnavEl, editor, {
  onUndo: undo,
  onRedo: redo,
  onShare: doShare,
  onHelp: () => showHelp(),
  onSave: doSave,
  onLoad: doLoad,
  onExport: doExport,
  onImport: () => fileInput.click(),
  onClear: doClear,
  templates: () => [...TEMPLATES, ...customTemplates],
  onDeleteTemplate: doDeleteTemplate,
  accents: ACCENTS,
  currentAccent: initAccent.hex,
  onAccent: applyAccent,
});
const bottom = buildBottomBar(bottombarEl, editor);
editor.onToolChange = (t) => {
  nav.refresh(t);
  bottom.refresh(t);
};
nav.refresh(editor.tool);
bottom.refresh(editor.tool);

// --- speed pill (bottom-right) ---
{
  const lab = document.createElement('span');
  lab.textContent = '速度';
  const r = document.createElement('input');
  r.type = 'range';
  r.min = '1';
  r.max = '64';
  r.value = String(ticksPerFrame);
  const v = document.createElement('span');
  v.className = 'sv';
  v.textContent = `${ticksPerFrame}x`;
  r.oninput = () => {
    ticksPerFrame = Number(r.value);
    v.textContent = `${ticksPerFrame}x`;
  };
  speedEl.append(lab, r, v);
}

// right-click context menu
function ctxItem(label: string, key: string, fn: () => void, enabled: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.innerHTML = `<span>${label}</span><span class="ctx-key">${key}</span>`;
  b.disabled = !enabled;
  b.onclick = () => {
    ctxEl.classList.remove('open');
    fn();
  };
  return b;
}
editor.onContextMenu = (sx, sy) => {
  const sel = editor.hasSelection();
  const clip = !!editor.clipboard;
  const hr = document.createElement('hr');
  ctxEl.replaceChildren(
    ctxItem('复制', 'Ctrl+C', () => editor.copy(), sel),
    ctxItem('剪切', 'Ctrl+X', () => editor.cut(), sel),
    ctxItem('复制副本', 'Ctrl+D', () => editor.duplicate(), sel),
    ctxItem('粘贴', 'Ctrl+V', () => editor.paste(), clip),
    ctxItem('旋转', 'R', () => editor.rotateSelection(), sel),
    ctxItem('删除', 'Del', () => editor.deleteSelected(), sel),
    hr,
    ctxItem('真值表', '', doTruthTable, sel),
    ctxItem('存为模板', '', doSaveTemplate, sel),
  );
  ctxEl.classList.add('open');
  const r = ctxEl.getBoundingClientRect();
  const x = Math.min(sx, window.innerWidth - r.width - 4);
  const y = Math.min(sy, window.innerHeight - r.height - 4);
  ctxEl.style.left = `${x}px`;
  ctxEl.style.top = `${y}px`;
};
window.addEventListener(
  'pointerdown',
  (e) => {
    if (ctxEl.classList.contains('open') && !ctxEl.contains(e.target as Node)) {
      ctxEl.classList.remove('open');
    }
  },
  true,
);

function showTruthTable(tt: TruthTable): void {
  document.getElementById('tt-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'tt-overlay';
  const panel = document.createElement('div');
  panel.className = 'tt-panel';

  const head = document.createElement('div');
  head.className = 'tt-head';
  head.innerHTML = `<span>真值表 · ${tt.inputs.length} 入 ${tt.outputs.length} 出 · ${tt.rows.length} 行</span>`;
  const remove = () => {
    overlay.remove();
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') remove();
  };
  window.addEventListener('keydown', onKey);
  const close = document.createElement('button');
  close.className = 'tool';
  close.textContent = '关闭 ✕';
  close.onclick = remove;
  head.appendChild(close);
  panel.appendChild(head);

  const wrap = document.createElement('div');
  wrap.className = 'tt-scroll';
  const cells = (vals: string[], cls: string) => vals.map((v) => `<td class="${cls}">${v}</td>`).join('');
  const headRow =
    cells(tt.inputs, 'tt-in tt-h') + `<td class="tt-sep"></td>` + cells(tt.outputs, 'tt-out tt-h');
  const bodyRows = tt.rows
    .map(
      (r) =>
        `<tr>${cells(r.in.map(String), 'tt-in')}<td class="tt-sep"></td>${cells(
          r.out.map(String),
          'tt-out',
        )}</tr>`,
    )
    .join('');
  wrap.innerHTML = `<table class="tt"><thead><tr>${headRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  panel.appendChild(wrap);

  overlay.appendChild(panel);
  overlay.onclick = (e) => {
    if (e.target === overlay) remove();
  };
  document.body.appendChild(overlay);
}

const HELP =
  '<b>V</b> 选择：点选 / 空白拖动框选 / 拖动移动 · Shift 加选<br>' +
  '选中后：右键菜单，或 <b>Ctrl+C/X/V/D</b> 复制 / 剪切 / 粘贴 / 复制副本、<b>R</b> 旋转、<b>Del</b> 删除<br>' +
  '左栏工具：<b>W</b>线 <b>A</b>与 <b>O</b>或 <b>X</b>异或 <b>N</b>非 <b>B</b>钮 <b>L</b>灯 <b>K</b>钟 <b>D</b>触发器 <b>G</b>桥 <b>U</b>总线 <b>M</b>合并 <b>S</b>拆分 <b>Y</b>显示 <b>E</b>删除<br>' +
  '<b>H</b> 操作：点按钮/时钟、悬停看值并点亮整网、点线钉到时序波形<br>' +
  '<b>Ctrl+Z/Y</b> 撤销/重做 · 滚轮/捏合缩放 · 空格或中键拖动平移';

// --- main loop ---
function frame(): void {
  if (world.revision !== lastRevision) {
    lastRevision = world.revision;
    kernel = build();
    persist();
    history.record(world.serialize());
  }
  const compiled = kernel.compiled;
  for (let i = 0; i < ticksPerFrame; i++) {
    kernel.tick();
    if (analyzer.pins.length > 0) {
      analyzer.sample((k) => {
        const net = compiled.netOf[k];
        return net === undefined ? 0 : kernel.value(net);
      });
    }
  }
  renderer.draw(
    world,
    kernel,
    editor.preview(),
    editor.marquee(),
    editor.probe(),
    analyzer,
    editor.selectedIds(),
  );
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- helpers ---
let flashTimer = 0;
function flash(msg: string): void {
  hintEl.innerHTML = `<b>${msg}</b>`;
  hintEl.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => hintEl.classList.remove('show'), 1600);
}

function showHelp(): void {
  document.getElementById('tt-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'tt-overlay';
  const panel = document.createElement('div');
  panel.className = 'tt-panel';
  const remove = () => {
    overlay.remove();
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') remove();
  };
  window.addEventListener('keydown', onKey);
  const head = document.createElement('div');
  head.className = 'tt-head';
  head.innerHTML = '<span>操作 / 快捷键</span>';
  const close = document.createElement('button');
  close.className = 'tool';
  close.textContent = '关闭 ✕';
  close.onclick = remove;
  head.appendChild(close);
  const body = document.createElement('div');
  body.className = 'tt-scroll';
  body.style.lineHeight = '1.9';
  body.style.fontSize = '13px';
  body.innerHTML = HELP;
  panel.append(head, body);
  overlay.appendChild(panel);
  overlay.onclick = (e) => {
    if (e.target === overlay) remove();
  };
  document.body.appendChild(overlay);
}

function seedDemo(): void {
  // AND demo. The gate is 2 tall (inputs on the left, output on the right).
  // Its two input wires are vertically adjacent, so they use different colours
  // (red / blue) to stay insulated from each other.
  world.place('BUTTON', 0, 0, 0);
  world.place('WIRE', 1, 0, 0, 1); // red -> AND in0
  world.place('BUTTON', 1, 2, 0);
  world.place('WIRE', 1, 1, 0, 2); // blue -> AND in1
  world.place('AND', 2, 0, 0); // occupies (2,0) and (2,1)
  world.place('WIRE', 3, 0, 0);
  world.place('LAMP', 4, 0, 0);

  // clock blinker: CLOCK -> wire -> lamp
  world.place('CLOCK', 1, 4, 0);
  world.place('WIRE', 2, 4, 0);
  world.place('LAMP', 3, 4, 0);

  // bridge demo: a red H-line and a blue V-line cross without connecting
  world.place('BUTTON', 0, 7, 0);
  world.place('WIRE', 1, 7, 0, 1); // red
  world.place('BRIDGE', 2, 7, 0);
  world.place('WIRE', 3, 7, 0, 1); // red
  world.place('LAMP', 4, 7, 0);
  world.place('BUTTON', 2, 5, 0);
  world.place('WIRE', 2, 6, 0, 2); // blue
  world.place('WIRE', 2, 8, 0, 2); // blue
  world.place('LAMP', 2, 9, 0);
}
