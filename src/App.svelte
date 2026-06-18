<script lang="ts">
  import { onMount } from 'svelte';
  import { confirm, message, open } from '@tauri-apps/plugin-dialog';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import FileTree from './components/FileTree.svelte';
  import MarkdownEditor from './components/MarkdownEditor.svelte';
  import MarkdownPreview from './components/MarkdownPreview.svelte';
  import OutlinePanel from './components/OutlinePanel.svelte';
  import VisualMarkdownEditor from './components/VisualMarkdownEditor.svelte';
  import { formatText, loadLanguage, nextLanguage, saveLanguage, text, type Language } from './i18n';
  import { applyTheme, BACKGROUND_IMAGE_STORAGE_KEY, findTheme, THEME_STORAGE_KEY, themes } from './themes';
  import type { AppTheme, FileNode, Heading, ReadFileResult, ViewMode } from './types';
  import {
    clearWorkspaceDrafts,
    deleteDraft,
    extractOutline,
    initialOpenPaths,
    openDefaultAppSettings,
    openPath,
    openWorkspace,
    readDraft,
    readFile,
    saveFile,
    writeDraft
  } from './tauri';

  let workspacePath = '';
  let tree: FileNode | null = null;
  let selectedPath = '';
  let content = '';
  let savedContent = '';
  let encoding = '';
  let modifiedAt: number | null = null;
  let outline: Heading[] = [];
  let mode: ViewMode = 'read';
  let language: Language = 'zh';
  let t = text.zh;
  let status = t.status.ready;
  let busy = false;
  let defaultSettingsBusy = false;
  let dirty = false;
  let dropActive = false;
  let selectedTheme: AppTheme = themes[0];
  let backgroundImagePath = '';
  let backgroundImageUrl = '';
  let backgroundImageLoadToken = 0;
  let leftSidebarCollapsed = false;
  let rightSidebarCollapsed = false;
  let askBeforeLeaveSave = false;
  let immersiveMode = false;
  let closeInProgress = false;
  let lastWindowTitle = '';
  let draftTimer: number | undefined;
  let outlineTimer: number | undefined;
  let editorRef: MarkdownEditor;
  let previewRef: MarkdownPreview;
  let visualRef: VisualMarkdownEditor;

  const LEFT_SIDEBAR_COLLAPSED_KEY = 'md-view-left-sidebar-collapsed';
  const RIGHT_SIDEBAR_COLLAPSED_KEY = 'md-view-right-sidebar-collapsed';
  const AUTO_SAVE_ENABLED_KEY = 'md-view-auto-save-enabled';
  const ASK_BEFORE_LEAVE_SAVE_KEY = 'md-view-ask-before-leave-save';

  $: t = text[language];
  $: rootNodes = tree ? tree.children : [];
  $: fileName = selectedPath ? selectedPath.split(/[\\/]/).pop() ?? selectedPath : '';
  $: contentPaneStyle = backgroundImageUrl ? `--reader-background-image: url("${backgroundImageUrl}")` : '';
  $: workspaceStyle = [
    `--left-sidebar-width: ${leftSidebarCollapsed ? '44px' : '280px'}`,
    `--right-sidebar-width: ${rightSidebarCollapsed ? '44px' : '240px'}`
  ].join('; ');
  $: void syncWindowTitle(fileName, dirty);

  async function chooseWorkspace() {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t.dialogs.chooseMarkdownDir
    });
    if (typeof selected !== 'string') return;
    await loadWorkspace(selected);
  }

  async function loadWorkspace(path: string) {
    await loadPath(path);
  }

  async function loadPath(path: string) {
    if (!(await ensureSafeToLeave())) return;
    busy = true;
    status = t.status.opening;
    try {
      const result = await openPath(path);
      if (!result.tree || !result.workspace_path) {
        throw new Error('打开结果缺少工作区信息');
      }

      applyWorkspace(result.tree, result.workspace_path, result.kind === 'workspace');

      if (result.kind === 'file') {
        if (!result.file) {
          throw new Error('打开结果缺少文件内容');
        }
        await openReadResult(result.file);
      } else {
        status = t.status.folderOpened;
      }
    } catch (error) {
      status = t.status.openFailed;
      await message(String(error), { title: t.dialogs.openFailed, kind: 'error' });
    } finally {
      busy = false;
    }
  }

  function applyWorkspace(nextTree: FileNode, nextPath: string, resetFile: boolean) {
    tree = nextTree;
    workspacePath = nextPath;
    if (resetFile) {
      clearCurrentFile();
    }
  }

  function clearCurrentFile() {
    selectedPath = '';
    content = '';
    savedContent = '';
    encoding = '';
    outline = [];
    dirty = false;
    modifiedAt = null;
  }

  async function refreshWorkspace() {
    if (!workspacePath) return;
    busy = true;
    try {
      tree = await openWorkspace(workspacePath);
      status = t.status.folderRefreshed;
    } catch (error) {
      status = t.status.refreshFailed;
      await message(String(error), { title: t.dialogs.refreshFailed, kind: 'error' });
    } finally {
      busy = false;
    }
  }

  async function ensureSafeToLeave() {
    if (!dirty) return true;
    window.clearTimeout(draftTimer);

    if (!askBeforeLeaveSave) {
      discardCurrentChanges(false);
      return true;
    }

    const choice = await message(t.dialogs.unsavedMessage, {
      title: t.dialogs.unsavedTitle,
      kind: 'warning',
      buttons: { yes: t.buttons.yes, no: t.buttons.no, cancel: t.buttons.cancel }
    });

    if (choice === 'Cancel') {
      return false;
    }
    if (choice === 'Yes') {
      return saveCurrent();
    }

    discardCurrentChanges(true);
    return true;
  }

  async function selectFile(path: string) {
    if (path === selectedPath) return;
    if (!(await ensureSafeToLeave())) return;
    busy = true;
    status = t.status.readingFile;
    try {
      const result = await readFile(path);
      await openReadResult(result);
    } catch (error) {
      status = t.status.readFailed;
      await message(String(error), { title: t.dialogs.readFailed, kind: 'error' });
    } finally {
      busy = false;
    }
  }

  async function openReadResult(result: ReadFileResult) {
    selectedPath = result.path;
    content = result.content;
    savedContent = result.content;
    encoding = result.encoding;
    modifiedAt = result.modified_at;
    dirty = false;
    mode = 'read';

    const draft = askBeforeLeaveSave ? await readDraft(result.path) : null;
    if (draft && draft.content !== result.content) {
      const restore = await confirm(t.dialogs.restoreDraftMessage, {
        title: t.dialogs.restoreDraftTitle,
        kind: 'info'
      });
      if (restore) {
        content = draft.content;
        dirty = true;
        status = t.status.draftRestored;
      }
    }

    await updateOutlineNow();
    status = dirty ? t.status.draftRestored : t.status.fileOpened;
  }

  function setContent(next: string) {
    content = next;
    dirty = content !== savedContent;
    if (!dirty) {
      window.clearTimeout(draftTimer);
      if (selectedPath) {
        void deleteDraft(selectedPath);
      }
    }
    scheduleDraft();
    scheduleOutline();
  }

  function scheduleDraft() {
    if (!askBeforeLeaveSave || !selectedPath || content === savedContent) return;
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(async () => {
      try {
        await writeDraft(selectedPath, content);
        status = t.status.draftSaved;
      } catch (error) {
        status = `${t.status.draftFailed}: ${String(error)}`;
      }
    }, 900);
  }

  async function flushDraft() {
    if (!askBeforeLeaveSave || !selectedPath || !dirty) return;
    window.clearTimeout(draftTimer);
    await writeDraft(selectedPath, content);
  }

  function scheduleOutline() {
    window.clearTimeout(outlineTimer);
    outlineTimer = window.setTimeout(updateOutlineNow, 250);
  }

  async function updateOutlineNow() {
    outline = await extractOutline(content);
  }

  async function saveCurrent(overwrite = false): Promise<boolean> {
    if (!selectedPath || !dirty) return true;
    busy = true;
    status = t.status.saving;
    try {
      window.clearTimeout(draftTimer);
      const result = await saveFile(selectedPath, content, modifiedAt, overwrite);
      if (result.conflict) {
        const allowOverwrite = await confirm(result.message ?? t.dialogs.diskChanged, {
          title: t.dialogs.saveConflictTitle,
          kind: 'warning'
        });
        if (allowOverwrite) {
          return await saveCurrent(true);
        } else {
          status = t.status.saveCancelled;
          return false;
        }
      }
      if (result.ok) {
        savedContent = content;
        modifiedAt = result.modified_at ?? modifiedAt;
        dirty = false;
        await deleteDraft(selectedPath);
        status = t.status.saved;
        return true;
      }
      return false;
    } catch (error) {
      status = t.status.saveFailed;
      await message(String(error), { title: t.dialogs.saveFailed, kind: 'error' });
      return false;
    } finally {
      busy = false;
    }
  }

  function discardCurrentChanges(deleteCurrentDraft: boolean) {
    window.clearTimeout(draftTimer);
    if (deleteCurrentDraft && selectedPath) {
      void deleteDraft(selectedPath);
    }
    dirty = false;
  }

  function jumpToHeading(heading: Heading) {
    if (mode === 'edit') {
      editorRef?.focusLine(heading.line);
      return;
    }
    if (mode === 'visual') {
      visualRef?.scrollToLine(heading.line);
      return;
    }
    previewRef?.scrollToLine(heading.line);
    editorRef?.focusLine(heading.line);
  }

  function setMode(next: ViewMode) {
    mode = next;
  }

  function setLeftSidebarCollapsed(collapsed: boolean) {
    leftSidebarCollapsed = collapsed;
    localStorage.setItem(LEFT_SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }

  function setRightSidebarCollapsed(collapsed: boolean) {
    rightSidebarCollapsed = collapsed;
    localStorage.setItem(RIGHT_SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }

  async function setAskBeforeLeaveSave(enabled: boolean) {
    askBeforeLeaveSave = enabled;
    localStorage.setItem(AUTO_SAVE_ENABLED_KEY, String(enabled));
    localStorage.removeItem(ASK_BEFORE_LEAVE_SAVE_KEY);
    window.clearTimeout(draftTimer);

    if (enabled) {
      status = t.status.autoSaveOn;
      scheduleDraft();
      return;
    }

    if (workspacePath) {
      const removed = await clearWorkspaceDrafts(workspacePath);
      status = removed > 0 ? formatText(t.status.autoSaveOffWithRemoved, { count: removed }) : t.status.autoSaveOff;
    } else {
      status = t.status.autoSaveOff;
    }
  }

  function setTheme(themeId: string) {
    selectedTheme = findTheme(themeId);
    applyTheme(selectedTheme);
    localStorage.setItem(THEME_STORAGE_KEY, selectedTheme.id);
    status = formatText(t.status.themeChanged, { theme: themeLabel(selectedTheme) });
  }

  async function chooseBackgroundImage() {
    const selected = await open({
      multiple: false,
      title: t.dialogs.chooseBackgroundImage,
      filters: [
        {
          name: t.dialogs.imageFilter,
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
        }
      ]
    });
    if (typeof selected !== 'string') return;
    applyBackgroundImage(selected, true, t.status.backgroundApplied);
  }

  function applyBackgroundImage(path: string, persist: boolean, successStatus?: string) {
    const token = ++backgroundImageLoadToken;
    const url = convertFileSrc(path);
    const probe = new Image();

    probe.onload = () => {
      if (token !== backgroundImageLoadToken) return;
      backgroundImagePath = path;
      backgroundImageUrl = url;
      if (persist) {
        localStorage.setItem(BACKGROUND_IMAGE_STORAGE_KEY, path);
      }
      if (successStatus) {
        status = successStatus;
      }
    };

    probe.onerror = () => {
      if (token !== backgroundImageLoadToken) return;
      backgroundImagePath = '';
      backgroundImageUrl = '';
      if (persist) {
        localStorage.removeItem(BACKGROUND_IMAGE_STORAGE_KEY);
      }
      status = t.status.backgroundUnavailable;
    };

    probe.src = url;
  }

  function clearBackgroundImage() {
    backgroundImageLoadToken += 1;
    backgroundImagePath = '';
    backgroundImageUrl = '';
    localStorage.removeItem(BACKGROUND_IMAGE_STORAGE_KEY);
    status = t.status.backgroundCleared;
  }

  function restoreAppearanceSettings() {
    language = loadLanguage();
    selectedTheme = findTheme(localStorage.getItem(THEME_STORAGE_KEY));
    applyTheme(selectedTheme);
    leftSidebarCollapsed = localStorage.getItem(LEFT_SIDEBAR_COLLAPSED_KEY) === 'true';
    rightSidebarCollapsed = localStorage.getItem(RIGHT_SIDEBAR_COLLAPSED_KEY) === 'true';
    const storedAutoSave = localStorage.getItem(AUTO_SAVE_ENABLED_KEY);
    askBeforeLeaveSave =
      storedAutoSave !== null ? storedAutoSave === 'true' : localStorage.getItem(ASK_BEFORE_LEAVE_SAVE_KEY) === 'true';
    localStorage.setItem(AUTO_SAVE_ENABLED_KEY, String(askBeforeLeaveSave));

    const savedBackgroundPath = localStorage.getItem(BACKGROUND_IMAGE_STORAGE_KEY);
    if (!savedBackgroundPath) return;
    applyBackgroundImage(savedBackgroundPath, true);
  }

  async function openDefaultSettings() {
    if (defaultSettingsBusy) return;
    defaultSettingsBusy = true;
    status = t.status.openingDefaultSettings;
    try {
      await openDefaultAppSettings();
      status = t.status.openedDefaultSettings;
    } catch (error) {
      status = t.status.defaultSettingsFailed;
      await message(String(error), { title: t.dialogs.settingsFailed, kind: 'error' });
    } finally {
      defaultSettingsBusy = false;
    }
  }

  function isMarkdownPath(path: string) {
    return /\.(md|markdown)$/i.test(path);
  }

  async function openDroppedPath(paths: string[]) {
    const path = paths.find(isMarkdownPath) ?? paths[0];
    if (!path) return;
    await loadPath(path);
  }

  async function setImmersiveMode(enabled: boolean) {
    try {
      await getCurrentWindow().setFullscreen(enabled);
      immersiveMode = enabled;
      status = enabled ? t.status.immersiveOn : t.status.immersiveOff;
    } catch (error) {
      status = enabled ? t.status.immersiveOnFailed : t.status.immersiveOffFailed;
      await message(String(error), { title: t.dialogs.immersiveFailed, kind: 'error' });
    }
  }

  async function toggleImmersiveMode() {
    const fullscreen = await getCurrentWindow().isFullscreen();
    await setImmersiveMode(!fullscreen);
  }

  async function requestAppClose() {
    if (closeInProgress) return;
    closeInProgress = true;
    try {
      if (await ensureSafeToLeave()) {
        await getCurrentWindow().destroy();
      }
    } catch (error) {
      status = t.status.closeFailed;
      await message(String(error), { title: t.dialogs.closeFailed, kind: 'error' });
    } finally {
      closeInProgress = false;
    }
  }

  async function syncWindowTitle(currentFileName: string, hasUnsavedChanges: boolean) {
    const title = currentFileName ? `${hasUnsavedChanges ? '● ' : ''}${currentFileName} - md-view` : 'md-view';
    if (title === lastWindowTitle) return;
    lastWindowTitle = title;
    try {
      await getCurrentWindow().setTitle(title);
    } catch {
      // Title updates are cosmetic; avoid interrupting editing if the window API is unavailable.
    }
  }

  function themeLabel(theme: AppTheme) {
    return t.themeNames[theme.id as keyof typeof t.themeNames] ?? theme.name;
  }

  function switchLanguage() {
    language = nextLanguage(language);
    saveLanguage(language);
    status = text[language].status.languageChanged;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'F11') {
      event.preventDefault();
      void toggleImmersiveMode();
      return;
    }

    if (event.key === 'Escape' && immersiveMode) {
      event.preventDefault();
      void setImmersiveMode(false);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void saveCurrent();
    }
  }

  onMount(() => {
    let unlistenDragDrop: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;
    restoreAppearanceSettings();

    void getCurrentWindow()
      .onCloseRequested((event) => {
        event.preventDefault();
        void requestAppClose();
      })
      .then((unlisten) => {
        unlistenClose = unlisten;
      });

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'enter' || event.payload.type === 'over') {
          dropActive = true;
          return;
        }

        dropActive = false;
        if (event.payload.type === 'drop') {
          void openDroppedPath(event.payload.paths);
        }
      })
      .then((unlisten) => {
        unlistenDragDrop = unlisten;
      });

    void initialOpenPaths().then((paths) => {
      const path = paths.find(isMarkdownPath) ?? paths[0];
      if (path) {
        void loadPath(path);
      }
    });

    return () => {
      unlistenDragDrop?.();
      unlistenClose?.();
    };
  });
</script>

<svelte:window on:keydown={handleKeydown} />

<main class="shell" class:drop-active={dropActive} class:immersive={immersiveMode} data-drop-text={t.dropText}>
  <header class="toolbar" aria-hidden={immersiveMode}>
    <div class="toolbar-group">
      <button class="primary" disabled={busy} on:click={chooseWorkspace}>{t.actions.openFolder}</button>
      <button disabled={!workspacePath || busy} on:click={refreshWorkspace}>{t.actions.refresh}</button>
      <button class:dirty disabled={!dirty || busy} on:click={() => saveCurrent()}>{t.actions.save}</button>
      <button
        class="default-app-button"
        disabled={busy || defaultSettingsBusy}
        title={t.labels.defaultAppTitle}
        aria-label={t.labels.defaultAppTitle}
        on:click={openDefaultSettings}
      >
        {defaultSettingsBusy ? t.actions.setting : t.actions.setDefault}
      </button>
    </div>

    <div class="toolbar-center">
      <label class="draft-toggle" title={t.labels.autoSaveTitle}>
        <input
          type="checkbox"
          checked={askBeforeLeaveSave}
          on:change={(event) => void setAskBeforeLeaveSave(event.currentTarget.checked)}
        />
        <span>{t.actions.autoSave}</span>
      </label>
      <label class="theme-picker">
        <span>{t.actions.theme}</span>
        <select value={selectedTheme.id} on:change={(event) => setTheme(event.currentTarget.value)}>
          {#each themes as theme}
            <option value={theme.id}>{themeLabel(theme)} · {theme.mode === 'dark' ? t.labels.dark : t.labels.light}</option>
          {/each}
        </select>
      </label>

      <div class="segmented" aria-label={t.labels.viewMode}>
        <button class:active={mode === 'read'} disabled={!selectedPath} on:click={() => setMode('read')}>{t.modes.read}</button>
        <button class:active={mode === 'edit'} disabled={!selectedPath} on:click={() => setMode('edit')}>{t.modes.edit}</button>
        <button class:active={mode === 'visual'} disabled={!selectedPath} on:click={() => setMode('visual')}>{t.modes.visual}</button>
        <button class:active={mode === 'split'} disabled={!selectedPath} on:click={() => setMode('split')}>{t.modes.split}</button>
      </div>
    </div>

    <div class="toolbar-end">
      <div class="status-line" title={selectedPath}>
        <span class:dot-dirty={dirty} class="dot"></span>
        {#if encoding}
          <span class="muted">{encoding}</span>
        {/if}
        <span class="muted">{status}</span>
      </div>
      {#if backgroundImagePath}
        <button class="active" disabled={busy} title={t.labels.clearBackground} on:click={clearBackgroundImage}>{t.actions.clearImage}</button>
      {:else}
        <button disabled={busy} title={t.labels.chooseBackground} on:click={chooseBackgroundImage}>{t.actions.chooseImage}</button>
      {/if}
      <button title={t.labels.immersiveMode} aria-label={t.labels.immersiveMode} on:click={toggleImmersiveMode}>{t.actions.immersive}</button>
      <button class="language-button" title={t.actions.toggleLanguage} aria-label={t.actions.toggleLanguage} on:click={switchLanguage}>{t.actions.languageButton}</button>
    </div>
  </header>

  <section class="workspace" style={workspaceStyle}>
    <aside class="sidebar" class:collapsed={leftSidebarCollapsed}>
      {#if leftSidebarCollapsed}
        <button
          class="rail-button"
          title={t.panels.expandFolder}
          aria-label={t.panels.expandFolder}
          on:click={() => setLeftSidebarCollapsed(false)}
        >
          ☰
        </button>
      {:else}
        <div class="panel-title">
          <span>{t.panels.folder}</span>
          <button
            class="panel-icon-button"
            title={t.panels.collapseFolder}
            aria-label={t.panels.collapseFolder}
            on:click={() => setLeftSidebarCollapsed(true)}
          >
            ‹
          </button>
        </div>
        {#if rootNodes.length > 0}
          <FileTree
            nodes={rootNodes}
            {selectedPath}
            onSelectFile={selectFile}
          />
        {:else}
          <p class="empty-note">{t.panels.noFolder}</p>
        {/if}
      {/if}
    </aside>

    <section class="content-pane" class:has-reader-bg={Boolean(backgroundImageUrl)} style={contentPaneStyle}>
      {#if !selectedPath}
        <div class="empty-state">
          <h1>md-view</h1>
          <p>{t.panels.emptyState}</p>
        </div>
      {:else if mode === 'read'}
        <MarkdownPreview bind:this={previewRef} {content} {outline} />
      {:else if mode === 'edit'}
        <MarkdownEditor bind:this={editorRef} value={content} on:change={(event) => setContent(event.detail)} />
      {:else if mode === 'visual'}
        <VisualMarkdownEditor
          bind:this={visualRef}
          value={content}
          {outline}
          strings={t.visual}
          on:change={(event) => setContent(event.detail)}
        />
      {:else}
        <div class="split-view">
          <MarkdownEditor bind:this={editorRef} value={content} on:change={(event) => setContent(event.detail)} />
          <MarkdownPreview bind:this={previewRef} {content} {outline} />
        </div>
      {/if}
    </section>

    <aside class="outline" class:collapsed={rightSidebarCollapsed}>
      {#if rightSidebarCollapsed}
        <button
          class="rail-button"
          title={t.panels.expandOutline}
          aria-label={t.panels.expandOutline}
          on:click={() => setRightSidebarCollapsed(false)}
        >
          ≡
        </button>
      {:else}
        <div class="panel-title">
          <span>{t.panels.outline}</span>
          <button
            class="panel-icon-button"
            title={t.panels.collapseOutline}
            aria-label={t.panels.collapseOutline}
            on:click={() => setRightSidebarCollapsed(true)}
          >
            ›
          </button>
        </div>
        <OutlinePanel headings={outline} strings={t.panels} on:jump={(event) => jumpToHeading(event.detail)} />
      {/if}
    </aside>
  </section>

  {#if immersiveMode}
    <button class="immersive-exit" on:click={() => setImmersiveMode(false)}>{t.actions.exitImmersive}</button>
  {/if}
</main>
