import type { Editor, Tool } from '../editor/editor';
import type { TemplateDef } from '../templates';

interface NavHooks {
  onUndo: () => void;
  onRedo: () => void;
  onShare: () => void;
  onHelp: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
  templates: () => TemplateDef[];
  onDeleteTemplate: (index: number) => void;
}

export interface NavApi {
  refresh: (tool: Tool) => void;
  refreshTemplates: () => void;
}

export function buildTopNav(el: HTMLElement, editor: Editor, hooks: NavHooks): NavApi {
  // --- left: brand + template picker ---
  const left = side(el);

  const brand = card(left, 'brand');
  const logo = document.createElement('div');
  logo.className = 'logo';
  brand.appendChild(logo);
  brand.appendChild(document.createTextNode('ChipSim'));

  const tmplCard = card(left);
  const tmplSel = document.createElement('select');
  tmplSel.className = 'navsel';
  const rebuildTemplates = () => {
    const keep = tmplSel.value;
    tmplSel.replaceChildren();
    const ph = document.createElement('option');
    ph.textContent = '模板…';
    ph.value = '-1';
    tmplSel.appendChild(ph);
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
  tmplCard.appendChild(tmplSel);
  tmplCard.appendChild(
    navbtn('🗑', () => hooks.onDeleteTemplate(Number(tmplSel.value)), '删除选中的自定义模板'),
  );

  // --- right: history + actions ---
  const right = side(el);

  const hist = card(right);
  hist.appendChild(navbtn('↶', hooks.onUndo, '撤销 (Ctrl+Z)'));
  hist.appendChild(navbtn('↷', hooks.onRedo, '重做 (Ctrl+Y)'));

  const actions = card(right);
  actions.appendChild(navbtn('🔗 分享', hooks.onShare, '生成分享链接'));

  const fileBtn = navbtn('文件 ▾', () => {}, '保存 / 读取 / 导入导出');
  actions.appendChild(fileBtn);

  const sep = document.createElement('div');
  sep.className = 'nav-sep';
  actions.appendChild(sep);
  actions.appendChild(navbtn('?', hooks.onHelp, '操作 / 快捷键'));

  // file dropdown menu
  const fileMenu = document.getElementById('filemenu') as HTMLElement;
  const fileItems: [string, () => void][] = [
    ['保存到本地', hooks.onSave],
    ['读取存档', hooks.onLoad],
    ['导出 JSON', hooks.onExport],
    ['导入 JSON', hooks.onImport],
    ['清空', hooks.onClear],
  ];
  fileMenu.replaceChildren(
    ...fileItems.map(([label, fn]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => {
        fileMenu.classList.remove('open');
        fn();
      };
      return b;
    }),
  );
  fileBtn.onclick = (e) => {
    e.stopPropagation();
    const r = fileBtn.getBoundingClientRect();
    fileMenu.style.top = `${r.bottom + 6}px`;
    fileMenu.style.right = `${window.innerWidth - r.right}px`;
    fileMenu.style.left = 'auto';
    fileMenu.classList.toggle('open');
  };
  window.addEventListener('pointerdown', (e) => {
    if (!fileMenu.contains(e.target as Node) && e.target !== fileBtn) {
      fileMenu.classList.remove('open');
    }
  });

  const refresh = (tool: Tool) => {
    if (tool !== 'TEMPLATE') tmplSel.value = '-1';
  };
  return { refresh, refreshTemplates: rebuildTemplates };
}

function side(parent: HTMLElement): HTMLElement {
  const d = document.createElement('div');
  d.className = 'nav-side';
  parent.appendChild(d);
  return d;
}

function card(parent: HTMLElement, extra = ''): HTMLElement {
  const c = document.createElement('div');
  c.className = extra ? `navcard ${extra}` : 'navcard';
  parent.appendChild(c);
  return c;
}

function navbtn(label: string, onclick: (e: MouseEvent) => void, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'navbtn';
  b.textContent = label;
  b.title = title;
  b.onclick = onclick;
  return b;
}
