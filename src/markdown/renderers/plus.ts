import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeStringify from 'rehype-stringify';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
import { defaultPlusPreferences, normalizePlusPreferences, type PlusPreferences } from '../../plusPreferences';
import type { MarkdownRenderContext, MarkdownRenderResult } from './shared';
import { postProcessMarkdownHtml } from './shared';

type MermaidModule = typeof import('mermaid');
type FrontmatterBlock = {
  marker: 'yaml' | 'toml';
  content: string;
};

let mermaidModule: MermaidModule | null = null;
let mermaidCounter = 0;
const MERMAID_SELECTOR = 'pre > code.language-mermaid, pre > code.language-mmd';
const INLINE_EXTENSION_PATTERN =
  /==([^=\n][^=\n]*?)==|\+\+([^+\n][^+\n]*?)\+\+|~([A-Za-z0-9+\-=().,/]+?)~|\^([A-Za-z0-9+\-=().,/]+?)\^/g;
const PLUS_ALLOWED_ATTRIBUTES = [
  'aria-describedby',
  'aria-label',
  'aria-hidden',
  'checked',
  'data-footnote-backref',
  'data-footnote-ref',
  'data-footnotes',
  'data-language',
  'data-code-action',
  'data-mermaid-action',
  'data-mermaid-source',
  'data-mermaid-scale',
  'data-source-code',
  'data-toc-level',
  'disabled',
  'role',
  'type'
];

export async function renderPlusMarkdown(
  source: string,
  context: MarkdownRenderContext,
  preferences: PlusPreferences = defaultPlusPreferences
): Promise<MarkdownRenderResult> {
  const safePreferences = normalizePlusPreferences(preferences);
  const linkTargets = context.linkTargets ?? [];
  const frontmatter = readFrontmatter(source);
  const file = await createProcessor(safePreferences, frontmatter).process(preprocessPlusMarkdown(source, safePreferences));
  const withMermaid = safePreferences.mermaidEnabled
    ? await renderMermaidBlocks(String(file), safePreferences)
    : keepMermaidAsCode(String(file));
  const enhanced = enhancePlusHtml(withMermaid, safePreferences, context);
  return {
    html: postProcessMarkdownHtml(enhanced, { ...context, linkTargets }, PLUS_ALLOWED_ATTRIBUTES),
    status: 'Plus Markdown',
    linkTargets
  };
}

function createProcessor(preferences: PlusPreferences, frontmatter: FrontmatterBlock | null) {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml', 'toml'])
    .use(remarkGfm, { singleTilde: false });

  if (preferences.mathEnabled) {
    processor.use(remarkMath);
  }

  processor
    .use(renderFrontmatter(preferences, frontmatter))
    .use(remarkRehype, { allowDangerousHtml: true });

  if (preferences.mathEnabled) {
    processor.use(rehypeKatex, { strict: false });
  }

  return processor
    .use(rehypeHighlight, { detect: true, ignoreMissing: true })
    .use(rehypeStringify, { allowDangerousHtml: true });
}

function renderFrontmatter(preferences: PlusPreferences, frontmatter: FrontmatterBlock | null) {
  return function frontmatterPlugin() {
    return (tree: any) => {
      if (!Array.isArray(tree.children)) return;
      tree.children = tree.children.map((node: any) => {
        if (node?.type !== 'yaml' && node?.type !== 'toml') return node;
        if (preferences.frontmatterMode === 'hidden') {
          return { type: 'html', value: '' };
        }
        const label = node.type === 'toml' ? 'TOML Frontmatter' : 'Frontmatter';
        if (preferences.frontmatterMode === 'properties' && node.type === 'yaml') {
          return {
            type: 'html',
            value: renderFrontmatterProperties(frontmatter?.content ?? node.value ?? '', label)
          };
        }
        return {
          type: 'html',
          value: [
            '<details class="markdown-frontmatter">',
            `<summary>${label}</summary>`,
            `<pre><code>${escapeHtml(node.value ?? '')}</code></pre>`,
            '</details>'
          ].join('')
        };
      });
    };
  };
}

function readFrontmatter(source: string): FrontmatterBlock | null {
  const normalized = source.replace(/\r\n?/g, '\n');
  const yaml = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (yaml) return { marker: 'yaml', content: yaml[1] ?? '' };
  const toml = normalized.match(/^\+\+\+\n([\s\S]*?)\n\+\+\+(?:\n|$)/);
  if (toml) return { marker: 'toml', content: toml[1] ?? '' };
  return null;
}

function renderFrontmatterProperties(source: string, label: string) {
  const properties = parseYamlProperties(source);
  if (properties.length === 0) {
    return [
      '<details class="markdown-frontmatter">',
      `<summary>${label}</summary>`,
      `<pre><code>${escapeHtml(source)}</code></pre>`,
      '</details>'
    ].join('');
  }

  const rows = properties
    .map(({ key, value }) => [
      '<div class="markdown-property-row">',
      `<dt>${escapeHtml(propertyLabel(key))}</dt>`,
      `<dd>${renderPropertyValue(value)}</dd>`,
      '</div>'
    ].join(''))
    .join('');
  return [
    '<section class="markdown-properties" aria-label="Frontmatter properties">',
    '<div class="markdown-properties-title">Properties</div>',
    `<dl>${rows}</dl>`,
    '</section>'
  ].join('');
}

function parseYamlProperties(source: string) {
  const rows: Array<{ key: string; value: string | string[] }> = [];
  const lines = source.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1] ?? '';
    const rawValue = match[2] ?? '';
    if (rawValue.trim()) {
      rows.push({ key, value: stripYamlQuotes(rawValue.trim()) });
      continue;
    }
    const list: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const item = lines[cursor].match(/^\s+-\s+(.*)$/);
      if (!item) break;
      list.push(stripYamlQuotes((item[1] ?? '').trim()));
      cursor += 1;
    }
    if (list.length > 0) {
      rows.push({ key, value: list });
      index = cursor - 1;
    }
  }
  return rows;
}

function stripYamlQuotes(value: string) {
  return value.replace(/^['"]|['"]$/g, '');
}

function propertyLabel(key: string) {
  const labels: Record<string, string> = {
    aliases: 'Aliases',
    author: 'Author',
    date: 'Date',
    tags: 'Tags',
    title: 'Title'
  };
  return labels[key] ?? key;
}

function renderPropertyValue(value: string | string[]) {
  if (Array.isArray(value)) {
    return value.map((item) => `<span class="markdown-property-chip">${escapeHtml(item)}</span>`).join('');
  }
  return escapeHtml(value);
}

function preprocessPlusMarkdown(source: string, preferences: PlusPreferences) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let index = 0;
  let inFence: { marker: string; length: number } | null = null;
  let inFrontmatter = false;
  let frontmatterMarker = '';

  while (index < lines.length) {
    const line = lines[index];

    if (index === 0 && isFrontmatterBoundary(line)) {
      inFrontmatter = true;
      frontmatterMarker = line.trim()[0] ?? '';
      output.push(line);
      index += 1;
      continue;
    }

    if (inFrontmatter) {
      output.push(line);
      if (isMatchingFrontmatterBoundary(line, frontmatterMarker)) {
        inFrontmatter = false;
      }
      index += 1;
      continue;
    }

    if (inFence) {
      output.push(line);
      if (isFenceClose(line, inFence)) {
        inFence = null;
      }
      index += 1;
      continue;
    }

    const fence = readFenceOpen(line);
    if (fence) {
      inFence = fence;
      output.push(line);
      index += 1;
      continue;
    }

    const definitionList = readDefinitionList(lines, index);
    if (definitionList) {
      output.push(definitionList.html);
      index = definitionList.nextIndex;
      continue;
    }

    if (preferences.tocMode === 'render' && /^\s*\[toc\]\s*$/i.test(line)) {
      output.push('@@MD_VIEW_TOC@@');
      index += 1;
      continue;
    }

    output.push(normalizeSoftBreaks(normalizeWikiLinks(line), preferences));
    index += 1;
  }

  return output.join('\n');
}

function normalizeSoftBreaks(line: string, preferences: PlusPreferences) {
  return preferences.softBreakMode === 'breaks' && line.trim() ? `${line}  ` : line;
}

function readFenceOpen(line: string) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  if (!match) return null;
  const fence = match[1] ?? '';
  return { marker: fence[0] ?? '`', length: fence.length };
}

function isFenceClose(line: string, fence: { marker: string; length: number }) {
  const escaped = fence.marker === '`' ? '`' : '~';
  const pattern = new RegExp(`^ {0,3}${escaped}{${fence.length},}\\s*$`);
  return pattern.test(line);
}

function isFrontmatterBoundary(line: string) {
  return /^---\s*$/.test(line) || /^\+\+\+\s*$/.test(line);
}

function isMatchingFrontmatterBoundary(line: string, marker: string) {
  return marker === '+' ? /^\+\+\+\s*$/.test(line) : /^---\s*$/.test(line);
}

function readDefinitionList(lines: string[], index: number) {
  const term = lines[index];
  const definition = lines[index + 1];
  if (!isDefinitionTerm(term) || !isDefinitionLine(definition)) {
    return null;
  }

  const definitions: string[] = [];
  let nextIndex = index + 1;
  while (nextIndex < lines.length && isDefinitionLine(lines[nextIndex])) {
    definitions.push(lines[nextIndex].replace(/^ {0,3}:\s?/, '').trim());
    nextIndex += 1;
  }

  const items = definitions
    .map((value) => `<dd>${escapeHtml(value)}</dd>`)
    .join('');
  return {
    html: `<dl class="markdown-definition-list"><dt>${escapeHtml(term.trim())}</dt>${items}</dl>`,
    nextIndex
  };
}

function isDefinitionTerm(line: string | undefined) {
  if (!line) return false;
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^(?:#{1,6}\s|>|[-+*]\s|\d+\.\s|`{3,}|~{3,}|<|\||:::)/.test(trimmed)) return false;
  return !/^ {4}/.test(line);
}

function isDefinitionLine(line: string | undefined) {
  return Boolean(line && /^ {0,3}:\s+/.test(line));
}

function normalizeWikiLinks(line: string) {
  return line
    .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, label: string | undefined) => {
      const cleanTarget = target.trim();
      const alt = label?.trim() || cleanTarget.split(/[\\/]/).pop() || cleanTarget;
      return `![${escapeMarkdownLabel(alt)}](${escapeMarkdownDestination(cleanTarget)})`;
    })
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, label: string | undefined) => {
      const cleanTarget = target.trim();
      const text = label?.trim() || cleanTarget;
      return `[${escapeMarkdownLabel(text)}](${escapeMarkdownDestination(cleanTarget)})`;
    });
}

function escapeMarkdownLabel(value: string) {
  return value.replace(/([\\\]])/g, '\\$1');
}

function escapeMarkdownDestination(value: string) {
  return value.replace(/\s/g, '%20').replace(/\)/g, '%29');
}

async function renderMermaidBlocks(html: string, preferences: PlusPreferences) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const blocks = Array.from(template.content.querySelectorAll(MERMAID_SELECTOR));

  if (blocks.length === 0) {
    return template.innerHTML;
  }

  const mermaid = await loadMermaid();
  configureMermaid(mermaid);
  for (const block of blocks) {
    const pre = block.parentElement;
    if (!pre) continue;
    const source = block.textContent ?? '';
    try {
      const id = `md-view-mermaid-${Date.now()}-${++mermaidCounter}`;
      const { svg } = await mermaid.default.render(id, source);
      const wrapper = document.createElement('div');
      wrapper.className = 'markdown-mermaid';
      wrapper.dataset.mermaidSource = source;
      wrapper.dataset.mermaidScale = '1';
      wrapper.innerHTML = svg;
      if (preferences.mermaidControls) {
        wrapper.prepend(createMermaidToolbar(source));
      }
      pre.replaceWith(wrapper);
    } catch (error) {
      pre.replaceWith(createMermaidErrorBlock(source, error));
    }
  }

  return template.innerHTML;
}

function keepMermaidAsCode(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll(MERMAID_SELECTOR).forEach((block) => {
    block.parentElement?.classList.add('markdown-mermaid-disabled');
  });
  return template.innerHTML;
}

async function loadMermaid() {
  if (!mermaidModule) {
    mermaidModule = await import('mermaid');
  }
  return mermaidModule;
}

function configureMermaid(mermaid: MermaidModule) {
  mermaid.default.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    // SVG text survives the final sanitizer, which removes foreignObject content.
    htmlLabels: false,
    suppressErrorRendering: true,
    theme: document.documentElement.dataset.themeMode === 'dark' ? 'dark' : 'default'
  });
}

function createMermaidErrorBlock(source: string, error: unknown) {
  const wrapper = document.createElement('div');
  wrapper.className = 'markdown-mermaid markdown-mermaid-error';

  const title = document.createElement('div');
  title.className = 'markdown-mermaid-error-title';
  title.textContent = 'Mermaid diagram error';

  const message = document.createElement('pre');
  message.className = 'markdown-mermaid-error-message';
  message.textContent = error instanceof Error ? error.message : String(error);

  const code = document.createElement('code');
  code.className = 'language-mermaid';
  code.textContent = source;

  const pre = document.createElement('pre');
  pre.append(code);

  wrapper.append(title, message, pre);
  return wrapper;
}

function createMermaidToolbar(source: string) {
  const toolbar = document.createElement('div');
  toolbar.className = 'markdown-mermaid-toolbar';
  toolbar.append(
    toolbarButton('放大', 'zoom-in'),
    toolbarButton('缩小', 'zoom-out'),
    toolbarButton('重置', 'reset'),
    toolbarButton('适合宽度', 'fit'),
    toolbarButton('复制源码', 'copy-source')
  );
  toolbar.dataset.mermaidSource = source;
  return toolbar;
}

function toolbarButton(label: string, action: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.mermaidAction = action;
  button.setAttribute('aria-label', label);
  return button;
}

function enhancePlusHtml(html: string, preferences: PlusPreferences, context: MarkdownRenderContext) {
  const template = document.createElement('template');
  template.innerHTML = html;
  renderTocBlocks(template.content, preferences, context);
  enhanceAlertBlockquotes(template.content);
  enhanceInlineExtensions(template.content);
  return template.innerHTML;
}

function renderTocBlocks(root: DocumentFragment, preferences: PlusPreferences, context: MarkdownRenderContext) {
  const placeholders = Array.from(root.querySelectorAll('p')).filter((node) => node.textContent?.trim() === '@@MD_VIEW_TOC@@');
  if (placeholders.length === 0) return;
  const headings = context.headings.map((heading, index) => ({
    id: heading.anchor || slugHeading(heading.text, index),
    level: heading.level,
    text: heading.text
  }));
  placeholders.forEach((placeholder) => {
    placeholder.replaceWith(preferences.tocMode === 'render' ? createTocElement(headings) : document.createTextNode(''));
  });
}

function createTocElement(headings: Array<{ id: string; level: number; text: string }>) {
  const nav = document.createElement('nav');
  nav.className = 'markdown-toc';
  const title = document.createElement('div');
  title.className = 'markdown-toc-title';
  title.textContent = '目录';
  const list = document.createElement('ol');
  headings.forEach((heading) => {
    const item = document.createElement('li');
    item.dataset.tocLevel = String(heading.level);
    item.style.setProperty('--toc-level', String(heading.level));
    const link = document.createElement('a');
    link.href = `#${heading.id}`;
    link.textContent = heading.text;
    item.append(link);
    list.append(item);
  });
  nav.append(title, list);
  return nav;
}

function enhanceAlertBlockquotes(root: DocumentFragment) {
  root.querySelectorAll('blockquote').forEach((blockquote) => {
    const firstText = findFirstTextNode(blockquote);
    const text = firstText?.textContent ?? '';
    const match = text.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|SUCCESS|QUESTION|FAILURE|DANGER|BUG|EXAMPLE|QUOTE)\]([^\n]*)/i);
    if (!firstText || !match) return;

    const kind = (match[1] ?? 'note').toLowerCase();
    const titleText = (match[2] ?? '').trim() || alertTitle(kind);
    blockquote.classList.add('markdown-alert', `markdown-alert-${kind}`);
    firstText.textContent = text.slice(match[0].length).replace(/^\s+/, '');

    const title = document.createElement('div');
    title.className = 'markdown-alert-title';
    title.textContent = titleText;
    blockquote.prepend(title);
  });
}

function findFirstTextNode(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  return walker.nextNode() as Text | null;
}

function alertTitle(kind: string) {
  const titles: Record<string, string> = {
    bug: 'Bug',
    caution: 'Caution',
    danger: 'Danger',
    example: 'Example',
    failure: 'Failure',
    important: 'Important',
    info: 'Info',
    note: 'Note',
    question: 'Question',
    quote: 'Quote',
    success: 'Success',
    tip: 'Tip',
    warning: 'Warning'
  };
  return titles[kind] ?? 'Note';
}

function enhanceInlineExtensions(root: DocumentFragment) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('code,pre,kbd,script,style,.katex,.markdown-frontmatter,.markdown-mermaid')) {
        return NodeFilter.FILTER_REJECT;
      }
      INLINE_EXTENSION_PATTERN.lastIndex = 0;
      return INLINE_EXTENSION_PATTERN.test(node.textContent ?? '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  nodes.forEach(replaceInlineExtensions);
}

function replaceInlineExtensions(node: Text) {
  const text = node.textContent ?? '';
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  INLINE_EXTENSION_PATTERN.lastIndex = 0;

  for (const match of text.matchAll(INLINE_EXTENSION_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      fragment.append(document.createTextNode(text.slice(cursor, start)));
    }
    fragment.append(createInlineExtensionElement(match));
    cursor = start + match[0].length;
  }

  if (cursor < text.length) {
    fragment.append(document.createTextNode(text.slice(cursor)));
  }

  node.replaceWith(fragment);
}

function createInlineExtensionElement(match: RegExpMatchArray) {
  if (match[1]) return textElement('mark', match[1]);
  if (match[2]) return textElement('ins', match[2]);
  if (match[3]) return textElement('sub', match[3]);
  return textElement('sup', match[4] ?? '');
}

function textElement(tagName: string, text: string) {
  const element = document.createElement(tagName);
  element.textContent = text;
  return element;
}

function slugHeading(text: string, index: number) {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return slug ? `heading-${slug}` : `heading-${index + 1}`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
