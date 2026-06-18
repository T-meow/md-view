<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
  import { text, type VisualText } from '../i18n';
  import type { Heading } from '../types';

  export let value = '';
  export let outline: Heading[] = [];
  export let strings: VisualText = text.zh.visual;

  const dispatch = createEventDispatcher<{ change: string }>();
  let host: HTMLElement;
  let lastRendered = '';
  let lastEmitted = '';
  let renderId = 0;
  let savedRange: Range | null = null;
  let rawBlocks = new Map<string, string>();

  marked.setOptions({
    gfm: true,
    breaks: false
  });

  onMount(() => {
    document.execCommand('defaultParagraphSeparator', false, 'p');
    renderEditor(value);
  });

  $: if (host && value !== lastRendered && value !== lastEmitted) {
    renderEditor(value);
  }

  $: if (host) {
    void tick().then(annotateHeadings);
  }

  function renderEditor(source: string) {
    renderId += 1;
    rawBlocks = new Map();
    const html = buildVisualHtml(source);
    host.innerHTML = html || '<p><br></p>';
    lastRendered = source;
    lastEmitted = source;
    annotateHeadings();
  }

  function buildVisualHtml(source: string) {
    const tokens = marked.lexer(source) as any[];
    return tokens.map((token, index) => tokenToHtml(token, index)).filter(Boolean).join('\n');
  }

  function tokenToHtml(token: any, index: number) {
    if (!token || token.type === 'space') return '';
    if (isUnsupportedToken(token)) {
      return unsupportedBlock(token.raw ?? token.text ?? '', index);
    }

    try {
      const html = marked.parse(token.raw ?? '', { async: false }) as string;
      return DOMPurify.sanitize(html, {
        ADD_ATTR: ['class', 'target', 'rel', 'src', 'alt', 'href']
      });
    } catch {
      return unsupportedBlock(token.raw ?? token.text ?? '', index);
    }
  }

  function isUnsupportedToken(token: any) {
    return ['html', 'def'].includes(token.type);
  }

  function unsupportedBlock(raw: string, index: number) {
    const id = `raw-${renderId}-${index}`;
    rawBlocks.set(id, raw);
    return `<pre class="visual-unsupported" data-raw-id="${id}" data-raw="${escapeAttribute(raw)}" contenteditable="false"><code>${escapeHtml(raw)}</code></pre>`;
  }

  function runCommand(command: string, argument?: string) {
    host.focus();
    restoreSelection();
    document.execCommand(command, false, argument);
    emitChange();
  }

  function setBlock(tagName: string) {
    runCommand('formatBlock', tagName);
  }

  function insertLink() {
    const url = window.prompt(strings.linkPrompt);
    if (!url) return;
    runCommand('createLink', url);
  }

  function insertCodeBlock() {
    insertHtml(`<pre><code>${escapeHtml(strings.codePlaceholder)}</code></pre><p><br></p>`);
  }

  function insertRule() {
    insertHtml('<hr><p><br></p>');
  }

  function insertTable() {
    const [first, second, third] = strings.tableHeaders;
    insertHtml(`
      <table>
        <thead><tr><th>${escapeHtml(first)}</th><th>${escapeHtml(second)}</th><th>${escapeHtml(third)}</th></tr></thead>
        <tbody>
          <tr><td></td><td></td><td></td></tr>
          <tr><td></td><td></td><td></td></tr>
          <tr><td></td><td></td><td></td></tr>
        </tbody>
      </table>
      <p><br></p>
    `);
  }

  function insertHtml(html: string) {
    host.focus();
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    emitChange();
  }

  function emitChange() {
    const next = serializeChildren(host).trim();
    lastEmitted = next;
    dispatch('change', next);
    saveSelection();
    annotateHeadings();
  }

  function saveSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!host.contains(range.commonAncestorContainer)) return;
    savedRange = range.cloneRange();
  }

  function restoreSelection() {
    if (!savedRange) return;
    try {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(savedRange);
    } catch {
      savedRange = null;
    }
  }

  function serializeChildren(parent: Node) {
    const blocks: string[] = [];
    parent.childNodes.forEach((node) => {
      const block = serializeBlock(node).trimEnd();
      if (block) {
        blocks.push(block);
      }
    });
    return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n');
  }

  function serializeBlock(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return normalizeText(node.textContent ?? '');
    }

    if (!(node instanceof HTMLElement)) return '';

    const rawId = node.dataset.rawId;
    if (rawId) {
      return node.dataset.raw ?? rawBlocks.get(rawId) ?? node.textContent ?? '';
    }

    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) {
      return `${'#'.repeat(Number(tag.slice(1)))} ${serializeInlineChildren(node).trim()}`;
    }
    if (tag === 'p') return serializeInlineChildren(node).trim();
    if (tag === 'blockquote') return serializeBlockquote(node);
    if (tag === 'pre') return serializeCodeBlock(node);
    if (tag === 'ul' || tag === 'ol') return serializeList(node, tag === 'ol');
    if (tag === 'table') return serializeTable(node);
    if (tag === 'hr') return '---';
    if (tag === 'div' || tag === 'section' || tag === 'article') return serializeChildren(node);
    return serializeInlineChildren(node).trim();
  }

  function serializeInlineChildren(parent: Node) {
    let result = '';
    parent.childNodes.forEach((node) => {
      result += serializeInlineNode(node);
    });
    return result.replace(/\u00a0/g, ' ');
  }

  function serializeInlineNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return normalizeText(node.textContent ?? '');
    }
    if (!(node instanceof HTMLElement)) return '';

    const tag = node.tagName.toLowerCase();
    const inner = serializeInlineChildren(node);
    if (tag === 'br') return '\n';
    if (tag === 'strong' || tag === 'b') return inner ? `**${inner}**` : '';
    if (tag === 'em' || tag === 'i') return inner ? `*${inner}*` : '';
    if (tag === 'code') return inlineCode(node.textContent ?? '');
    if (tag === 'a') {
      const href = node.getAttribute('href') ?? '';
      return href ? `[${inner || href}](${href})` : inner;
    }
    if (tag === 'img') {
      const alt = node.getAttribute('alt') ?? '';
      const src = node.getAttribute('src') ?? '';
      return src ? `![${alt}](${src})` : '';
    }
    if (tag === 'ul' || tag === 'ol' || tag === 'table' || tag === 'pre' || tag === 'blockquote') {
      return `\n${serializeBlock(node)}\n`;
    }
    return inner;
  }

  function serializeBlockquote(node: HTMLElement) {
    const content = serializeChildren(node) || serializeInlineChildren(node);
    return content
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n');
  }

  function serializeCodeBlock(node: HTMLElement) {
    const code = node.querySelector('code') ?? node;
    const className = code.getAttribute('class') ?? '';
    const language = className.match(/language-([^\s]+)/)?.[1] ?? '';
    return `\`\`\`${language}\n${(code.textContent ?? '').trimEnd()}\n\`\`\``;
  }

  function serializeList(node: HTMLElement, ordered: boolean) {
    const items = Array.from(node.children).filter((child) => child.tagName.toLowerCase() === 'li') as HTMLElement[];
    return items
      .map((item, index) => {
        const marker = ordered ? `${index + 1}. ` : '- ';
        const content = serializeListItem(item);
        const lines = content.split('\n');
        return `${marker}${lines[0] ?? ''}${lines.slice(1).map((line) => `\n  ${line}`).join('')}`;
      })
      .join('\n');
  }

  function serializeListItem(item: HTMLElement) {
    const parts: string[] = [];
    let inline = '';

    item.childNodes.forEach((child) => {
      if (child instanceof HTMLElement && ['ul', 'ol'].includes(child.tagName.toLowerCase())) {
        if (inline.trim()) {
          parts.push(inline.trim());
          inline = '';
        }
        parts.push(serializeBlock(child));
      } else {
        inline += serializeInlineNode(child);
      }
    });

    if (inline.trim()) {
      parts.unshift(inline.trim());
    }
    return parts.join('\n');
  }

  function serializeTable(node: HTMLElement) {
    const rows = Array.from(node.querySelectorAll('tr'));
    if (rows.length === 0) return '';

    const table = rows.map((row) =>
      Array.from(row.children).map((cell) => escapeTableCell(serializeInlineChildren(cell).trim()))
    );
    const width = Math.max(...table.map((row) => row.length));
    const header = padRow(table[0] ?? [], width);
    const body = table.slice(1).map((row) => padRow(row, width));
    const separator = Array.from({ length: width }, () => '---');
    return [header, separator, ...body].map((row) => `| ${row.join(' | ')} |`).join('\n');
  }

  function padRow(row: string[], width: number) {
    return [...row, ...Array.from({ length: Math.max(0, width - row.length) }, () => '')];
  }

  function inlineCode(text: string) {
    const clean = text.replace(/\n/g, ' ');
    return clean.includes('`') ? `\`\`${clean}\`\`` : `\`${clean}\``;
  }

  function escapeTableCell(value: string) {
    return value.replace(/\n/g, ' ').replace(/\|/g, '\\|');
  }

  function normalizeText(text: string) {
    return text.replace(/\u00a0/g, ' ');
  }

  function escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttribute(value: string) {
    return escapeHtml(value).replace(/\n/g, '&#10;');
  }

  function annotateHeadings() {
    if (!host) return;
    const headings = host.querySelectorAll('h1,h2,h3,h4,h5,h6');
    headings.forEach((node, index) => {
      const heading = outline[index];
      if (heading) {
        node.setAttribute('data-outline-line', String(heading.line));
      } else {
        node.removeAttribute('data-outline-line');
      }
    });
  }

  export function scrollToLine(line: number) {
    const target = host?.querySelector(`[data-outline-line="${line}"]`);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
</script>

<section class="visual-editor-shell">
  <div class="visual-toolbar" aria-label={strings.toolbar}>
    <select
      title={strings.paragraphStyle}
      aria-label={strings.paragraphStyle}
      on:mousedown={saveSelection}
      on:change={(event) => setBlock(event.currentTarget.value)}
    >
      <option value="p">{strings.paragraph}</option>
      <option value="h1">H1</option>
      <option value="h2">H2</option>
      <option value="h3">H3</option>
      <option value="blockquote">{strings.quote}</option>
      <option value="pre">{strings.codeBlock}</option>
    </select>
    <button type="button" title={strings.bold} aria-label={strings.bold} on:mousedown|preventDefault={saveSelection} on:click={() => runCommand('bold')}>B</button>
    <button type="button" title={strings.italic} aria-label={strings.italic} on:mousedown|preventDefault={saveSelection} on:click={() => runCommand('italic')}><i>I</i></button>
    <button type="button" title={strings.link} aria-label={strings.link} on:mousedown|preventDefault={saveSelection} on:click={insertLink}>{strings.link}</button>
    <button type="button" title={strings.unorderedList} aria-label={strings.unorderedList} on:mousedown|preventDefault={saveSelection} on:click={() => runCommand('insertUnorderedList')}>{strings.bulletList}</button>
    <button type="button" title={strings.orderedList} aria-label={strings.orderedList} on:mousedown|preventDefault={saveSelection} on:click={() => runCommand('insertOrderedList')}>{strings.numberList}</button>
    <button type="button" title={strings.insertCodeBlock} aria-label={strings.insertCodeBlock} on:mousedown|preventDefault={saveSelection} on:click={insertCodeBlock}>{strings.code}</button>
    <button type="button" title={strings.insertRule} aria-label={strings.insertRule} on:mousedown|preventDefault={saveSelection} on:click={insertRule}>{strings.rule}</button>
    <button type="button" title={strings.insertTable} aria-label={strings.insertTable} on:mousedown|preventDefault={saveSelection} on:click={insertTable}>{strings.table}</button>
  </div>

  <article
    bind:this={host}
    class="visual-editor"
    contenteditable="true"
    spellcheck="false"
    on:input={emitChange}
    on:keyup={saveSelection}
    on:mouseup={saveSelection}
    on:focus={saveSelection}
  ></article>
</section>
