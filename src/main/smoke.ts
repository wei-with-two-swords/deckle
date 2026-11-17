import { app } from 'electron';
import type { BrowserWindow } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createProject, importTypstFile } from './projects';
import { removeRecentProject } from './db';
import { saveSettings } from './settings';

function smokeParent(): string {
  return process.env.DECKLE_SMOKE_PARENT
    ? path.resolve(process.env.DECKLE_SMOKE_PARENT)
    : path.join(app.getAppPath(), 'tmp');
}

/** 仅用于 M1 冒烟：在临时目录创建项目并设为最近项目。 */
export async function prepareSmokeProject(): Promise<void> {
  try {
    const project = await createProject({
      name: `smoke-${Date.now()}`,
      parentDir: smokeParent(),
    });
    await checkTemplates();
    saveSettings({ lastProject: project.path });
    console.log('[smoke] 已创建项目', project.path);
  } catch (error) {
    console.error('[smoke] 创建项目失败', error);
  }
}

async function checkTemplates(): Promise<void> {
  const stamp = Date.now();
  const blank = await createProject({
    name: `probe-blank-${stamp}`,
    parentDir: smokeParent(),
    templateId: 'blank',
  });
  const paper = await createProject({
    name: `probe-paper-${stamp}`,
    parentDir: smokeParent(),
    templateId: 'paper',
  });
  const blankMain = await fs.readFile(
    path.join(blank.path, 'main.typ'),
    'utf8',
  );
  const paperMain = await fs.readFile(
    path.join(paper.path, 'main.typ'),
    'utf8',
  );

  const sourceFile = path.join(smokeParent(), `probe-import-${stamp}.typ`);
  const sourceContent = '= 导入测试\n\n这是从已有文件导入的正文。\n';
  await fs.writeFile(sourceFile, sourceContent, 'utf8');
  const imported = await importTypstFile(sourceFile);
  const importedMain = await fs.readFile(
    path.join(imported.path, 'main.typ'),
    'utf8',
  );
  const sourceStillExists = await fs
    .stat(sourceFile)
    .then(() => true)
    .catch(() => false);

  console.log(
    '[smoke:templates]',
    JSON.stringify({
      blankTemplate: blank.config.template,
      blankHasPage: blankMain.includes('#set page'),
      blankHasAbstract: blankMain.includes('摘要'),
      paperTemplate: paper.config.template,
      paperHasAbstract: paperMain.includes('摘要'),
      importedTemplate: imported.config.template,
      importedCopied: importedMain === sourceContent,
      sourceStillExists,
    }),
  );

  for (const target of [blank.path, paper.path, imported.path]) {
    removeRecentProject(target);
    await fs.rm(target, { recursive: true, force: true });
  }
  await fs.rm(sourceFile, { force: true });
}

async function dumpDom(win: BrowserWindow): Promise<void> {
  const image = await win.webContents.capturePage();
  const target = path.join(smokeParent(), 'smoke.png');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, image.toPNG());

  const before = await win.webContents.executeJavaScript(`
    (() => {
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      return {
        hasApi: !!window.deckle,
        theme: document.documentElement.dataset.theme,
        text: document.body.innerText.slice(0, 600),
        rail: rect(document.querySelector('nav[aria-label="主导航"]')),
        topbar: rect(document.querySelector('header')),
        panel: rect(document.querySelector('section[aria-label="文件面板"]')),
        editor: rect(document.querySelector('section[aria-label="编辑器"]')),
        preview: rect(document.querySelector('section[aria-label="预览"]')),
        treeitems: [...document.querySelectorAll('[role="treeitem"]')].map((el) => el.getAttribute('data-path')),
        selected: document.querySelector('[role="treeitem"][aria-selected="true"]')?.getAttribute('data-path') ?? null,
      };
    })()
  `);
  console.log('[smoke:before]', JSON.stringify(before, null, 2));

  const clicked = await win.webContents.executeJavaScript(`
    (() => {
      const row = [...document.querySelectorAll('[role="treeitem"]')].find((el) => (el.getAttribute('data-path') || '').endsWith('main.typ'));
      if (!row) return false;
      row.click();
      return true;
    })()
  `);
  console.log('[smoke] clicked main.typ =', clicked);

  await new Promise((resolve) => setTimeout(resolve, 1200));

  const after = await win.webContents.executeJavaScript(`
    (() => ({
      selected: document.querySelector('[role="treeitem"][aria-selected="true"]')?.getAttribute('data-path') ?? null,
      editorText: document.querySelector('section[aria-label="编辑器"]')?.innerText.slice(0, 200) ?? null,
      toast: document.querySelector('[role="status"]')?.innerText ?? null,
    }))()
  `);
  console.log('[smoke:after]', JSON.stringify(after, null, 2));

  const afterImage = await win.webContents.capturePage();
  await fs.mkdir(smokeParent(), { recursive: true });
  await fs.writeFile(
    path.join(smokeParent(), 'smoke-after.png'),
    afterImage.toPNG(),
  );

  const typed = await win.webContents.executeJavaScript(`
    (async () => {
      const view = window.__deckleEditor;
      if (!view) return { hasView: false };
      const pill = () => [...document.querySelectorAll('header span')]
        .map((el) => el.textContent?.trim())
        .find((text) => ['已保存', '未保存', '保存中', '保存失败'].includes(text)) ?? null;
      const before = pill();
      view.dispatch({ changes: { from: view.state.doc.length, insert: '\\n// smoke-save\\n' } });
      await new Promise((resolve) => setTimeout(resolve, 120));
      const dirty = pill();
      await new Promise((resolve) => setTimeout(resolve, 1600));
      const saved = pill();
      return {
        hasView: true,
        before,
        dirty,
        saved,
        lines: view.state.doc.lines,
        tail: view.state.doc.toString().slice(-24),
      };
    })()
  `);
  console.log('[smoke:typed]', JSON.stringify(typed, null, 2));

  // 冲突处理：磁盘被外部修改后再保存，应弹出对话框，覆盖保存应成功。
  const conflictPath = (await win.webContents.executeJavaScript(`
    document.querySelector('[role="treeitem"][aria-selected="true"]')?.getAttribute('data-path') ?? null
  `)) as string | null;
  if (conflictPath) {
    await fs.appendFile(conflictPath, '\n// external change\n', 'utf8');
    await new Promise((resolve) => setTimeout(resolve, 40));
    await win.webContents.executeJavaScript(`
      (() => {
        const view = window.__deckleEditor;
        if (view) {
          view.dispatch({
            changes: { from: view.state.doc.length, insert: '\\n// local change\\n' },
          });
        }
        return true;
      })()
    `);
    win.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: 'S',
      modifiers: ['control'],
    });
    win.webContents.sendInputEvent({
      type: 'keyUp',
      keyCode: 'S',
      modifiers: ['control'],
    });
    await new Promise((resolve) => setTimeout(resolve, 900));
    const dialogResult = (await win.webContents.executeJavaScript(`
      (async () => {
        const dialogs = [...document.querySelectorAll('[role="dialog"]')];
        const dialog = dialogs.find((el) => el.textContent?.includes('文件已被外部修改')) ?? null;
        const buttons = dialog
          ? [...dialog.querySelectorAll('button')].map((el) => el.textContent?.trim())
          : [];
        const overwrite = dialog
          ? [...dialog.querySelectorAll('button')].find((el) => el.textContent?.trim() === '覆盖保存')
          : null;
        overwrite?.click();
        await new Promise((resolve) => setTimeout(resolve, 700));
        const openAfter = [...document.querySelectorAll('[role="dialog"]')].some((el) =>
          el.textContent?.includes('文件已被外部修改'),
        );
        return { appeared: Boolean(dialog), buttons, openAfter };
      })()
    `)) as { appeared: boolean; buttons: string[]; openAfter: boolean };
    const disk = await fs.readFile(conflictPath, 'utf8');
    console.log(
      '[smoke:conflict]',
      JSON.stringify(
        {
          ...dialogResult,
          hasLocal: disk.includes('// local change'),
          hasExternal: disk.includes('// external change'),
        },
        null,
        2,
      ),
    );
  }

  const toolbar = await win.webContents.executeJavaScript(`
    (async () => {
      const view = window.__deckleEditor;
      if (!view) return { hasView: false };
      const button = document.querySelector('button[aria-label="粗体"]');
      if (!button) return { hasView: true, hasButton: false };
      const before = view.state.doc.toString().slice(0, 16);
      const full = view.state.doc.toString();
      const target = '这是 Deckle 创建的示例文档';
      const start = full.indexOf(target);
      if (start >= 0) {
        view.dispatch({ selection: { anchor: start, head: start + target.length } });
      }
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      const wrapped = view.state.doc.toString().indexOf('*' + target + '*') >= 0;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: full },
        selection: { anchor: start >= 0 ? start : 0 },
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
      return {
        hasView: true,
        hasButton: true,
        before,
        wrapped,
        restored: view.state.doc.toString() === full,
        after: view.state.doc.toString().slice(0, 16),
      };
    })()
  `);
  console.log('[smoke:toolbar]', JSON.stringify(toolbar, null, 2));

  const syntax = await win.webContents.executeJavaScript(`
    (async () => {
      const view = window.__deckleEditor;
      if (!view) return { hasView: false };
      const original = view.state.doc.toString();
      const fence = '\u0060\u0060\u0060';
      const probe = [
        '= 标题测试',
        '',
        '*粗体* _斜体_ \u0060行内代码\u0060 @ref',
        '',
        '- 列表项一',
        '- 列表项二',
        '',
        '== 子标题测试',
        '',
        '子标题正文，用来验证标题折叠。',
        '',
        fence + 'typ',
        '#let x = 1',
        fence,
      ].join('\\n');
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: probe } });
      await new Promise((resolve) => setTimeout(resolve, 600));
      const wanted = ['标题测试', '粗体', '斜体', '行内代码', '列表项一', '#let x = 1'];
      const spans = [...document.querySelectorAll('.cm-content span')].filter(
        (el) => el.textContent && el.textContent.trim().length > 0,
      );
      const samples = [];
      for (const el of spans) {
        const color = getComputedStyle(el).color;
        const weight = getComputedStyle(el).fontWeight;
        const style = getComputedStyle(el).fontStyle;
        const text = el.textContent ?? '';
        if (wanted.some((w) => text.includes(w))) {
          samples.push({ text: text.slice(0, 24), cls: el.className, color, weight, style });
        }
      }
      const foldGutter = document.querySelector('.cm-foldGutter');
      const foldEls = foldGutter
        ? [...foldGutter.querySelectorAll('.cm-gutterElement')]
        : [];
      const foldInfo = {
        hasGutter: !!foldGutter,
        width: foldGutter ? getComputedStyle(foldGutter).width : null,
        elements: foldEls.length,
        markers: document.querySelectorAll('.cm-foldGutter .cm-foldMarker').length,
        sample: foldEls.slice(0, 8).map((el) => ({
          text: (el.textContent ?? '').trim(),
          html: el.innerHTML.slice(0, 120),
        })),
      };
      const gutterKids = [...document.querySelectorAll('.cm-gutters > .cm-gutter')].map((el) => ({
        cls: el.className,
        width: getComputedStyle(el).width,
      }));
      const content = document.querySelector('.cm-content');
      const firstLine = document.querySelector('.cm-line');
      const htmlSample = content ? content.innerHTML.slice(0, 800) : null;
      const lineSample = firstLine ? firstLine.innerHTML.slice(0, 300) : null;
      const styleCount = document.querySelectorAll('style').length;
      const docStart = view.state.doc.toString().slice(0, 60);
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: original },
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      return {
        hasView: true,
        spanCount: spans.length,
        samples: samples.slice(0, 8),
        foldInfo,
        gutterKids,
        styleCount,
        docStart,
        htmlSample,
        lineSample,
      };
    })()
  `);
  console.log('[smoke:syntax]', JSON.stringify(syntax, null, 2));

  const fonts = await win.webContents.executeJavaScript(`
    (async () => {
      const view = window.__deckleEditor;
      if (!view) return { hasView: false };
      const original = view.state.doc.toString();
      const button = document.querySelector('button[aria-label="字体"]');
      if (!button) return { hasView: true, hasButton: false };
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 700));
      const items = [...document.querySelectorAll('[data-font-family]')];
      const names = items.map((el) => el.getAttribute('data-font-family'));
      const labels = items.map((el) => el.getAttribute('data-font-label'));
      const list = document.querySelector('[data-font-list]');
      const scrollable = list ? list.scrollHeight > list.clientHeight + 4 : false;
      const hasSongti = labels.includes('宋体');
      const target = names.includes('Arial') ? 'Arial' : names[0] ?? null;
      const targetItem = items.find(
        (el) => el.getAttribute('data-font-family') === target,
      );
      if (targetItem) targetItem.click();
      await new Promise((resolve) => setTimeout(resolve, 350));
      const text = view.state.doc.toString();
      const applied = target
        ? text.includes('#set text(font: "' + target + '")')
        : false;
      const atTop = text.startsWith('#set text(font:');
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: original },
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      return {
        hasView: true,
        hasButton: true,
        count: names.length,
        hasSongti,
        scrollable,
        target,
        applied,
        atTop,
        restored: view.state.doc.toString() === original,
      };
    })()
  `);
  console.log('[smoke:fonts]', JSON.stringify(fonts, null, 2));

  await new Promise((resolve) => setTimeout(resolve, 1400));
  const preview = await win.webContents.executeJavaScript(`
    (() => {
      const pages = [...document.querySelectorAll('.preview-page canvas')];
      let painted = 0;
      const info = [];
      for (const canvas of pages) {
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let nonWhite = 0;
        for (let i = 0; i < data.length; i += 16) {
          if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) nonWhite += 1;
        }
        info.push({ width: canvas.width, height: canvas.height, nonWhite });
        if (nonWhite > 0) painted += 1;
      }
      return { pages: pages.length, painted, info };
    })()
  `);
  console.log('[smoke:preview]', JSON.stringify(preview));

  const lint = await win.webContents.executeJavaScript(`
    (async () => {
      const view = window.__deckleEditor;
      if (!view) return { skip: true };
      const original = view.state.doc.toString();
      view.dispatch({
        changes: {
          from: 0,
          insert: '#let broken = 1 + 中文啊\\n',
        },
      });
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        if (document.querySelectorAll('.cm-lintRange-error').length > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      view.dispatch({
        selection: { anchor: 0 },
        scrollIntoView: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 400));
      const result = {
        markers: document.querySelectorAll('.cm-lintRange-error').length,
        gutter: document.querySelectorAll('.cm-lint-marker-error').length,
        editors: document.querySelectorAll('.cm-editor').length,
        canvases: document.querySelectorAll('.preview-page canvas').length,
        pages: document.querySelectorAll('.preview-page').length,
        previewText: (
          document.querySelector('[aria-label="预览"]')?.innerText ?? ''
        ).slice(0, 80),
      };
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: original },
      });
      await new Promise((resolve) => setTimeout(resolve, 1400));
      return result;
    })()
  `);
  console.log('[smoke:lint]', JSON.stringify(lint, null, 2));

  const mainPath = before.treeitems.find((item: string | null) =>
    (item ?? '').replace(/\\\\/g, '/').endsWith('main.typ'),
  );
  if (mainPath) {
    const content = await fs.readFile(mainPath, 'utf8');
    console.log(
      '[smoke:file]',
      JSON.stringify({
        path: mainPath,
        hasSmokeLine: content.includes('// smoke-save'),
      }),
    );
  }

  const dirs = await fs.readdir(smokeParent());
  const smokeDir = dirs
    .filter((name) => name.startsWith('smoke-') && !name.includes('.'))
    .sort()
    .pop();
  if (smokeDir) {
    const workspace = await fs.readFile(
      path.join(smokeParent(), smokeDir, '.deckle', 'workspace.json'),
      'utf8',
    );
    console.log('[smoke:workspace]', workspace);
  }

  const settingsCheck = await win.webContents.executeJavaScript(`
    (async () => {
      const button = [...document.querySelectorAll('button')].find((el) => el.getAttribute('aria-label') === '项目设置');
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 400));
      const dialog = document.querySelector('[role="dialog"]');
      const text = dialog?.innerText.slice(0, 300) ?? null;
      const input = dialog?.querySelector('input');
      const original = input?.value ?? '';
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, original + '-改');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
      const save = [...(dialog?.querySelectorAll('button') ?? [])].find((el) => el.textContent?.trim() === '保存');
      save?.click();
      await new Promise((resolve) => setTimeout(resolve, 800));
      return {
        open: !!dialog,
        text,
        renamed: input?.value ?? null,
        dialogAfter: !!document.querySelector('[role="dialog"]'),
        header: document.querySelector('header')?.innerText ?? null,
      };
    })()
  `);
  console.log(
    '[smoke:project-settings]',
    JSON.stringify(settingsCheck, null, 2),
  );

  const dashboard = await win.webContents.executeJavaScript(`
    (async () => {
      const back = document.querySelector('button[aria-label="返回欢迎页"]');
      back?.click();
      await new Promise((resolve) => setTimeout(resolve, 600));
      return {
        railButtons: [...document.querySelectorAll('nav[aria-label="主导航"] button')].map((el) => el.getAttribute('aria-label')),
        header: document.querySelector('header')?.innerText ?? null,
        panel: !!document.querySelector('section[aria-label="文件面板"]'),
        editor: !!document.querySelector('section[aria-label="编辑器"]'),
        recentCards: document.querySelectorAll('[data-project-path]').length,
      };
    })()
  `);
  console.log('[smoke:dashboard]', JSON.stringify(dashboard, null, 2));

  const projectMenu = await win.webContents.executeJavaScript(`
    (async () => {
      const trigger = [...document.querySelectorAll('header button')].find(
        (el) => (el.textContent || '').trim() === 'Project',
      );
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 400));
      const items = [...document.querySelectorAll('[role="menuitem"]')].map(
        (el) => (el.innerText || '').trim(),
      );
      const templateItem = [...document.querySelectorAll('[role="menuitem"]')].find(
        (el) => (el.innerText || '').includes('从模板开始'),
      );
      templateItem?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 400));
      const allAfterHover = [...document.querySelectorAll('[role="menuitem"]')].map(
        (el) => (el.innerText || '').trim(),
      );
      const submenu = allAfterHover.filter(
        (text) => !items.includes(text),
      );
      for (let attempt = 0; attempt < 4; attempt += 1) {
        if (document.querySelectorAll('[role="menu"]').length === 0) break;
        const backdrop = document.querySelector('.MuiModal-backdrop, .MuiBackdrop-root');
        backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return {
        items,
        submenu,
        openMenusAfterClose: document.querySelectorAll('[role="menu"]').length,
      };
    })()
  `);
  console.log('[smoke:projectmenu]', JSON.stringify(projectMenu, null, 2));

  await new Promise((resolve) => setTimeout(resolve, 2600));
  const dashboardImage = await win.webContents.capturePage();
  await fs.mkdir(smokeParent(), { recursive: true });
  await fs.writeFile(
    path.join(smokeParent(), 'smoke-dashboard.png'),
    dashboardImage.toPNG(),
  );

  const dashboardSettings = await win.webContents.executeJavaScript(`
    (async () => {
      const button = [...document.querySelectorAll('button')].find((el) => el.getAttribute('aria-label') === '应用设置');
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 400));
      const dialog = document.querySelector('[role="dialog"]');
      const text = dialog?.innerText.slice(0, 200) ?? null;
      const done = [...(dialog?.querySelectorAll('button') ?? [])].find((el) => el.textContent?.trim() === '完成');
      done?.click();
      return { open: !!dialog, text };
    })()
  `);
  console.log(
    '[smoke:app-settings]',
    JSON.stringify(dashboardSettings, null, 2),
  );

  const dashboardGrid = await win.webContents.executeJavaScript(`
    (async () => {
      const header = document.querySelector('h2');
      const search = document.querySelector('input[aria-label="搜索项目"]');
      const importButton = [...document.querySelectorAll('button')].find((el) =>
        (el.innerText || '').includes('导入模板'),
      );
      const blankButton = [...document.querySelectorAll('button')].find((el) =>
        (el.innerText || '').includes('新建项目'),
      );
      const openButton = [...document.querySelectorAll('button')].find((el) =>
        (el.innerText || '').includes('打开文件夹'),
      );
      const templateList = document.querySelector('[data-template-list]');
      const templateItems = [...document.querySelectorAll('[data-template-id]')].map((el) => ({
        id: el.getAttribute('data-template-id'),
        name: (el.querySelector('span')?.innerText || '').split('\\n')[0],
      }));
      const style = document.querySelector('[data-dashboard-grid]')
        ? getComputedStyle(document.querySelector('[data-dashboard-grid]'))
        : null;
      return {
        header: header?.innerText ?? null,
        hasSearch: !!search,
        hasImport: !!importButton,
        hasBlank: !!blankButton,
        hasOpen: !!openButton,
        hasTemplateList: !!templateList,
        templateCount: templateItems.length,
        templateNames: templateItems.map((item) => item.name),
        columns: style?.gridTemplateColumns ?? null,
      };
    })()
  `);
  console.log('[smoke:dashboard-grid]', JSON.stringify(dashboardGrid, null, 2));

  const covers = await win.webContents.executeJavaScript(`
    (async () => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      const cards = [...document.querySelectorAll('[data-project-path]')];
      return {
        cards: cards.length,
        covers: document.querySelectorAll('.project-card img.project-card-cover').length,
        actions: [...(cards[0]?.querySelectorAll('.project-card-actions button') ?? [])].map((el) =>
          el.getAttribute('aria-label'),
        ),
        cardWidth: cards[0]?.getBoundingClientRect().width ?? null,
      };
    })()
  `);
  console.log('[smoke:cover]', JSON.stringify(covers, null, 2));

  const templateStart = await win.webContents.executeJavaScript(`
    (async () => {
      const start = document.querySelector(
        '[data-template-id] button[aria-label="从模板开始"]',
      );
      start?.click();
      await new Promise((resolve) => setTimeout(resolve, 450));
      const dialog = document.querySelector('[role="dialog"]');
      const title = dialog?.querySelector('h2')?.innerText ?? null;
      const cancel = [...(dialog?.querySelectorAll('button') ?? [])].find(
        (el) => el.textContent?.trim() === '取消',
      );
      cancel?.click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        opened: !!dialog,
        title,
        hasTemplateName: !!title && title.includes('论文模板'),
      };
    })()
  `);
  console.log('[smoke:template-start]', JSON.stringify(templateStart, null, 2));

  const templateDialog = await win.webContents.executeJavaScript(`
    (async () => {
      const trigger = [...document.querySelectorAll('header button')].find(
        (el) => (el.textContent || '').trim() === 'Project',
      );
      trigger?.click();
      await new Promise((resolve) => setTimeout(resolve, 350));
      const template = [...document.querySelectorAll('[role="menuitem"]')].find(
        (el) => (el.innerText || '').includes('从模板开始'),
      );
      template?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 350));
      const item = [...document.querySelectorAll('[role="menuitem"]')].find(
        (el) => (el.innerText || '').trim() === '课程论文',
      );
      item?.click();
      await new Promise((resolve) => setTimeout(resolve, 450));
      const dialog = document.querySelector('[role="dialog"]');
      const title = dialog?.querySelector('h2')?.innerText ?? null;
      const result = {
        opened: !!dialog,
        title,
        ok: !!title && title.includes('课程论文'),
      };
      const cancel = [...(dialog?.querySelectorAll('button') ?? [])].find(
        (el) => el.textContent?.trim() === '取消',
      );
      cancel?.click();
      await new Promise((resolve) => setTimeout(resolve, 250));
      return result;
    })()
  `);
  console.log('[smoke:templatemenu]', JSON.stringify(templateDialog, null, 2));

  const reopened = await win.webContents.executeJavaScript(`
    (async () => {
      const recent = await window.deckle.project.recent();
      const first = recent.ok ? recent.data[0] : null;
      if (!first) return { ok: false };
      const card = [...document.querySelectorAll('[data-project-path]')].find(
        (el) => el.getAttribute('data-project-path') === first.path,
      );
      card?.click();
      await new Promise((resolve) => setTimeout(resolve, 900));
      return {
        ok: true,
        header: document.querySelector('header')?.innerText ?? null,
        railButtons: [...document.querySelectorAll('nav[aria-label="主导航"] button')].map((el) => el.getAttribute('aria-label')),
      };
    })()
  `);
  console.log('[smoke:reopened]', JSON.stringify(reopened, null, 2));

  const themeCheck = await win.webContents.executeJavaScript(`
    (async () => {
      const before = document.documentElement.dataset.theme;
      const view = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === 'View');
      view?.click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent?.includes('主题'));
      item?.click();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const after = document.documentElement.dataset.theme;
      const layer2 = getComputedStyle(document.documentElement).getPropertyValue('--layer-2').trim();
      return { before, after, layer2 };
    })()
  `);
  console.log('[smoke:theme]', JSON.stringify(themeCheck));

  const quickOpen = await win.webContents.executeJavaScript(`
    (async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 350));
      const items = [...document.querySelectorAll('[data-quick-open-path]')].map((el) =>
        el.getAttribute('data-quick-open-path'),
      );
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      await new Promise((resolve) => setTimeout(resolve, 150));
      const closed = document.querySelectorAll('[data-quick-open-path]').length === 0;
      return { count: items.length, first: items[0] ?? null, closed };
    })()
  `);
  console.log('[smoke:quickopen]', JSON.stringify(quickOpen, null, 2));

  const fileOps = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const setValue = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        ).set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const button = document.querySelector('button[aria-label="新建文件"]');
      if (!button) return { hasButton: false };
      button.click();
      await wait(350);
      const input = document.querySelector('input[placeholder="文件名"]');
      if (!input) return { hasButton: true, hasInput: false };
      setValue(input, 'smoke-created');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await wait(900);

      const tree = document.querySelector('[role="tree"]');
      const rows = () => [...document.querySelectorAll('[role="treeitem"]')];
      const created = rows().find((el) =>
        (el.getAttribute('data-path') ?? '').endsWith('smoke-created.typ'),
      );
      created?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      tree?.focus();
      await wait(400);
      tree?.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
      await wait(400);
      const renameInput = document.querySelector('input[placeholder="文件名"]');
      let renamedInput = false;
      if (renameInput) {
        renamedInput = true;
        setValue(renameInput, 'smoke-renamed');
        await wait(120);
        renameInput.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        );
      }
      await wait(1200);
      const paths = rows().map((el) => el.getAttribute('data-path') ?? '');
      return {
        hasButton: true,
        hasInput: true,
        created: !!created,
        renamedInput,
        renamed: paths.some((p) => p.endsWith('smoke-renamed.typ')),
        count: paths.length,
      };
    })()
  `);
  console.log('[smoke:fileops]', JSON.stringify(fileOps, null, 2));

  const outline = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const rail = (label) => document.querySelector('button[aria-label="' + label + '"]');
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true }),
      );
      await wait(350);
      const quickItem = [...document.querySelectorAll('[data-quick-open-path]')].find(
        (el) => (el.getAttribute('data-quick-open-path') ?? '').endsWith('main.typ'),
      );
      quickItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(700);
      rail('大纲')?.click();
      await wait(350);
      const rows = [...document.querySelectorAll('[data-outline-line]')];
      const headings = rows.filter((row) => !row.hasAttribute('data-outline-kind'));
      const figures = rows.filter(
        (row) => row.getAttribute('data-outline-kind') === 'figure',
      );
      const tables = rows.filter(
        (row) => row.getAttribute('data-outline-kind') === 'table',
      );
      const target = figures[0] ?? headings[0];
      target?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(350);
      const editor = window.__deckleEditor;
      let cursorLine = null;
      if (editor) {
        cursorLine = editor.state.doc.lineAt(editor.state.selection.main.head).number;
      }
      rail('文件')?.click();
      await wait(200);
      return {
        headings: headings.length,
        figures: figures.length,
        tables: tables.length,
        figureText: figures[0]?.textContent ?? '',
        clickedLine: Number(target?.getAttribute('data-outline-line') ?? -1),
        cursorLine,
      };
    })()
  `);
  console.log('[smoke:outline]', JSON.stringify(outline, null, 2));

  const search = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const setValue = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        ).set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      };
      document.querySelector('button[aria-label="搜索"]')?.click();
      await wait(300);
      const input = document.querySelector('input[aria-label="搜索项目"]');
      if (!input) return { hasInput: false };
      setValue(input, 'Deckle');
      await wait(1200);
      const hits = [...document.querySelectorAll('[data-search-path]')];
      const first = hits[0];
      first?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(700);
      const editor = window.__deckleEditor;
      const cursorLine = editor
        ? editor.state.doc.lineAt(editor.state.selection.main.head).number
        : null;
      document.querySelector('button[aria-label="文件"]')?.click();
      await wait(200);
      return {
        hasInput: true,
        count: hits.length,
        firstPath: first?.getAttribute('data-search-path') ?? null,
        firstLine: Number(first?.getAttribute('data-search-line') ?? -1),
        cursorLine,
      };
    })()
  `);
  console.log('[smoke:search]', JSON.stringify(search, null, 2));

  const watch = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const store = window.__deckleStore;
      const state = store.getState();
      if (!state.project || !state.doc) return { hasDoc: false };
      const before = state.doc.content;
      await state.saveDoc();
      await wait(300);
      const target = state.doc.path;
      await window.deckle.fs.writeFile(
        target,
        before + '\\n\\n// external-watch-marker',
        undefined,
        true,
      );
      await wait(1500);
      const reloaded = store.getState().doc?.content.includes('external-watch-marker') ?? false;
      await window.deckle.fs.writeFile(target, before, undefined, true);
      await wait(1500);
      const restored = !(store.getState().doc?.content.includes('external-watch-marker') ?? true);
      return { hasDoc: true, reloaded, restored };
    })()
  `);
  console.log('[smoke:watch]', JSON.stringify(watch, null, 2));

  const exported = await win.webContents.executeJavaScript(`
    (async () => {
      const state = window.__deckleStore.getState();
      if (!state.project || !state.doc) return { hasDoc: false };
      const separator = state.project.path.includes('\\\\') ? '\\\\' : '/';
      const target = state.project.path + separator + 'smoke-export.pdf';
      const result = await window.deckle.exportPdf.run(
        state.project.path,
        state.project.config.mainFile,
        state.doc.content,
        target,
      );
      return { hasDoc: true, target, result };
    })()
  `);
  let exportCheck: Record<string, unknown> = { hasDoc: false };
  if (exported?.hasDoc && exported.result?.ok) {
    const target = exported.target as string;
    try {
      const bytes = await fs.readFile(target);
      exportCheck = {
        hasDoc: true,
        exists: true,
        head: bytes.subarray(0, 5).toString('latin1'),
        size: bytes.byteLength,
      };
    } catch {
      exportCheck = { hasDoc: true, exists: false };
    }
    await fs.unlink(target).catch(() => undefined);
  }
  console.log('[smoke:export]', JSON.stringify(exportCheck, null, 2));

  const recovery = await win.webContents.executeJavaScript(`
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const store = window.__deckleStore;
      if (!store) return { hasStore: false };
      const state = store.getState();
      if (!state.project || !state.doc) return { hasStore: true, hasDoc: false };
      const marker = '// snapshot-restore-marker\\n= 快照恢复\\n\\n快照内容。';
      await window.deckle.snapshot.save(state.project.path, state.doc.path, marker);
      await state.checkRecovery();
      await wait(400);
      const rows = [...document.querySelectorAll('[data-recovery-file]')];
      const restoreButton = document.querySelector('[aria-label="恢复快照"]');
      restoreButton?.click();
      await wait(900);
      const editor = window.__deckleEditor;
      const content = editor ? editor.state.doc.toString() : '';
      const dialogAfter = document.querySelectorAll('[data-recovery-file]').length;
      return {
        hasStore: true,
        hasDoc: true,
        rows: rows.length,
        restored: content.includes('snapshot-restore-marker'),
        dialogAfter,
      };
    })()
  `);
  console.log('[smoke:recovery]', JSON.stringify(recovery, null, 2));
}

/** 仅用于 M1 冒烟：等页面稳定后打印 DOM 指标、验证节点/主题/设置。 */
export function attachSmoke(win: BrowserWindow): void {
  const logFile = process.env.DECKLE_SMOKE_LOG;
  if (logFile) {
    try {
      mkdirSync(path.dirname(logFile), { recursive: true });
    } catch {
      // 忽略：日志目录不可用时仍走标准输出
    }
    const append = (level: string, args: unknown[]) => {
      try {
        const text = args
          .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
          .join(' ');
        appendFileSync(logFile, `${level} ${text}\n`, 'utf8');
      } catch {
        // 忽略：日志写失败不影响冒烟
      }
    };
    const originalLog = console.log.bind(console);
    const originalError = console.error.bind(console);
    console.log = ((...args: unknown[]) => {
      originalLog(...args);
      append('[log]', args);
    }) as typeof console.log;
    console.error = ((...args: unknown[]) => {
      originalError(...args);
      append('[error]', args);
    }) as typeof console.error;
  }

  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) {
      console.error(`[renderer:${level}] ${message}`);
    }
  });

  setTimeout(() => {
    void dumpDom(win).catch((error) => {
      console.error('[smoke] 失败', error);
    });
  }, 6000);
}

/** 仅用于性能测试：打开指定项目，测量编辑、编译、首屏渲染耗时。 */
export function attachPerfProbe(win: BrowserWindow, projectPath: string): void {
  console.log('[perf] attached', projectPath);
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) console.log('[renderer]', message);
  });
  const stepTimer = setInterval(() => {
    void win.webContents
      .executeJavaScript('window.__perfStep ?? "no-step"')
      .then((step) => console.log('[perf] step', step))
      .catch(() => undefined);
  }, 3000);

  setTimeout(() => {
    void win.webContents
      .executeJavaScript(
        `(async () => {
          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const waitFor = async (fn, timeout = 90000) => {
            const start = performance.now();
            while (performance.now() - start < timeout) {
              try {
                if (fn()) return performance.now() - start;
              } catch {}
              await sleep(50);
            }
            return -1;
          };

          window.__perfStep = 'wait-store';
          const bootstrap = await waitFor(() => window.__deckleStore, 30000);
          if (bootstrap < 0) return { ok: false, reason: 'store not ready' };
          const store = window.__deckleStore;

          window.__perfStep = 'open';
          const t0 = performance.now();
          const opened = await store.getState().openProject(${JSON.stringify(projectPath)});
          const openMs = performance.now() - t0;
          if (!opened) {
            return { ok: false, reason: 'openProject failed', openMs };
          }
          window.__perfStep = 'wait-editor';

          const editorMs = await waitFor(
            () =>
              window.__deckleEditor &&
              window.__deckleEditor.state.doc.length > 100_000,
            60000,
          );
          window.__perfStep = 'wait-compile';

          const readyMs = await waitFor(() => {
            const status = store.getState().compileStatus;
            return status === 'ready' || status === 'error';
          }, 60000);
          window.__perfStep = 'wait-canvas';

          const canvasMs = await waitFor(() => !!document.querySelector('.preview-page canvas'), 45000);

          const beforeVersion = store.getState().artifactVersion;
          const view = window.__deckleEditor;
          let editCompileMs = -1;
          if (view) {
            view.dispatch({ changes: { from: 2000, insert: ' ' } });
            editCompileMs = await waitFor(
              () => store.getState().artifactVersion > beforeVersion,
              60000,
            );
          }

          await sleep(300);
          let scrollMs = -1;
          const initialCanvases = document.querySelectorAll('.preview-page canvas').length;
          const scrollStart = performance.now();
          while (performance.now() - scrollStart < 20000) {
            const scrollEl = document.querySelector('[data-preview-scroll]');
            if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight / 2;
            if (document.querySelectorAll('.preview-page canvas').length > initialCanvases) {
              scrollMs = performance.now() - scrollStart;
              break;
            }
            await sleep(100);
          }

          await sleep(1200);

          const state = store.getState();
          const pages = document.querySelectorAll('.preview-page').length;
          const canvases = document.querySelectorAll('.preview-page canvas').length;
          window.__perfStep = 'done';
          return {
            ok: true,
            openMs: Math.round(openMs),
            editorMs: Math.round(editorMs),
            compileReadyMs: Math.round(readyMs),
            firstCanvasMs: Math.round(canvasMs),
            editCompileMs: Math.round(editCompileMs),
            scrollMidMs: Math.round(scrollMs),
            engineCompileMs: state.compileDurationMs,
            status: state.compileStatus,
            pageCount: state.pageCount,
            artifactBytes: state.artifact ? state.artifact.byteLength : 0,
            scrollDebug: (() => {
              const scrollEl = document.querySelector('[data-preview-scroll]');
              return {
                top: scrollEl ? Math.round(scrollEl.scrollTop) : -1,
                height: scrollEl ? scrollEl.scrollHeight : -1,
                client: scrollEl ? scrollEl.clientHeight : -1,
                target: !!document.querySelector('.preview-page[data-page-index="250"]'),
                rendered: [...document.querySelectorAll('.preview-page[data-rendered="1"]')]
                  .map((el) => el.getAttribute('data-page-index'))
                  .slice(0, 12),
              };
            })(),
            renderedPages: canvases,
            placeholderPages: pages,
            diagnostics: state.diagnostics.length,
            docLength: state.doc ? state.doc.content.length : 0,
            domNodes: document.querySelectorAll('*').length,
            heapMB: performance.memory
              ? Math.round(performance.memory.usedJSHeapSize / 1048576)
              : null,
          };
        })()`,
      )
      .then((result) => {
        clearInterval(stepTimer);
        console.log('[perf:500]', JSON.stringify(result, null, 2));
      })
      .catch((error) => {
        clearInterval(stepTimer);
        console.error('[perf] 失败', error);
      });
  }, 2500);
}
