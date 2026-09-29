import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { get } from 'svelte/store';
import type { createDesktop } from '../src/state/desktop';
import { text } from '../src/i18n';

const mocks = vi.hoisted(() => ({
  desktop: null as ReturnType<typeof createDesktop> | null,
  drop: null as ((event: { payload: { type: string; paths: string[] } }) => void) | null,
  open: vi.fn(),
  external: vi.fn(),
  message: vi.fn()
}));
vi.mock('../src/state/desktop', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/state/desktop')>();
  return {
    ...original,
    createDesktop: () => (mocks.desktop = original.createDesktop())
  };
});
vi.mock('../src/api', () => ({
  watchWorkspace: vi.fn(async () => ({ available: true, failed: [] })),
  initialOpenPaths: vi.fn(async () => []),
  listDrafts: vi.fn(async () => []),
  readDraft: vi.fn(async () => null),
  writeDraft: vi.fn(async () => ({})),
  deleteDraft: vi.fn(async () => true),
  cancelScan: vi.fn(async () => {}),
  documentVersions: vi.fn(async () => []),
  pathKind: vi.fn(async () => 'file'),
  openDocument: vi.fn(async (path: string) => ({
    id: path,
    path,
    content: '# Test',
    encoding: 'UTF-8',
    bom: false,
    newline: 'lf',
    revision: { hash: path, modified: '1', size: 6 }
  })),
  openExternalUrl: mocks.external
}));
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  convertFileSrc: (path: string) => path
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {})
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: vi.fn(async () => () => {}),
    setTitle: vi.fn(async () => {})
  })
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: async (callback: typeof mocks.drop) => {
      mocks.drop = callback;
      return () => {
        mocks.drop = null;
      };
    }
  })
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: mocks.open,
  save: vi.fn(async () => null),
  confirm: vi.fn(async () => true),
  message: mocks.message
}));
vi.mock('../src/edition', () => ({ appVersion: '1.2.0' }));
vi.mock('../src/components/MarkdownPreview.svelte', async () => ({
  default: (await import('./fixtures/DemoPreview.svelte')).default
}));
vi.mock('../src/components/MarkdownEditor.svelte', async () => ({
  default: (await import('./fixtures/DemoEditor.svelte')).default
}));
import AppShell from '../src/AppShell.svelte';

const observers = new Set<TestResizeObserver>();
class TestResizeObserver {
  nodes = new Set<Element>();
  constructor(public callback: ResizeObserverCallback) {
    observers.add(this);
  }
  observe(node: Element) {
    this.nodes.add(node);
  }
  unobserve(node: Element) {
    this.nodes.delete(node);
  }
  disconnect() {
    this.nodes.clear();
    observers.delete(this);
  }
}
let app: ReturnType<typeof mount> | undefined;
beforeEach(() => {
  localStorage.clear();
  mocks.desktop = null;
  mocks.drop = null;
  mocks.open.mockReset().mockResolvedValue(null);
  mocks.external.mockReset().mockResolvedValue(undefined);
  mocks.message.mockReset().mockResolvedValue('取消');
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(async () => {
  if (app) await unmount(app);
  app = undefined;
  document.body.innerHTML = '';
  observers.clear();
  vi.unstubAllGlobals();
});
async function setup(editionDisplayName = 'md-view Plus') {
  app = mount(AppShell, {
    target: document.body,
    props: { editionDisplayName }
  });
  await tick();
  await vi.waitFor(() => expect(mocks.drop).not.toBeNull());
  const desktop = mocks.desktop!;
  desktop.workspace.setRoot('/docs');
  await desktop.openFile('/docs/a.md');
  await tick();
  return desktop;
}
async function resize(width: number) {
  const workspace = document.querySelector('.desktop-workspace')!;
  for (const observer of observers) {
    if (observer.nodes.has(workspace))
      observer.callback(
        [
          {
            target: workspace,
            contentRect: { width, height: 600 }
          } as ResizeObserverEntry
        ],
        observer as unknown as ResizeObserver
      );
  }
  await tick();
}
function paneWidth(side: 'left' | 'right') {
  return Number.parseFloat(
    (document.querySelector('.desktop-shell') as HTMLElement).style.getPropertyValue(
      side === 'left' ? '--nav-width' : '--outline-width'
    )
  );
}

it('responds to measured width without persisting automatic pane changes', async () => {
  const desktop = await setup();
  const saved = localStorage.getItem('md-view-shell-v2');
  await resize(1280);
  expect(paneWidth('left')).toBe(250);
  await resize(1024);
  expect(paneWidth('left')).toBeLessThan(250);
  expect(paneWidth('right')).toBeLessThan(220);
  await resize(900);
  expect(document.querySelector('.desktop-outline')).toBeNull();
  expect(document.querySelectorAll('.pane-resizer')).toHaveLength(1);
  const collapsed = document.querySelector<HTMLButtonElement>('.auto-collapsed')!;
  expect(collapsed.title).toBe(text.zh.panels.outlineAutoClosed);
  collapsed.click();
  await tick();
  expect(get(desktop.status)).toBe(text.zh.panels.outlineAutoClosed);
  expect(localStorage.getItem('md-view-shell-v2')).toBe(saved);
  await resize(1280);
  expect(paneWidth('left')).toBe(250);
  expect(paneWidth('right')).toBe(220);
  expect(document.querySelectorAll('.pane-resizer')).toHaveLength(2);
  desktop.setPreferences({ ...get(desktop.preferences), rightClosed: true });
  await resize(900);
  await resize(1280);
  expect(document.querySelector('.desktop-outline')).toBeNull();
});

it('restores the outline at 900px when the file pane is closed', async () => {
  await setup();
  await resize(900);
  document.querySelector<HTMLButtonElement>('[aria-label="切换文件栏"]')!.click();
  await tick();
  expect(document.querySelector('.desktop-sidebar')).toBeNull();
  expect(document.querySelector('.desktop-outline')).not.toBeNull();
});

it('starts drag and keyboard resizing from the visible widths with consistent directions', async () => {
  await setup();
  await resize(1024);
  const start = paneWidth('left');
  const left = document.querySelector<HTMLElement>('[aria-label="调整文件栏宽度"]')!;
  left.dispatchEvent(new MouseEvent('pointerdown', { clientX: 300, bubbles: true }));
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: 290 }));
  await tick();
  expect(paneWidth('left')).toBeCloseTo(start - 10);
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300 }));
  await tick();
  expect(paneWidth('left')).toBeCloseTo(start);
  window.dispatchEvent(new MouseEvent('pointerup'));
  left.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  await tick();
  expect(paneWidth('left')).toBeCloseTo(start - 16);
  const rightBefore = paneWidth('right');
  document
    .querySelector<HTMLElement>('[aria-label="调整大纲宽度"]')!
    .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await tick();
  expect(paneWidth('right')).toBeCloseTo(rightBefore - 16);
});

it.each(['md-view Lite', 'md-view Plus'])(
  'shows bilingual About information and opens links using the desktop API in %s',
  async (edition) => {
    await setup(edition);
    document.querySelector<HTMLButtonElement>('[aria-label="设置"]')!.click();
    await tick();
    const about = document.querySelector('.about-settings')!;
    expect(about.textContent).toContain(edition);
    expect(about.textContent).toContain('1.2.0');
    expect(about.textContent).toContain('T-meow');
    expect(about.textContent).toContain('WTFPL v2');
    const website = about.querySelector<HTMLAnchorElement>('a')!;
    expect(website.textContent).toBe('项目官网');
    website.click();
    expect(mocks.external).toHaveBeenCalledWith('https://t-meow.github.io/md-view/');
    const select = [...document.querySelectorAll<HTMLSelectElement>('.shell-settings select')].find((node) =>
      node.querySelector('option[value="en"]')
    )!;
    select.value = 'en';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect(about.querySelector('legend')?.textContent).toBe('About');
    expect(website.textContent).toBe('Project website');
    expect(about.textContent).toContain('Version');
  }
);

it('opens multiple dropped files, preserves tabs, and can cancel closing a new edited document', async () => {
  const desktop = await setup();
  const original = desktop.documents.snapshot().activeId;
  mocks.drop!({
    payload: { type: 'drop', paths: ['/docs/b.md', '/docs/c.md'] }
  });
  await vi.waitFor(() => expect(desktop.documents.snapshot().tabs).toHaveLength(3));
  expect(desktop.documents.find(original)).toBeDefined();
  expect(desktop.documents.find(desktop.documents.snapshot().activeId)?.path).toBe('/docs/c.md');
  document.querySelector<HTMLButtonElement>('[aria-label="新建文档"]')!.click();
  await tick();
  expect(desktop.documents.snapshot().tabs).toHaveLength(4);
  const created = desktop.documents.snapshot().activeId;
  expect(desktop.documents.find(created)?.path).toBe('');
  desktop.edit(created, 'unsaved content');
  await tick();
  document.querySelector<HTMLButtonElement>('.document-tab.active .close-tab')!.click();
  await vi.waitFor(() => expect(mocks.message).toHaveBeenCalled());
  expect(desktop.documents.find(created)?.content).toBe('unsaved content');
});
