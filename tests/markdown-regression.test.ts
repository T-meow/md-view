import { beforeAll, describe, expect, it } from 'vitest';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderPlusMarkdown } from '../src/markdown/renderers/plus';
import { renderFastMarkdown } from '../src/markdown/renderers/fast';
import { postProcessMarkdownHtml } from '../src/markdown/renderers/shared';
import { extractHeadingsFromMarkdown } from '../src/outline';
import { defaultPlusPreferences } from '../src/plusPreferences';
import { createDocuments } from '../src/state/documents';

// JSDOM has no SVG layout. These measurements allow Mermaid's real parser and
// SVG generator to run; visual diagram layout remains a desktop acceptance check.
beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 120, height: 30 })
  });
  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
    configurable: true,
    value: () => 120
  });
});

describe('existing Markdown sample', () => {
  it('retains formulas, Mermaid SVGs, tables and navigable heading aliases', async () => {
    const source = await readFile(resolve('docs/plus-markdown-syntax-sample.md'), 'utf8');
    const rendered = await renderPlusMarkdown(source, {
      headings: extractHeadingsFromMarkdown(source),
      markdownPath: '/docs/sample.md'
    });
    const html = document.createElement('div');
    html.innerHTML = rendered.html;
    expect(html.querySelectorAll('.katex').length).toBeGreaterThan(1);
    expect(html.querySelectorAll('.markdown-mermaid svg').length).toBe(2);
    expect(html.querySelector('table')).not.toBeNull();
    expect(html.querySelector('#mermaid')).not.toBeNull();
    expect(rendered.linkTargets).toContainEqual({ href: './missing-note.md', kind: 'link' });
  }, 30000);

  it('preserves local file fragments and deduplicates heading aliases', async () => {
    const source = '# Intro\n\n# Intro\n\n[other](./other.md#intro)';
    const rendered = await renderPlusMarkdown(
      source,
      { headings: extractHeadingsFromMarkdown(source), markdownPath: '/docs/a.md' },
      { ...defaultPlusPreferences, mermaidEnabled: false }
    );
    const html = document.createElement('div');
    html.innerHTML = rendered.html;
    expect(html.querySelector('#intro')).not.toBeNull();
    expect(html.querySelector('#intro-1')).not.toBeNull();
    expect(html.querySelector('[data-local-file]')?.getAttribute('data-source-href')).toBe(
      './other.md#intro'
    );
  });
});

describe('Mermaid rendering regression', () => {
  it('retains Chinese node labels, loop connections and arrow geometry after sanitization', async () => {
    const labels = [
      '白天经营特调事务所',
      '获得信用点、情报碎片、行动整备存量',
      '研发菜品、安排店员、配装武器、购买弹药补给',
      '夜晚 TPS 委托行动（越肩视角手动射击）',
      '完成目标、击败精英、选择撤离或贪资源',
      '获得幽灵币、稀有食材、新配方与武器改装件',
      '升级菜单、改装武器和事务所功能',
      '购买弹药补给与基础装备',
      '解锁高级行动落点与战斗构筑'
    ];
    const source = [
      '```mermaid',
      'flowchart TD',
      ...labels.map((label, index) => `${String.fromCharCode(65 + index)}["${label}"]`),
      'A --> B --> C --> D --> E --> F --> G --> A',
      'B -.-> H',
      'F -.-> I',
      'H --> D',
      'I --> C',
      '```'
    ].join('\n');
    const rendered = await renderPlusMarkdown(source, { headings: [], markdownPath: '/docs/loop.md' });
    const html = document.createElement('div');
    html.innerHTML = rendered.html;
    expect(html.querySelector('.markdown-mermaid-error')).toBeNull();
    const svg = html.querySelector('.markdown-mermaid svg');
    expect(svg).not.toBeNull();
    const nodeLabels = Array.from(svg!.querySelectorAll('.node .label')).map((node) =>
      node.textContent?.replace(/\s/g, '')
    );
    expect(nodeLabels).toEqual(labels.map((label) => label.replace(/\s/g, '')));
    const connections = Array.from(svg!.querySelectorAll('path.flowchart-link'));
    expect(connections).toHaveLength(11);
    for (const path of connections) {
      expect(path.getAttribute('d')).toMatch(/^M/);
      const arrow = path.getAttribute('marker-end')?.match(/#([^)]+)\)/)?.[1];
      expect(arrow).toBeTruthy();
      expect(svg!.querySelector(`[id="${arrow}"] path`)?.getAttribute('d')).toMatch(/^M/);
    }
  }, 30000);

  it('preserves SVG paths and relative links while removing executable markup', () => {
    const paths = ['M0,0 L10,10 Z', 'M 0 0 L 10 5 L 0 10 z', 'M-0.5,.5 C1,2 3,4 5,6'];
    const rendered = postProcessMarkdownHtml(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">',
        ...paths.map((path) => `<path d="${path}" onmouseover="alert(1)"></path>`),
        '<script>alert(1)</script>',
        '<foreignObject><div>untrusted HTML</div></foreignObject>',
        '</svg>',
        '<a href="notes2.pdf">relative</a>',
        '<a href="https://example.com/notes2.pdf">external</a>',
        '<a href="javascript:alert(1)">blocked</a>',
        '<a href="java&#x09;script:alert(1)">obfuscated</a>'
      ].join(''),
      { headings: [], markdownPath: '/docs/sample.md' }
    );
    const html = document.createElement('div');
    html.innerHTML = rendered;
    expect(Array.from(html.querySelectorAll('path')).map((path) => path.getAttribute('d'))).toEqual(paths);
    expect(html.querySelector('script, foreignObject, [onload], [onmouseover]')).toBeNull();
    expect(Array.from(html.querySelectorAll('a')).map((link) => link.getAttribute('href'))).toEqual([
      '#',
      'https://example.com/notes2.pdf',
      null,
      null
    ]);
    expect(html.querySelector('a')?.getAttribute('data-local-file')).toBe('/docs/notes2.pdf');
  });
});

it.runIf(process.env.MD_VIEW_BENCHMARK === '1')(
  'measures large Markdown rendering separately from disk access',
  async () => {
    const paragraph =
      'Large document paragraph: ' + 'plain text for reading performance. '.repeat(14) + '\n\n';
    const source = '# Large document\n\n' + paragraph.repeat(4200);
    const bytes = new TextEncoder().encode(source).length;
    expect(bytes).toBeGreaterThan(2 * 1024 * 1024);
    const docs = createDocuments();
    const id = docs.open({
      id: '/large.md',
      path: '/large.md',
      content: source,
      encoding: 'UTF-8',
      bom: false,
      newline: 'lf',
      revision: { modified: '1', size: bytes, hash: '' }
    });
    expect(docs.find(id)?.mode).toBe('edit');
    const context = { headings: extractHeadingsFromMarkdown(source), markdownPath: '/large.md' };
    let start = performance.now();
    const fast = renderFastMarkdown(source, context);
    const fastMs = performance.now() - start;
    start = performance.now();
    const full = await renderPlusMarkdown(source, context, {
      ...defaultPlusPreferences,
      mermaidEnabled: false
    });
    const fullMs = performance.now() - start;
    expect(fast.html).toContain('Large document');
    expect(full.html).toContain('Large document');
    await mkdir(resolve('.local'), { recursive: true });
    const report = {
      bytes,
      fast_ms: Math.round(fastMs),
      full_plus_ms: Math.round(fullMs),
      initial_mode: docs.find(id)?.mode,
      scope: 'In-memory Markdown render in JSDOM; excludes file I/O, scanning and native WebView painting'
    };
    await writeFile(
      resolve('.local/render-performance.json'),
      JSON.stringify(report, null, 2) + '\n',
      'utf8'
    );
    console.log(report);
  },
  60000
);
