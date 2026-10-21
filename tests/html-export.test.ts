import { describe, expect, it, vi } from 'vitest';
import { createExportHtml } from '../src/markdown/exportHtml';
import { renderPlusMarkdown } from '../src/markdown/renderers/plus';
import { extractHeadingsFromMarkdown } from '../src/outline';
import { defaultPlusPreferences } from '../src/plusPreferences';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `http://asset.localhost/${encodeURIComponent(path)}`
}));

const markdownPath = 'C:/Users/Private Name/docs/note.md';
async function preview(source: string) {
  return (
    await renderPlusMarkdown(
      source,
      { markdownPath, headings: extractHeadingsFromMarkdown(source) },
      {
        ...defaultPlusPreferences,
        mermaidEnabled: false
      }
    )
  ).html;
}

describe('portable HTML export', () => {
  it('embeds local images, removes private paths and keeps portable document links', async () => {
    const html = await preview(
      '![local](image.png)\n\n[relative](guide.md#intro)\n\n[private](<C:/Users/Private Name/secret.md>)\n\n![remote](https://example.com/image.png)'
    );
    const load = vi.fn(async (_url: string) => 'data:image/png;base64,iVBORw0KGgo=');
    const exported = await createExportHtml(
      { html, title: '<title>', language: 'en', markdownPath },
      load
    );
    const doc = new DOMParser().parseFromString(exported, 'text/html');
    expect(load).toHaveBeenCalledOnce();
    expect(load.mock.calls[0][0]).toContain('asset');
    expect(doc.querySelector('img')?.getAttribute('src')).toBe(
      'data:image/png;base64,iVBORw0KGgo='
    );
    expect(doc.querySelectorAll('img')[1]?.getAttribute('src')).toBe(
      'https://example.com/image.png'
    );
    expect(doc.querySelector('a')?.getAttribute('href')).toBe('guide.md#intro');
    expect(doc.querySelectorAll('a')[1]?.hasAttribute('href')).toBe(false);
    expect(exported).not.toMatch(
      /Private Name|Private%20Name|asset\.localhost|data-local-|data-source-/
    );
    expect(doc.title).toBe('<title>');
  });

  it('fails the export if a required local image cannot be read', async () => {
    const html = await preview('![local](missing.png)');
    await expect(
      createExportHtml({ html, title: 'Title', language: 'zh', markdownPath }, async () => {
        throw new Error('image unavailable');
      })
    ).rejects.toThrow('image unavailable');
  });

  it('includes formula fonts and highlighting styles without external asset paths', async () => {
    const html = await preview('# Formula\n\n$x^2$\n\n```js\nconst answer = 42;\n```');
    const exported = await createExportHtml({
      html,
      title: 'Formula',
      language: 'en',
      markdownPath
    });
    const doc = new DOMParser().parseFromString(exported, 'text/html');
    const css = doc.querySelector('style')!.textContent!;
    expect(doc.querySelector('.katex')).not.toBeNull();
    expect(css).toContain('@font-face');
    expect(css).toContain('data:font/woff2;base64,');
    expect(css).not.toContain('url(fonts/');
    expect(css).toContain('.hljs');
    expect(doc.querySelector('button')).toBeNull();
    expect(
      doc.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')
    ).toContain("form-action 'none'");
  });
});
