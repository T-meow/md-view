import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from 'svelte';
import { renderLiteMarkdown } from '../src/markdown/renderers/lite';
import { renderPlusMarkdown } from '../src/markdown/renderers/plus';
import { defaultPlusPreferences } from '../src/plusPreferences';

const mocks = vi.hoisted(() => ({ full: vi.fn(), external: vi.fn() }));
vi.mock('../src/runtime', () => ({
  openExternalUrl: mocks.external,
  validateLocalLinks: vi.fn(async () => [])
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
const local = vi.fn();
const filePath = 'D:/Projects/示例项目/README.md';
beforeEach(() => {
  local.mockReset();
  mocks.external.mockReset().mockResolvedValue(undefined);
  mocks.full.mockReset();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0)
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  // JSDOM does not expose CSS.escape; escape selector metacharacters for anchor tests.
  vi.stubGlobal('CSS', {
    escape: (value: string) =>
      value.replace(/[^a-zA-Z0-9_-]/gu, (char) => `\\${char.codePointAt(0)!.toString(16)} `)
  });
});
afterEach(async () => {
  if (app) await unmount(app);
  app = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function setup(content: string) {
  app = mount(PreviewHarness, {
    target: document.body,
    props: { content, filePath, onOpenLocalFile: local }
  });
  await vi.waitFor(() => expect(document.querySelector('.markdown-preview a')).not.toBeNull());
  return document.querySelector<HTMLAnchorElement>('.markdown-preview a')!;
}
function click(link: HTMLAnchorElement) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  (link.querySelector('strong') ?? link).dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
}

describe.each(['Lite', 'Plus'])('%s local document navigation', (edition) => {
  beforeEach(() => {
    mocks.full.mockImplementation((source, headings, markdownPath) =>
      edition === 'Lite'
        ? renderLiteMarkdown(source, { headings, markdownPath })
        : renderPlusMarkdown(
            source,
            { headings, markdownPath },
            { ...defaultPlusPreferences, mermaidEnabled: false }
          )
    );
  });

  it.each([
    ['docs/人物设定.md', 'D:/Projects/示例项目/docs/人物设定.md'],
    ['../其他项目/说明.markdown', 'D:/Projects/示例项目/../其他项目/说明.markdown'],
    ['docs/%E4%B8%AD%E6%96%87%20%E6%96%87%E4%BB%B6.md', 'D:/Projects/示例项目/docs/中文 文件.md'],
    ['file:///D:/Notes/%E6%96%87%E6%A1%A3.md', 'D:/Notes/文档.md'],
    ['D:/Notes/文档.md', 'D:/Notes/文档.md'],
    ['docs/说明.txt', 'D:/Projects/示例项目/docs/说明.txt']
  ])('opens %s inside the application', async (href, path) => {
    const link = await setup(`[**跳转文件**](<${href}>)`);
    // This was incorrectly treated as a website when the local href was "#".
    expect(link.href).toMatch(/^https?:/);
    click(link);
    expect(local).toHaveBeenCalledExactlyOnceWith({ path, anchor: undefined });
    expect(mocks.external).not.toHaveBeenCalled();
  });

  it('handles surrounding whitespace in HTML link destinations', async () => {
    const link = await setup('<a href=" docs/人物.md ">local</a><a href=" https://example.com/ ">external</a>');
    click(link);
    expect(local).toHaveBeenCalledExactlyOnceWith({ path: 'D:/Projects/示例项目/docs/人物.md', anchor: undefined });
    expect(mocks.external).not.toHaveBeenCalled();
    click(document.querySelectorAll<HTMLAnchorElement>('.markdown-preview a')[1]);
    expect(mocks.external).toHaveBeenCalledExactlyOnceWith('https://example.com/');
  });

  it('keeps the file fragment for a single decoding at the destination', async () => {
    const anchor = encodeURIComponent('章节-100%20');
    const link = await setup(`[章节](docs/人物.md#${anchor})`);
    click(link);
    expect(local).toHaveBeenCalledExactlyOnceWith({
      path: 'D:/Projects/示例项目/docs/人物.md',
      anchor
    });
    expect(mocks.external).not.toHaveBeenCalled();
    mocks.full.mockResolvedValueOnce({ html: '<h2 id="章节-100%20">Destination</h2>', status: 'Full' });
    app!.replaceContent('destination');
    await vi.waitFor(() => expect(document.querySelector('.markdown-preview h2')).not.toBeNull());
    const heading = document.querySelector<HTMLElement>('.markdown-preview h2')!;
    const scroll = vi.fn();
    Object.defineProperty(heading, 'scrollIntoView', { configurable: true, value: scroll });
    app!.scrollToAnchor(local.mock.lastCall![0].anchor);
    expect(scroll).toHaveBeenCalledOnce();
  });

  it.each(['https://example.com/note.md', 'mailto:hello@example.com', '//example.com/note.md'])(
    'still opens external %s using the system browser',
    async (href) => {
      const link = await setup(`[网站](${href})`);
      click(link);
      expect(mocks.external).toHaveBeenCalledExactlyOnceWith(new URL(href, document.baseURI).href);
      expect(local).not.toHaveBeenCalled();
    }
  );
});

it('scrolls to an encoded in-document anchor without opening a file or browser', async () => {
  const anchor = '章节-100%20';
  mocks.full.mockResolvedValue({
    html: `<a href="#${encodeURIComponent(anchor)}" data-local-anchor="${encodeURIComponent(anchor)}">章节</a><h2 id="${anchor}">标题</h2>`,
    status: 'Full'
  });
  const link = await setup('document');
  const heading = document.querySelector<HTMLElement>('.markdown-preview h2')!;
  const scroll = vi.fn();
  Object.defineProperty(heading, 'scrollIntoView', { configurable: true, value: scroll });
  click(link);
  expect(scroll).toHaveBeenCalledOnce();
  expect(local).not.toHaveBeenCalled();
  expect(mocks.external).not.toHaveBeenCalled();
});
