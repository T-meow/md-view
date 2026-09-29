import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enhanceCodeBlocks, createCopyFeedback } from '../src/markdown/codeTools';
import { renderFastMarkdown } from '../src/markdown/renderers/fast';
import { renderLiteMarkdown } from '../src/markdown/renderers/lite';
import { renderPlusMarkdown } from '../src/markdown/renderers/plus';
import { text } from '../src/i18n';
import { defaultPlusPreferences } from '../src/plusPreferences';

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const writeText = vi.fn<(value: string) => Promise<void>>();
let feedback: ReturnType<typeof createCopyFeedback>;
beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset().mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText }
  });
  feedback = createCopyFeedback(() => text.zh.code);
});
afterEach(() => {
  feedback.reset();
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else Reflect.deleteProperty(navigator, 'clipboard');
  vi.useRealTimers();
  document.body.innerHTML = '';
});
function host(html: string) {
  const root = document.createElement('article');
  root.innerHTML = html;
  document.body.append(root);
  enhanceCodeBlocks(root, text.zh.code);
  return root;
}

describe('shared code controls', () => {
  it.each(['fast', 'lite', 'plus'] as const)(
    'enhances %s code with or without a language without changing text',
    async (edition) => {
      const source = [
        '```ts',
        '  const 中文 = "<&>";',
        '\t// 空白',
        '```',
        '',
        '```',
        'plain & <text>',
        '```',
        '',
        '`inline`'
      ].join('\n');
      const context = { headings: [], markdownPath: '' };
      const result =
        edition === 'fast'
          ? renderFastMarkdown(source, context)
          : edition === 'lite'
            ? await renderLiteMarkdown(source, context)
            : await renderPlusMarkdown(source, context, {
                ...defaultPlusPreferences,
                mermaidEnabled: false
              });
      const root = document.createElement('div');
      root.innerHTML = result.html;
      const codeBefore = [...root.querySelectorAll('pre > code')].map((node) => node.textContent);
      enhanceCodeBlocks(root, text.zh.code);
      enhanceCodeBlocks(root, text.en.code);
      expect(root.querySelectorAll('.markdown-code-toolbar')).toHaveLength(2);
      expect([...root.querySelectorAll('pre > code')].map((node) => node.textContent)).toEqual(codeBefore);
      expect(root.querySelector('pre > code')?.textContent).toContain('  const 中文 = "<&>";\n\t// 空白');
      expect(root.querySelectorAll('[data-code-action="copy"]')).toHaveLength(2);
      expect(root.querySelector('[data-code-action="copy"]')?.textContent).toBe('Copy');
      expect(root.querySelectorAll('p .markdown-code-toolbar')).toHaveLength(0);
      expect(result.html).not.toContain('data-code-action');
    }
  );

  it('waits for clipboard success and resets each button independently after two seconds', async () => {
    const root = host(
      '<pre><code>  中文 &amp; &lt;x&gt;\n\tend\n</code></pre><pre><code>second</code></pre>'
    );
    const [first, second] = [...root.querySelectorAll<HTMLButtonElement>('[data-code-action="copy"]')];
    let resolve!: () => void;
    writeText.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done;
      })
    );
    const value = root.querySelector('code')!.textContent!;
    const copying = feedback.copy(first, value, text.zh.code.copy);
    expect(first.textContent).toBe('复制中…');
    expect(first.disabled).toBe(true);
    expect(second.textContent).toBe('复制');
    resolve();
    await copying;
    expect(writeText).toHaveBeenCalledWith('  中文 & <x>\n\tend\n');
    expect(first.textContent).toBe('已复制');
    await vi.advanceTimersByTimeAsync(1000);
    await feedback.copy(second, 'second', text.zh.code.copy);
    await vi.advanceTimersByTimeAsync(1000);
    expect(first.textContent).toBe('复制');
    expect(second.textContent).toBe('已复制');
    await vi.advanceTimersByTimeAsync(1000);
    expect(second.textContent).toBe('复制');
  });

  it('shows failure and permits retry, including when the clipboard API is missing', async () => {
    const button = host('<pre><code>code</code></pre>').querySelector<HTMLButtonElement>('button')!;
    writeText.mockRejectedValueOnce(new Error('Permission denied'));
    await feedback.copy(button, 'code', '复制');
    expect(button.textContent).toBe('复制失败，重试');
    expect(button.disabled).toBe(false);
    expect(button.title).toBe(text.zh.code.copyFailedHint);
    await feedback.copy(button, 'code', '复制');
    expect(button.textContent).toBe('已复制');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined
    });
    await feedback.copy(button, 'code', '复制');
    expect(button.title).toBe(text.zh.code.copyUnavailable);
    expect(button.disabled).toBe(false);
  });

  it('invalidates pending requests and reset timers when the content is replaced', async () => {
    const root = host('<pre><code>code</code></pre>');
    const button = root.querySelector<HTMLButtonElement>('button')!;
    let resolve!: () => void;
    writeText.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done;
      })
    );
    const copying = feedback.copy(button, 'code', '复制');
    feedback.reset();
    root.remove();
    resolve();
    await copying;
    expect(button.textContent).toBe('复制');
    expect(vi.getTimerCount()).toBe(0);
    await feedback.copy(button, 'code', '复制');
    feedback.reset();
    expect(vi.getTimerCount()).toBe(0);
  });
});
