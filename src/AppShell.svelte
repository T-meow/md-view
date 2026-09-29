<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { open, save } from '@tauri-apps/plugin-dialog';
  import { convertFileSrc, isTauri } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import {
    BookOpen,
    FilePlus2,
    FolderOpen,
    Save,
    Search,
    Settings,
    PanelLeft,
    PanelRight,
    X,
    Code2,
    Pencil,
    Columns2,
    Maximize2
  } from 'lucide-svelte';
  import DocumentTabs from './components/DocumentTabs.svelte';
  import FileBrowser from './components/FileBrowser.svelte';
  import QuickOpen from './components/QuickOpen.svelte';
  import TextPrompt from './components/TextPrompt.svelte';
  import MarkdownPreview from './components/MarkdownPreview.svelte';
  import OutlinePanel from './components/OutlinePanel.svelte';
  import { createDesktop } from './state/desktop';
  import { dirty, filename, parentPath } from './state/documents';
  import { extractHeadingsFromMarkdown } from './outline';
  import { applyTheme, BACKGROUND_IMAGE_STORAGE_KEY, findTheme, THEME_STORAGE_KEY, themes } from './themes';
  import { loadLanguage, saveLanguage, text, type Language } from './i18n';
  import { appVersion } from './edition';
  import * as api from './api';
  import type { DirectoryEntry, Heading, ViewMode } from './types';
  import type { SearchItem } from './state/search';
  import { modalFocus } from './state/modal';
  import { calculatePaneLayout, resizePane, type PaneSide } from './state/layout';
  import type { EditorState } from '@codemirror/state';
  import './desktop.css';

  export let editionDisplayName = 'md-view';
  export let defaultPreviewPreferences: any = undefined;
  export let loadPreviewPreferences: (() => any) | undefined = undefined;
  export let savePreviewPreferences: ((preferences: any) => void) | undefined = undefined;
  export let previewReaderStyle: ((preferences: any) => string) | undefined = undefined;
  export let markdownStatus = '';
  export let settingsPanelComponent: any = null;
  export let enableHeadingSearch = false;
  export let exportHtmlFile: ((path: string, html: string) => Promise<void>) | undefined = undefined;

  const desktop = createDesktop();
  const { documents, workspace, search, preferences, status, saving, prompt } = desktop;
  let language: Language = loadLanguage();
  let previewPreferences = loadPreviewPreferences?.() ?? defaultPreviewPreferences;
  let selectedTheme = findTheme(localStorage.getItem(THEME_STORAGE_KEY));
  let backgroundPath = localStorage.getItem(BACKGROUND_IMAGE_STORAGE_KEY) || '';
  let backgroundUrl = '';
  let readingFocusEnabled = localStorage.getItem('md-view-reading-focus-enabled') !== 'false';
  let settingsOpen = false;
  let advancedOpen = false;
  let quickOpen = false;
  let excludesText = '';
  let immersive = false;
  let dropActive = false;
  let contextMenu: { entry: DirectoryEntry; x: number; y: number } | null = null;
  let Editor: any = null;
  let VisualEditor: any = null;
  let editorPromise: Promise<void> | null = null;
  let visualPromise: Promise<void> | null = null;
  let previewRef: MarkdownPreview;
  let editorRef: any;
  let visualRef: any;
  let renderedHtml = '';
  let renderedKey = '';
  let readingProgress = 0;
  let activeLine = 0;
  let linkStatus = { broken: 0, total: 0 };
  let closeInProgress = false;
  let lastTitle = '';
  let outline: Heading[] = [];
  let outlineKey = '';
  let outlineTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingJump: { id: string; line?: number; anchor?: string } | null = null;
  let drag: { side: PaneSide; start: number; width: number } | null = null;
  let workspaceWidth = window.innerWidth;

  $: active = $documents.tabs.find((doc) => doc.id === $documents.activeId);
  $: t = text[language];
  $: paneLayout = calculatePaneLayout({
    width: workspaceWidth,
    leftWidth: $preferences.leftWidth,
    rightWidth: $preferences.rightWidth,
    leftVisible: !$preferences.leftClosed && !immersive && Boolean($workspace.root || !active),
    rightVisible: !$preferences.rightClosed && !immersive && Boolean(active)
  });
  $: currentKey = active ? `${active.id}:${active.version}` : '';
  $: if (currentKey !== renderedKey) {
    renderedKey = currentKey;
    renderedHtml = '';
  }
  $: if (currentKey !== outlineKey) {
    outlineKey = currentKey;
    updateOutline();
  }
  $: if (active?.mode === 'edit' || active?.mode === 'split') void loadEditor();
  $: if (active?.mode === 'visual') void loadVisual();
  $: void syncTitle(
    active
      ? `${dirty(active) ? '● ' : ''}${filename(active.path)} — ${editionDisplayName}`
      : editionDisplayName
  );
  $: openPaths = $documents.tabs.map((doc) => doc.path).join('\0');
  $: recentPaths = $preferences.recent.join('\0');
  $: localItems = collectLocalItems(openPaths, recentPaths, $workspace);
  $: paneStyle = `${previewReaderStyle?.(previewPreferences) || ''};${backgroundUrl ? `--reader-background-image:url("${backgroundUrl}");` : ''}`;
  function collectLocalItems(_open: string, _recent: string, _workspace: unknown) {
    return desktop.localSearchItems();
  }

  function updateOutline() {
    clearTimeout(outlineTimer);
    const doc = active;
    if (!doc) {
      outline = [];
      return;
    }
    const compute = () => {
      if (active?.id === doc.id && active.version === doc.version)
        outline = extractHeadingsFromMarkdown(doc.content);
    };
    if (doc.mode === 'read') compute();
    else outlineTimer = setTimeout(compute, 200);
  }
  async function loadEditor() {
    editorPromise ??= import('./components/MarkdownEditor.svelte').then((module) => {
      Editor = module.default;
    });
    try {
      await editorPromise;
    } catch (error) {
      editorPromise = null;
      status.set(`编辑器加载失败：${String(error)}`);
    }
  }
  async function loadVisual() {
    visualPromise ??= import('./components/VisualMarkdownEditor.svelte').then((module) => {
      VisualEditor = module.default;
    });
    try {
      await visualPromise;
    } catch (error) {
      visualPromise = null;
      status.set(`可视化编辑器加载失败：${String(error)}`);
    }
  }
  function setMode(mode: ViewMode) {
    if (active) documents.patch(active.id, { mode });
  }
  function openSettings() {
    excludesText = $preferences.excludes.join('\n');
    settingsOpen = true;
  }
  function setTheme(id: string) {
    selectedTheme = findTheme(id);
    applyTheme(selectedTheme);
    localStorage.setItem(THEME_STORAGE_KEY, id);
  }
  function setLanguage(value: Language) {
    language = value;
    saveLanguage(value);
  }
  async function chooseBackground() {
    const path = await open({
      title: '选择阅读背景',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    });
    if (typeof path === 'string') {
      backgroundPath = path;
      localStorage.setItem(BACKGROUND_IMAGE_STORAGE_KEY, path);
      setBackground(path);
    }
  }
  function setBackground(path: string) {
    if (!path) {
      backgroundUrl = '';
      return;
    }
    const image = new Image();
    const url = convertFileSrc(path);
    image.onload = () => {
      if (backgroundPath === path) backgroundUrl = url;
    };
    image.onerror = () => {
      if (backgroundPath === path) {
        backgroundUrl = '';
        status.set('背景图片无法读取，请重新选择');
      }
    };
    image.src = url;
  }
  function clearBackground() {
    backgroundPath = '';
    backgroundUrl = '';
    localStorage.removeItem(BACKGROUND_IMAGE_STORAGE_KEY);
  }
  function setPreviewPreferences(next: any) {
    previewPreferences = next;
    savePreviewPreferences?.(next);
  }
  async function applyExcludes() {
    desktop.setPreferences({
      ...$preferences,
      excludes: excludesText
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean)
    });
    if ($workspace.root) await desktop.openWorkspace($workspace.root);
  }
  async function syncTitle(title: string) {
    if (title === lastTitle || !isTauri()) return;
    lastTitle = title;
    try {
      await getCurrentWindow().setTitle(title);
    } catch {}
  }
  async function toggleImmersive() {
    try {
      immersive = !(await getCurrentWindow().isFullscreen());
      await getCurrentWindow().setFullscreen(immersive);
    } catch (error) {
      await desktop.error(error);
    }
  }
  async function closeWindow() {
    if (closeInProgress) return;
    closeInProgress = true;
    try {
      if (await desktop.closeAll()) await getCurrentWindow().destroy();
    } catch (cause) {
      await desktop.flushDrafts().catch(() => {});
      await desktop.error(cause);
    } finally {
      closeInProgress = false;
    }
  }
  function headingJump(heading: Heading) {
    if (active?.mode === 'visual') visualRef?.scrollToLine(heading.line);
    else {
      previewRef?.scrollToLine(heading.line);
      editorRef?.focusLine(heading.line);
    }
  }
  async function selectSearch(item: SearchItem) {
    quickOpen = false;
    const id = await desktop.openFile(item.path);
    if (id && (item.line || item.anchor)) {
      documents.patch(id, { mode: 'read' });
      pendingJump = { id, line: item.line, anchor: item.anchor };
      await tick();
      applyPendingJump();
    }
  }
  function applyPendingJump() {
    if (!pendingJump || pendingJump.id !== active?.id || !previewRef || !renderedHtml) return;
    const jump = pendingJump;
    pendingJump = null;
    requestAnimationFrame(() => {
      if (active?.id !== jump.id) return;
      if (jump.anchor) previewRef?.scrollToAnchor(jump.anchor);
      else if (jump.line) previewRef?.scrollToLine(jump.line);
    });
  }
  function acceptHtml(html: string) {
    renderedHtml = html;
    applyPendingJump();
  }
  async function exportHtml() {
    if (!active || !renderedHtml || !exportHtmlFile) return;
    const title = filename(active.path).replace(/[&<>"']/g, '');
    const body = renderedHtml;
    const exportLanguage = language;
    const path = await save({
      title: '导出 HTML',
      defaultPath: `${filename(active.path)}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }]
    });
    if (!path) return;
    const html = `<!doctype html><html lang="${exportLanguage}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:16px/1.75 system-ui,sans-serif;max-width:920px;margin:40px auto;padding:0 24px;color:#243330}img{max-width:100%}pre{overflow:auto;padding:16px;background:#f2f5f4}table{border-collapse:collapse;display:block;overflow:auto}td,th{border:1px solid #ccd7d3;padding:8px}blockquote{border-left:3px solid #91aaa1;padding-left:16px}</style></head><body><article>${body}</article></body></html>`;
    try {
      await exportHtmlFile(path, html);
      status.set('HTML 已导出');
    } catch (error) {
      await desktop.error(error);
    }
  }
  function menu(entry: DirectoryEntry, x: number, y: number) {
    contextMenu = {
      entry,
      x: Math.min(x, window.innerWidth - 210),
      y: Math.max(8, Math.min(y, window.innerHeight - 340))
    };
  }
  function contextAction(action: string) {
    const entry = contextMenu?.entry;
    contextMenu = null;
    if (!entry) return;
    if (action === 'copy') void navigator.clipboard.writeText(entry.path).catch(desktop.error);
    else if (action === 'reveal') void api.revealPath(entry.path).catch(desktop.error);
    else if (action === 'new-file')
      void desktop.newFile(entry.kind === 'directory' ? entry.path : parentPath(entry.path));
    else if (action === 'new-folder')
      void desktop.newFolder(entry.kind === 'directory' ? entry.path : parentPath(entry.path));
    else if (action === 'refresh') void desktop.refreshDirectory(entry.path);
    else if (action === 'rename' || action === 'move' || action === 'trash')
      void desktop.mutate(entry, action);
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      contextMenu = null;
      quickOpen = false;
      settingsOpen = false;
      advancedOpen = false;
      if (immersive) void toggleImmersive();
      return;
    }
    if (event.key === 'F11') {
      event.preventDefault();
      void toggleImmersive();
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || $prompt || quickOpen || settingsOpen || advancedOpen) return;
    const key = event.key.toLowerCase();
    if (key === 'n') {
      event.preventDefault();
      desktop.createDocument();
    } else if (key === 'o') {
      event.preventDefault();
      void desktop.chooseFiles();
    } else if (key === 'p') {
      event.preventDefault();
      quickOpen = true;
    } else if (key === 's' && active) {
      event.preventDefault();
      void desktop.saveTab(active.id, event.shiftKey);
    } else if (key === 'w' && active) {
      event.preventDefault();
      void desktop.closeTab(active.id);
    } else if (key === 'tab' && active) {
      event.preventDefault();
      const tabs = $documents.tabs;
      const index = tabs.findIndex((doc) => doc.id === active.id);
      desktop.activate(tabs[(index + (event.shiftKey ? tabs.length - 1 : 1)) % tabs.length].id);
    } else if (key === 'z' && active?.mode === 'visual') {
      event.preventDefault();
      documents.undoVisual(active.id, event.shiftKey);
      desktop.scheduleDraft(active.id);
    }
  }
  function measureWorkspace(node: HTMLElement) {
    if (node.clientWidth) workspaceWidth = node.clientWidth;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) workspaceWidth = entry.contentRect.width;
    });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
  function resizeStart(event: PointerEvent, side: PaneSide) {
    event.preventDefault();
    drag = {
      side,
      start: event.clientX,
      width: side === 'left' ? paneLayout.leftWidth : paneLayout.rightWidth
    };
  }
  function resizeMove(event: PointerEvent) {
    if (!drag) return;
    const width = drag.width + (event.clientX - drag.start) * (drag.side === 'left' ? 1 : -1);
    const currentWidth = drag.side === 'left' ? paneLayout.leftWidth : paneLayout.rightWidth;
    if (width === currentWidth) return;
    const resized = resizePane(paneLayout, drag.side, width);
    preferences.update((p) => ({ ...p, ...resized }));
  }
  function resizeEnd() {
    if (drag) {
      drag = null;
      desktop.setPreferences($preferences);
    }
  }
  function resizeKey(event: KeyboardEvent, side: PaneSide) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const width = side === 'left' ? paneLayout.leftWidth : paneLayout.rightWidth;
    const delta = (event.key === 'ArrowRight' ? 16 : -16) * (side === 'left' ? 1 : -1);
    desktop.setPreferences({
      ...$preferences,
      ...resizePane(paneLayout, side, width + delta)
    });
  }

  onMount(() => {
    applyTheme(selectedTheme);
    setBackground(backgroundPath);
    if (!isTauri()) return;
    let destroyed = false;
    const cleanup: (() => void)[] = [];
    let changesTimer: ReturnType<typeof setTimeout>;
    const changedPaths = new Set<string>();
    const attach = (promise: Promise<() => void>) => {
      void promise
        .then((unlisten) => (destroyed ? unlisten() : cleanup.push(unlisten)))
        .catch((error) => status.set(String(error)));
    };
    attach(
      getCurrentWindow().onCloseRequested((event) => {
        event.preventDefault();
        void closeWindow();
      })
    );
    attach(
      getCurrentWebview().onDragDropEvent((event) => {
        dropActive = event.payload.type === 'enter' || event.payload.type === 'over';
        if (event.payload.type === 'drop') {
          const paths = event.payload.paths;
          void (async () => {
            for (const path of paths) await desktop.openPath(path);
          })();
        }
      })
    );
    attach(
      listen<{ paths: string[] }>('workspace-changed', (event) => {
        event.payload.paths.forEach((path) => changedPaths.add(path));
        clearTimeout(changesTimer);
        changesTimer = setTimeout(() => {
          const paths = [...changedPaths];
          changedPaths.clear();
          void desktop.handleChanges(paths);
        }, 300);
      })
    );
    const focus = () => {
      void desktop.refreshVisible();
    };
    window.addEventListener('focus', focus);
    void (async () => {
      for (const path of await api.initialOpenPaths()) await desktop.openPath(path);
      await desktop.restoreUntitled();
    })().catch(desktop.error);
    return () => {
      destroyed = true;
      cleanup.forEach((fn) => fn());
      window.removeEventListener('focus', focus);
      clearTimeout(changesTimer);
      clearTimeout(outlineTimer);
      desktop.dispose();
    };
  });
</script>

<svelte:window
  on:keydown={keydown}
  on:pointermove={resizeMove}
  on:pointerup={resizeEnd}
  on:pointercancel={resizeEnd}
  on:click={() => (contextMenu = null)}
/>

<main
  class="desktop-shell"
  class:immersive
  class:drop-active={dropActive}
  style={`--nav-width:${paneLayout.leftWidth}px;--outline-width:${paneLayout.rightWidth}px`}
>
  <header class="desktop-toolbar">
    <div class="desktop-brand"><BookOpen size={21} /><strong>{editionDisplayName}</strong></div>
    <div class="desktop-actions">
      <button title="新建 (Ctrl+N)" aria-label="新建" on:click={desktop.createDocument}
        ><FilePlus2 size={17} /></button
      >
      <button title="打开文件 (Ctrl+O)" on:click={desktop.chooseFiles}
        ><FolderOpen size={17} /><span>{t.actions.open}</span></button
      >
      <button
        title="保存 (Ctrl+S)"
        aria-label="保存"
        disabled={!active || $saving.has(active.id)}
        on:click={() => active && desktop.saveTab(active.id)}><Save size={17} /></button
      >
      <span class="toolbar-divider"></span>
      <button class="quick-trigger" title="快速打开 (Ctrl+P)" on:click={() => (quickOpen = true)}
        ><Search size={15} /><span>快速打开</span><kbd>Ctrl P</kbd></button
      >
    </div>
    <div class="desktop-utilities">
      <button
        class:active={!$preferences.leftClosed && Boolean($workspace.root)}
        title="文件栏 / 打开文件夹"
        aria-label="切换文件栏"
        on:click={() =>
          $workspace.root
            ? desktop.setPreferences({ ...$preferences, leftClosed: !$preferences.leftClosed })
            : desktop.chooseWorkspace()}><PanelLeft size={17} /></button
      >
      <button
        class:active={paneLayout.rightVisible}
        class:auto-collapsed={paneLayout.outlineAutoClosed}
        title={paneLayout.outlineAutoClosed ? t.panels.outlineAutoClosed : t.panels.outline}
        aria-label={paneLayout.outlineAutoClosed ? t.panels.outlineAutoClosed : t.panels.outline}
        aria-pressed={paneLayout.rightVisible}
        aria-disabled={paneLayout.outlineAutoClosed}
        on:click={() =>
          paneLayout.outlineAutoClosed
            ? status.set(t.panels.outlineAutoClosed)
            : desktop.setPreferences({ ...$preferences, rightClosed: !$preferences.rightClosed })}
        ><PanelRight size={17} /></button
      >
      <button title="设置" aria-label="设置" on:click={openSettings}><Settings size={17} /></button>
    </div>
  </header>
  <DocumentTabs
    tabs={$documents.tabs}
    activeId={$documents.activeId}
    onSelect={desktop.activate}
    onClose={(id) => void desktop.closeTab(id)}
    onCreate={desktop.createDocument}
  />
  <div class="desktop-workspace" use:measureWorkspace>
    {#if paneLayout.leftVisible}
      <aside class="desktop-sidebar">
        <FileBrowser
          workspace={$workspace}
          selectedPath={active?.path || ''}
          onSelect={(entry) =>
            entry.kind === 'directory'
              ? void desktop.toggleDirectory(entry)
              : void desktop.openFile(entry.path)}
          onRefresh={() => void desktop.refreshVisible()}
          onMenu={menu}
          onNewFile={() => void desktop.newFile()}
          onNewFolder={() => void desktop.newFolder()}
          onChoose={() => void desktop.chooseWorkspace()}
        />
      </aside>
      <div
        class="pane-resizer"
        role="slider"
        tabindex="0"
        aria-label="调整文件栏宽度"
        aria-valuemin="180"
        aria-valuemax={Math.round(paneLayout.leftMaxWidth)}
        aria-valuenow={Math.round(paneLayout.leftWidth)}
        aria-orientation="horizontal"
        on:pointerdown={(event) => resizeStart(event, 'left')}
        on:keydown={(event) => resizeKey(event, 'left')}
      ></div>
    {/if}
    <section id="document-panel" class="desktop-document" role="tabpanel">
      {#if active}
        <div class="document-heading">
          <div class="document-identity">
            <strong>{filename(active.path)}</strong><small title={active.path}
              >{active.path ? parentPath(active.path) : '尚未保存到文件'}</small
            >
          </div>
          <div class="document-modes" aria-label="视图模式">
            <button
              class:active={active.mode === 'read'}
              title={t.modes.read}
              on:click={() => setMode('read')}><BookOpen size={14} /><span>{t.modes.read}</span></button
            >
            <button
              class:active={active.mode === 'edit'}
              title={t.modes.edit}
              on:click={() => setMode('edit')}><Code2 size={14} /><span>{t.modes.edit}</span></button
            >
            <button
              class:active={active.mode === 'visual'}
              title={t.modes.visual}
              on:click={() => setMode('visual')}><Pencil size={14} /><span>{t.modes.visual}</span></button
            >
            <button
              class:active={active.mode === 'split'}
              title={t.modes.split}
              on:click={() => setMode('split')}><Columns2 size={14} /><span>{t.modes.split}</span></button
            >
          </div>
        </div>
        {#if active.externalChanged}<div class="document-warning" role="status">
            <span
              >{active.missing
                ? '原文件已删除或无法访问，编辑内容仍保留在此标签。'
                : '文件已被其他程序修改，请处理当前编辑内容。'}</span
            ><button on:click={() => active && desktop.reload(active.id)}>重新载入</button><button
              on:click={() => active && desktop.saveTab(active.id, true)}>另存为</button
            >
          </div>{/if}
        {#key active.id}
          {@const docId = active.id}
          <div
            class="desktop-content"
            class:has-reader-bg={Boolean(backgroundUrl)}
            class:split={active.mode === 'split'}
            style={paneStyle}
          >
            {#if active.mode === 'edit' || active.mode === 'split'}
              {#if Editor}<svelte:component
                  this={Editor}
                  bind:this={editorRef}
                  value={active.content}
                  savedState={active.editorState}
                  initialScroll={active.editorScroll}
                  on:change={(event: CustomEvent<string>) => desktop.edit(docId, event.detail)}
                  on:state={(event: CustomEvent<{ state: EditorState; scroll: number }>) =>
                    documents.patch(docId, {
                      editorState: event.detail.state,
                      editorScroll: event.detail.scroll
                    })}
                />{:else}<div class="pane-loading">正在加载编辑器…</div>{/if}
            {/if}
            {#if active.mode === 'read' || active.mode === 'split'}
              <MarkdownPreview
                bind:this={previewRef}
                content={active.content}
                {outline}
                {language}
                filePath={active.path}
                preferences={previewPreferences}
                fallbackRenderStatus={markdownStatus}
                {readingFocusEnabled}
                initialScroll={active.previewScroll}
                on:position={(event) => documents.patch(docId, { previewScroll: event.detail })}
                on:openLocalFile={(event) =>
                  selectSearch({
                    path: event.detail.path,
                    anchor: event.detail.anchor,
                    label: '',
                    detail: ''
                  })}
                on:renderHtml={(event) => acceptHtml(event.detail)}
                on:readingProgress={(event) => (readingProgress = event.detail)}
                on:activeLine={(event) => (activeLine = event.detail)}
                on:linkStatus={(event) => {
                  linkStatus = event.detail;
                  if (event.detail.failed) status.set(t.preview.linkCheckFailed);
                }}
              />
            {/if}
            {#if active.mode === 'visual'}
              {#if VisualEditor}<svelte:component
                  this={VisualEditor}
                  bind:this={visualRef}
                  value={active.content}
                  {outline}
                  filePath={active.path}
                  strings={t.visual}
                  initialScroll={active.visualScroll}
                  on:position={(event: CustomEvent<number>) =>
                    documents.patch(docId, { visualScroll: event.detail })}
                  on:change={(event: CustomEvent<string>) => desktop.edit(docId, event.detail, true)}
                />{:else}<div class="pane-loading">正在加载可视化编辑器…</div>{/if}
            {/if}
          </div>
        {/key}
      {:else}
        <div class="desktop-welcome">
          <div class="welcome-symbol"><BookOpen size={38} strokeWidth={1.3} /></div>
          <p class="eyebrow">YOUR WORDS, YOUR SPACE</p>
          <h1>打开文字，开始专注。</h1>
          <p>阅读、整理和编辑本地 Markdown。<br />从一份文档开始，按需要打开文件夹。</p>
          <div class="welcome-actions">
            <button class="primary" on:click={desktop.chooseFiles}><FolderOpen size={17} />打开文件</button
            ><button on:click={desktop.createDocument}><FilePlus2 size={17} />新建文档</button>
          </div>
          <button class="text-button" on:click={desktop.chooseWorkspace}>打开项目文件夹 →</button>
          {#if $preferences.recent.length}<div class="recent-files">
              <span>最近打开</span>{#each $preferences.recent.slice(0, 5) as path}<button
                  title={path}
                  on:click={() => desktop.openFile(path)}
                  ><strong>{filename(path)}</strong><small>{parentPath(path)}</small></button
                >{/each}
            </div>{/if}
        </div>
      {/if}
    </section>
    {#if paneLayout.rightVisible}
      <div
        class="pane-resizer"
        role="slider"
        tabindex="0"
        aria-label="调整大纲宽度"
        aria-valuemin="180"
        aria-valuemax={Math.round(paneLayout.rightMaxWidth)}
        aria-valuenow={Math.round(paneLayout.rightWidth)}
        aria-orientation="horizontal"
        on:pointerdown={(event) => resizeStart(event, 'right')}
        on:keydown={(event) => resizeKey(event, 'right')}
      ></div>
      <aside class="desktop-outline">
        <div class="browser-heading">
          <strong>{t.panels.outline}</strong><button
            aria-label="收起大纲"
            on:click={() => desktop.setPreferences({ ...$preferences, rightClosed: true })}
            ><X size={14} /></button
          >
        </div>
        <OutlinePanel
          headings={outline}
          strings={t.panels}
          {activeLine}
          on:jump={(event) => headingJump(event.detail)}
        />
      </aside>
    {/if}
  </div>
  <footer class="status-bar desktop-status">
    <span role="status">{$status}</span>
    <div>
      {#if active}<span>{dirty(active) ? '未保存' : '已保存'}</span><span
          >{active.encoding}{active.bom ? ' BOM' : ''} · {active.newline.toUpperCase()}</span
        >{#if active.mode === 'read' || active.mode === 'split'}<span>{readingProgress}%</span
          >{/if}{#if linkStatus.broken}<span>{linkStatus.broken} 个失效链接</span>{/if}{/if}<span
        >{appVersion}</span
      >
    </div>
  </footer>
  {#if immersive}<button class="immersive-exit" on:click={toggleImmersive}>退出沉浸 · F11</button>{/if}
</main>

{#if quickOpen}<QuickOpen
    {localItems}
    scannedItems={$search.items}
    workspace={$workspace.root}
    headingsEnabled={enableHeadingSearch}
    busy={$search.busy}
    status={$search.message}
    scanned={$search.scanned}
    skipped={$search.skipped}
    errors={$search.errors}
    incomplete={$search.incomplete}
    onClose={() => (quickOpen = false)}
    onSelect={(item) => void selectSearch(item)}
    onScan={(kind) => void desktop.startSearch(kind)}
    onCancel={desktop.cancelSearch}
  />{/if}
{#if $prompt}<TextPrompt title={$prompt.title} value={$prompt.value} onDone={desktop.resolvePrompt} />{/if}
{#if contextMenu}
  <div class="file-context-menu" role="menu" style={`left:${contextMenu.x}px;top:${contextMenu.y}px`}>
    <button role="menuitem" on:click={() => contextAction('new-file')}>新建 Markdown</button><button
      role="menuitem"
      on:click={() => contextAction('new-folder')}>新建文件夹</button
    >
    <hr />
    <button role="menuitem" on:click={() => contextAction('rename')}>重命名</button><button
      role="menuitem"
      on:click={() => contextAction('move')}>移动到…</button
    ><button role="menuitem" on:click={() => contextAction('copy')}>复制路径</button><button
      role="menuitem"
      on:click={() => contextAction('reveal')}>在文件管理器中定位</button
    >{#if contextMenu.entry.kind === 'directory'}<button
        role="menuitem"
        on:click={() => contextAction('refresh')}>刷新此目录</button
      >{/if}
    <hr />
    <button role="menuitem" class="danger" on:click={() => contextAction('trash')}>移入回收站</button>
  </div>
{/if}
{#if settingsOpen}
  <div class="dialog-backdrop" role="presentation" on:click={() => (settingsOpen = false)}></div>
  <div
    class="shell-settings app-dialog"
    role="dialog"
    aria-modal="true"
    aria-label="设置"
    tabindex="-1"
    use:modalFocus
  >
    <header>
      <h2>设置</h2>
      <button aria-label="关闭设置" on:click={() => (settingsOpen = false)}><X size={19} /></button>
    </header>
    <div class="settings-body">
      <fieldset>
        <legend>外观与阅读</legend><label
          >主题<select value={selectedTheme.id} on:change={(event) => setTheme(event.currentTarget.value)}
            >{#each themes as theme}<option value={theme.id}>{theme.name}</option>{/each}</select
          ></label
        ><label
          >语言<select
            value={language}
            on:change={(event) => setLanguage(event.currentTarget.value as Language)}
            ><option value="zh">简体中文</option><option value="en">English</option></select
          ></label
        ><label class="check-setting"
          ><input
            type="checkbox"
            bind:checked={readingFocusEnabled}
            on:change={() =>
              localStorage.setItem('md-view-reading-focus-enabled', String(readingFocusEnabled))}
          />高亮当前阅读段落</label
        >
        <div class="settings-buttons">
          <button on:click={chooseBackground}>选择阅读背景</button>{#if backgroundPath}<button
              on:click={clearBackground}>清除背景</button
            >{/if}<button on:click={toggleImmersive}><Maximize2 size={14} />沉浸阅读</button>
        </div>
      </fieldset>
      <fieldset>
        <legend>保存与恢复</legend>
        <p>编辑内容自动保留为草稿；关闭未保存的文档时询问如何处理。</p>
        <label class="check-setting"
          ><input
            type="checkbox"
            checked={$preferences.autoWrite}
            on:change={(event) =>
              desktop.setPreferences({ ...$preferences, autoWrite: event.currentTarget.checked })}
          />自动写回已保存过的原文件</label
        >
        <p class="muted">开启后停止输入约 1 秒自动写回；发现外部修改时暂停。</p>
        {#if active}<button on:click={() => active && desktop.saveTab(active.id, true)}>另存为…</button>{/if}
      </fieldset>
      <fieldset>
        <legend>文件夹与搜索</legend><label
          >排除目录或模式（每行一条）<textarea
            bind:value={excludesText}
            rows="4"
            placeholder="build&#10;**/.cache/**"
          ></textarea></label
        >
        <p>同时遵循 .gitignore 与 .ignore。直接打开文件不受排除规则影响。</p>
        <button on:click={applyExcludes}>应用并刷新目录</button>
      </fieldset>
      <fieldset>
        <legend>更多</legend>
        <div class="settings-buttons">
          {#if settingsPanelComponent}<button
              on:click={() => {
                settingsOpen = false;
                advancedOpen = true;
              }}>Markdown 与排版</button
            >{/if}<button on:click={() => api.openDefaultAppSettings().catch(desktop.error)}
            >设为默认 Markdown 应用</button
          >{#if exportHtmlFile}<button disabled={!renderedHtml} on:click={exportHtml}>导出 HTML</button
            ><button disabled={!active} on:click={() => window.print()}>打印 / PDF</button>{/if}
        </div>
      </fieldset>
      <fieldset class="about-settings">
        <legend>{t.about.title}</legend>
        <strong>{editionDisplayName}</strong>
        <dl>
          <dt>{t.about.version}</dt>
          <dd>{appVersion || '—'}</dd>
          <dt>{t.about.author}</dt>
          <dd>T-meow</dd>
          <dt>{t.about.license}</dt>
          <dd>WTFPL v2</dd>
        </dl>
        <div class="settings-buttons">
          <a
            href="https://t-meow.github.io/md-view/"
            target="_blank"
            rel="noopener noreferrer"
            on:click|preventDefault={() =>
              api.openExternalUrl('https://t-meow.github.io/md-view/').catch(desktop.error)}
            >{t.about.website}</a
          >
          <a
            href="https://github.com/T-meow/md-view"
            target="_blank"
            rel="noopener noreferrer"
            on:click|preventDefault={() =>
              api.openExternalUrl('https://github.com/T-meow/md-view').catch(desktop.error)}
            >{t.about.repository}</a
          >
        </div>
      </fieldset>
    </div>
  </div>
{/if}
{#if settingsPanelComponent}<svelte:component
    this={settingsPanelComponent}
    open={advancedOpen}
    preferences={previewPreferences}
    onChange={setPreviewPreferences}
    onClose={() => (advancedOpen = false)}
    onReset={() => setPreviewPreferences(defaultPreviewPreferences)}
    onExportHtml={exportHtml}
    onPrint={() => window.print()}
  />{/if}
