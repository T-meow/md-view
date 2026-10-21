import type { Heading } from '../../types';
import type { MarkdownRenderContext, MarkdownRenderResult } from './shared';

type Fence = {
  marker: string;
  length: number;
  language: string;
  line: number;
  lines: string[];
};

export function renderFastMarkdown(source: string, context: MarkdownRenderContext): MarkdownRenderResult {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: Array<{ ordered: boolean; text: string }> = [];
  let fence: Fence | null = null as Fence | null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${renderInline(paragraph.join(' ').trim())}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (list.length === 0) return;
    const ordered = list[0]?.ordered ?? false;
    const items = list.map((item) => `<li>${renderInline(item.text)}</li>`).join('');
    html.push(`<${ordered ? 'ol' : 'ul'}>${items}</${ordered ? 'ol' : 'ul'}>`);
    list = [];
  };

  const flushBlocks = () => {
    flushParagraph();
    flushList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const lineNumber = index + 1;

    if (fence) {
      if (isFenceClose(line, fence)) {
        html.push(renderCodeBlock(fence.lines.join('\n'), fence.language));
        fence = null;
      } else {
        fence.lines.push(line);
      }
      continue;
    }

    const fenceOpen = readFenceOpen(line);
    if (fenceOpen) {
      flushBlocks();
      fence = { ...fenceOpen, line: lineNumber, lines: [] };
      continue;
    }

    if (!line.trim()) {
      flushBlocks();
      continue;
    }

    const heading = readHeading(line, context.headings, lineNumber);
    if (heading) {
      flushBlocks();
      html.push(
        `<h${heading.level} id="${escapeAttribute(heading.anchor)}" data-outline-line="${heading.line}">${escapeHtml(
          heading.text
        )}</h${heading.level}>`
      );
      index = (heading.endLine ?? lineNumber) - 1;
      continue;
    }

    if (/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushBlocks();
      html.push('<hr>');
      continue;
    }

    const quote = line.match(/^ {0,3}>\s?(.*)$/);
    if (quote) {
      flushBlocks();
      html.push(`<blockquote><p>${renderInline(quote[1] ?? '')}</p></blockquote>`);
      continue;
    }

    const listItem = line.match(/^ {0,3}(?:([-+*])|(\d+)[.)])\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      const ordered = Boolean(listItem[2]);
      if (list.length > 0 && list[0]?.ordered !== ordered) {
        flushList();
      }
      list.push({ ordered, text: listItem[3] ?? '' });
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  if (fence) {
    html.push(renderCodeBlock(fence.lines.join('\n'), fence.language));
  }
  flushBlocks();

  return {
    html: html.join('\n'),
    status: 'Quick Preview'
  };
}

function readHeading(line: string, headings: Heading[], lineNumber: number) {
  const outlineHeading = headings.find((heading) => heading.line === lineNumber);
  if (outlineHeading) return outlineHeading;
  const match = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (!match) return null;
  const text = (match[2] ?? '').trim();
  if (!text) return null;
  return {
    anchor: `heading-${lineNumber}`,
    level: match[1]?.length ?? 1,
    line: lineNumber,
    endLine: lineNumber,
    text
  };
}

function readFenceOpen(line: string) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_-]+)?/);
  if (!match) return null;
  const fence = match[1] ?? '';
  return {
    marker: fence[0] ?? '`',
    length: fence.length,
    language: match[2] ?? ''
  };
}

function isFenceClose(line: string, fence: Fence) {
  const escaped = fence.marker === '`' ? '`' : '~';
  return new RegExp(`^ {0,3}${escaped}{${fence.length},}\\s*$`).test(line);
}

function renderCodeBlock(source: string, language: string) {
  const className = language ? ` class="language-${escapeAttribute(language)}"` : '';
  return `<pre><code${className}>${escapeHtml(source)}</code></pre>`;
}

function renderInline(source: string) {
  return escapeHtml(source)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>');
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

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/\n/g, '&#10;');
}
