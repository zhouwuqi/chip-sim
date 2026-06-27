import type { Editor, Tool } from '../editor/editor';
import { WIRE_COLORS } from '../render/palette';
import type { TemplateDef } from '../templates';

interface ToolbarHooks {
  onSpeed: (ticksPerFrame: number) => void;
  onSave: () => void;
  onLoad: () => void;
  onClear: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onImport: () => void;
  onShare: () => void;
  templates: () => TemplateDef[];
  onSaveTemplate: () => void;
  onDeleteTemplate: (index: number) => void;
  onTruthTable: () => void;
}

export interface ToolbarApi {
  refreshTemplates: () => void;
  refresh: (tool: Tool, facing: number) => void;
}

export function buildToolbar(el: HTMLElement, editor: Editor, hooks: ToolbarHooks): ToolbarApi {
  const rotGroup = group(el);
  const rotBtn = document.createElement('button');
  rotBtn.className = 'tool';
  rotBtn.onclick = () => editor.rotate();
  rotGroup.appendChild(rotBtn);

  // wire colour swatches
  const colorGroup = group(el);
  colorGroup.appendChild(text('线色'));
  const swatches: HTMLButtonElement[] = [];
  WIRE_COLORS.forEach((wc, i) => {
    const sw = document.createElement('button');
    sw.className = 'swatch';
    sw.title = wc.name;
    sw.style.background = wc.on;
    sw.onclick = () => {
      editor.setWireColor(i);
      swatches.forEach((b, j) => b.classList.toggle('active', j === i));
    };
    colorGroup.appendChild(sw);
    swatches.push(sw);
  });
  swatches[editor.wireColor]?.classList.add('active');

  // template picker
  const tmplGroup = group(el);
  tmplGroup.appendChild(text('模板'));
  const tmplSel = document.createElement('select');
  tmplSel.className = 'tool';
  const rebuildTemplates = () => {
    const keep = tmplSel.value;
    tmplSel.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.textContent = '选择…';
    placeholder.value = '-1';
    tmplSel.appendChild(placeholder);
    hooks.templates().forEach((t, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = t.custom ? `★ ${t.name}` : t.name;
      opt.title = t.desc;
      tmplSel.appendChild(opt);
    });
    tmplSel.value = keep;
    if (tmplSel.selectedIndex < 0) tmplSel.value = '-1';
  };
  rebuildTemplates();
  tmplSel.onchange = () => {
    const i = Number(tmplSel.value);
    const list = hooks.templates();
    if (i >= 0 && i < list.length) editor.setTemplate(list[i]);
  };
  tmplGroup.appendChild(tmplSel);
  tmplGroup.appendChild(btn('框选存模板', hooks.onSaveTemplate, '先用「框选」框住电路，再点此存为模板'));
  tmplGroup.appendChild(btn('删模板', () => hooks.onDeleteTemplate(Number(tmplSel.value))));
  tmplGroup.appendChild(btn('真值表', hooks.onTruthTable, '框选含按钮/灯的组合电路，自动算真值表'));

  const speedGroup = group(el);
  speedGroup.appendChild(text('速度'));
  const speed = document.createElement('input');
  speed.type = 'range';
  speed.min = '1';
  speed.max = '64';
  speed.value = '8';
  const speedVal = text('8x');
  speed.oninput = () => {
    const v = Number(speed.value);
    speedVal.textContent = `${v}x`;
    hooks.onSpeed(v);
  };
  speedGroup.appendChild(speed);
  speedGroup.appendChild(speedVal);

  const histGroup = group(el);
  histGroup.appendChild(btn('↶ 撤销', hooks.onUndo, 'Ctrl+Z'));
  histGroup.appendChild(btn('↷ 重做', hooks.onRedo, 'Ctrl+Y'));

  const fileGroup = group(el);
  fileGroup.appendChild(btn('保存', hooks.onSave));
  fileGroup.appendChild(btn('读取', hooks.onLoad));
  fileGroup.appendChild(btn('导出', hooks.onExport));
  fileGroup.appendChild(btn('导入', hooks.onImport));
  fileGroup.appendChild(btn('🔗 分享', hooks.onShare, '生成可分享的链接并复制到剪贴板'));
  fileGroup.appendChild(btn('清空', hooks.onClear));

  const FACE = ['→ 东', '↓ 南', '← 西', '↑ 北'];
  const refresh = (tool: Tool, facing: number) => {
    rotBtn.innerHTML = `朝向 ${FACE[facing]}<span class="key">R</span>`;
    if (tool !== 'TEMPLATE') tmplSel.value = '-1';
  };

  return { refreshTemplates: rebuildTemplates, refresh };
}

function group(parent: HTMLElement): HTMLElement {
  const g = document.createElement('div');
  g.className = 'group';
  parent.appendChild(g);
  return g;
}

function text(s: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'label';
  span.textContent = s;
  return span;
}

function btn(label: string, onclick: () => void, title?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'tool';
  b.textContent = label;
  if (title) b.title = title;
  b.onclick = onclick;
  return b;
}
