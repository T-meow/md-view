import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { renderLiteMarkdown } from '../src/markdown/renderers/lite';
const mocks = vi.hoisted(() => ({ full: vi.fn(), validate: vi.fn() }));
vi.mock('../src/runtime', () => ({
  openExternalUrl: vi.fn(),
  validateLocalLinks: mocks.validate
}));
vi.mock('../src/markdown/renderers/deferred', async () => {
  const { renderFastMarkdown } = await import('../src/markdown/renderers/fast');
  return {
    renderFastPreview: (source: string, headings: [], markdownPath: string) =>
      renderFastMarkdown(source, { headings, markdownPath }),
    renderFullMarkdown: mocks.full
  };
});
import PreviewHarness from './fixtures/PreviewHarness.svelte';
let app: ReturnType<typeof mount<PreviewHarness>> | undefined;
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const writeText = vi.fn();
beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  mocks.validate.mockReset().mockResolvedValue([]);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText }
  });
  mocks.full
    .mockReset()
    .mockImplementation((source, headings, markdownPath) =>
      renderLiteMarkdown(source, { headings, markdownPath })
    );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});
afterEach(async () => {
  if (app) await unmount(app);
  app = undefined;
  document.body.innerHTML = '';
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
  vi.unstubAllGlobals();
});
const copies = () => [...document.querySelectorAll<HTMLButtonElement>('[data-code-action="copy"]')];

it('copies exact code and toggles wrapping through real preview click handling', async () => {
  app = mount(PreviewHarness, {
    target: document.body,
    props: { content: '```\n  中文 <&>\n\tline\n```' }
  });
  await vi.waitFor(() => {
    expect(mocks.full).toHaveBeenCalled();
    expect(document.querySelector('pre > code')?.textContent).toBe('  中文 <&>\n\tline\n');
    expect(copies()).toHaveLength(1);
  });
  copies()[0].click();
  await vi.waitFor(() => expect(copies()[0].textContent).toBe('已复制'));
  expect(writeText).toHaveBeenCalledWith('  中文 <&>\n\tline\n');
  const wrap = document.querySelector<HTMLButtonElement>('[data-code-action="wrap"]')!;
  wrap.click();
  expect(wrap.getAttribute('aria-pressed')).toBe('true');
  expect(document.querySelector('pre')?.classList.contains('code-wrap')).toBe(true);
  app.changeLanguage('en');
  await tick();
  expect(copies()[0].textContent).toBe('Copy');
  expect(wrap.getAttribute('aria-pressed')).toBe('true');
});

it('has one toolbar per block during fast and deferred full rendering', async () => {
  let complete!: (value: { html: string; status: string }) => void;
  mocks.full.mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  app = mount(PreviewHarness, {
    target: document.body,
    props: { content: '```js\nfirst\n```\n\n```\nsecond\n```' }
  });
  await vi.waitFor(() => expect(copies()).toHaveLength(2));
  copies()[1].click();
  expect(writeText).toHaveBeenCalledWith('second');
  await vi.waitFor(() => expect(mocks.full).toHaveBeenCalled());
  complete({
    html: '<pre><code class="language-js">first\n</code></pre><pre><code>second\n</code></pre>',
    status: 'Full'
  });
  await vi.waitFor(() => expect(document.querySelectorAll('pre > code')[1]?.textContent).toBe('second\n'));
  await vi.waitFor(() => expect(copies()).toHaveLength(2));
  expect(document.querySelectorAll('.markdown-code-toolbar')).toHaveLength(2);
});

it('discards pending clipboard feedback after content changes and unmounts', async () => {
  app = mount(PreviewHarness, {
    target: document.body,
    props: { content: '```\nold\n```' }
  });
  await vi.waitFor(() => expect(document.querySelector('pre > code')?.textContent).toBe('old\n'));
  await vi.waitFor(() => expect(copies()).toHaveLength(1));
  let resolve!: () => void;
  writeText.mockReturnValueOnce(
    new Promise<void>((done) => {
      resolve = done;
    })
  );
  copies()[0].click();
  app.replaceContent('```\nnew\n```');
  await vi.waitFor(() => expect(document.querySelector('pre > code')?.textContent).toBe('new\n'));
  await vi.waitFor(() => expect(copies()).toHaveLength(1));
  resolve();
  await tick();
  expect(copies()[0].textContent).toBe('复制');
  writeText.mockReturnValueOnce(
    new Promise<void>((done) => {
      resolve = done;
    })
  );
  const oldButton = copies()[0];
  oldButton.click();
  await unmount(app);
  app = undefined;
  resolve();
  await tick();
  expect(oldButton.textContent).toBe('复制');
});

it('uses the same success and failure feedback for Mermaid source copying', async () => {
  mocks.full.mockResolvedValue({
    html: '<div class="markdown-mermaid" data-mermaid-source="graph TD; A--&gt;B"><div class="markdown-mermaid-toolbar"><button data-mermaid-action="copy-source">复制源码</button></div><svg></svg></div>',
    status: 'Full'
  });
  app = mount(PreviewHarness, {
    target: document.body,
    props: { content: 'diagram' }
  });
  await vi.waitFor(() =>
    expect(document.querySelector('[data-mermaid-action="copy-source"]')).not.toBeNull()
  );
  const button = document.querySelector<HTMLButtonElement>('[data-mermaid-action="copy-source"]')!;
  button.click();
  await vi.waitFor(() => expect(button.textContent).toBe('已复制'));
  expect(writeText).toHaveBeenCalledWith('graph TD; A-->B');
  writeText.mockRejectedValueOnce(new Error('Denied'));
  button.click();
  await vi.waitFor(() => expect(button.textContent).toBe('复制失败，重试'));
  expect(button.disabled).toBe(false);
});

it('keeps rendered content when the optional local link check fails', async () => {
  mocks.full.mockResolvedValue({
    html: '<h1>Document</h1><p><a href="./missing.md">Local link</a></p>',
    status: 'Full',
    linkTargets: [{ href: './missing.md', kind: 'link' }]
  });
  mocks.validate.mockRejectedValue(new Error('Link check unavailable'));
  app = mount(PreviewHarness, {
    target: document.body,
    props: { content: '# Document', preferences: { validateLocalLinks: true } }
  });
  await vi.waitFor(() => expect(mocks.validate).toHaveBeenCalled());
  await tick();
  expect(document.querySelector('.markdown-render-error')).toBeNull();
  expect(document.querySelector('.markdown-preview h1')?.textContent).toBe('Document');
  expect(document.querySelector('.markdown-preview a')?.textContent).toBe('Local link');
});

it.each(['wrap', 'details'])('refreshes reading focus after %s changes block heights', async (action) => {
  mocks.full.mockResolvedValue({
    html: '<pre><code>long line</code></pre><details><summary>Details</summary>Text</details><h2>Next</h2>',
    status: 'Full'
  });
  app = mount(PreviewHarness, {
    target: document.body,
    props: { content: 'document' }
  });
  await vi.waitFor(() => expect(document.querySelector('.markdown-preview h2')).not.toBeNull());
  await vi.waitFor(() => expect(copies()).toHaveLength(1));
  const host = document.querySelector<HTMLElement>('.markdown-preview')!;
  const pre = host.querySelector('pre')!;
  const details = host.querySelector('details')!;
  const heading = host.querySelector('h2')!;
  Object.defineProperties(host, {
    clientHeight: { value: 400 },
    scrollHeight: { value: 1000 }
  });
  let expanded = false;
  for (const [node, top] of [
    [pre, 0],
    [details, 20],
    [heading, 40]
  ] as const) {
    Object.defineProperty(node, 'offsetParent', { get: () => host });
    vi.spyOn(node, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          top: expanded && node === heading ? 500 : top,
          height: 20
        }) as DOMRect
    );
  }
  host.dispatchEvent(new Event('load'));
  await vi.waitFor(() => expect(heading.classList.contains('current-reading-block')).toBe(true));
  expanded = true;
  if (action === 'wrap') host.querySelector<HTMLButtonElement>('[data-code-action="wrap"]')!.click();
  else details.dispatchEvent(new Event('toggle'));
  await vi.waitFor(() => expect(details.classList.contains('current-reading-block')).toBe(true));
  expect(heading.classList.contains('current-reading-block')).toBe(false);
});
