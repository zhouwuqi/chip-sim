import './style.css';
import { World } from './world';
import { Renderer } from './render/renderer';
import { Editor } from './editor/editor';
import { Kernel } from './sim/kernel';
import { compile } from './sim/compile';
import { buildToolbar, type ToolbarApi } from './ui/toolbar';
import { History } from './history';
import { Analyzer } from './analyzer';
import { TEMPLATES, extractTemplate, type TemplateDef } from './templates';
import { computeTruthTable, type TruthTable } from './truthtable';
import { footprint } from './sim/geometry';
import type { Component } from './sim/types';

const SAVE_KEY = 'chipsim:autosave';
const TEMPLATES_KEY = 'chipsim:templates';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
const toolbarEl = document.getElementById('toolbar') as HTMLElement;
const hintEl = document.getElementById('hint') as HTMLElement;

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
  hintEl.style.display = analyzer.pins.length > 0 ? 'none' : '';
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

// --- toolbar ---
let toolbar: ToolbarApi;
toolbar = buildToolbar(toolbarEl, editor, {
  onSpeed: (v) => (ticksPerFrame = v),
  onSave: () => {
    persist();
    flash('已保存到本地');
  },
  onLoad: () => {
    const s = localStorage.getItem(SAVE_KEY);
    if (s) {
      world.load(s);
      flash('已读取存档');
    } else {
      flash('没有存档');
    }
  },
  onClear: () => {
    if (confirm('清空当前电路？')) {
      world.clear();
      flash('已清空');
    }
  },
  onUndo: undo,
  onRedo: redo,
  onExport: () => {
    const blob = new Blob([world.serialize()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chipsim-circuit.json';
    a.click();
    URL.revokeObjectURL(url);
    flash('已导出 JSON');
  },
  onImport: () => fileInput.click(),
  onShare: async () => {
    const data = btoa(unescape(encodeURIComponent(world.serialize())));
    const url = `${location.origin}${location.pathname}#c=${data}`;
    try {
      await navigator.clipboard.writeText(url);
      flash('🔗 分享链接已复制到剪贴板');
    } catch {
      location.hash = `c=${data}`;
      flash('🔗 已生成链接（在地址栏，可复制）');
    }
  },
  templates: () => [...TEMPLATES, ...customTemplates],
  onSaveTemplate: () => {
    const sel = editor.selection();
    if (!sel) {
      flash('请先用「框选」(B) 框住要保存的电路');
      return;
    }
    const def = extractTemplate([...world.all()], '', sel);
    if (def.parts.length === 0) {
      flash('选区内没有元件');
      return;
    }
    const name = prompt('模板名称：', `自定义 ${customTemplates.length + 1}`);
    if (!name) return;
    def.name = name;
    customTemplates.push(def);
    persistTemplates();
    toolbar.refreshTemplates();
    editor.setTemplate(def);
    flash(`已保存模板「${name}」（${def.parts.length} 个元件）`);
  },
  onDeleteTemplate: (i) => {
    const ci = i - TEMPLATES.length;
    if (ci < 0 || ci >= customTemplates.length) {
      flash('内置模板不可删除，请先选中自定义(★)模板');
      return;
    }
    const [removed] = customTemplates.splice(ci, 1);
    persistTemplates();
    toolbar.refreshTemplates();
    flash(`已删除模板「${removed.name}」`);
  },
  onTruthTable: () => {
    const r = editor.selection();
    if (!r) {
      flash('请先用「框选」(B) 框住含按钮/灯的电路');
      return;
    }
    const comps = [...world.all()].filter((c) =>
      footprint(c.kind, c.x, c.y, c.facing).every(
        (p) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY,
      ),
    );
    const res = computeTruthTable(comps);
    if ('error' in res) flash(res.error);
    else showTruthTable(res);
  },
});

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

const HINT =
  '工具(左手)：<b>Q</b>线 <b>W</b>AND <b>E</b>OR <b>A</b>XOR <b>S</b>NOT <b>Z</b>按钮 <b>X</b>灯 ' +
  '<b>C</b>时钟 <b>G</b>触发器 <b>V</b>桥 <b>T</b>总线 <b>D</b>删除 <b>B</b>框选 <b>F</b>操作 · <b>R</b>旋转 · ' +
  '<b>Ctrl+Z/Y</b>撤销/重做 · 框选后 <b>R</b>整体旋转、<b>Ctrl+C/X/V</b>复制/剪切/粘贴 · <b>F</b>操作模式：悬停看值/点亮整网，点击线钉选到时序波形 · 「🔗分享」';
hintEl.innerHTML = HINT;

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
  renderer.draw(world, kernel, editor.preview(), editor.selection(), editor.probe(), analyzer);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- helpers ---
let flashTimer = 0;
function flash(msg: string): void {
  hintEl.innerHTML = `<b>${msg}</b>`;
  clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => {
    hintEl.innerHTML = HINT;
  }, 1800);
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
