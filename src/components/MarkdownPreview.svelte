<script lang="ts">
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
  import type { Heading } from '../types';

  export let content = '';
  export let outline: Heading[] = [];

  let html = '';
  let previewHost: HTMLElement;

  marked.setOptions({
    gfm: true,
    breaks: false
  });

  function renderMarkdown(source: string, headings: Heading[]) {
    const raw = marked.parse(source, { async: false }) as string;
    const clean = DOMPurify.sanitize(raw, {
      ADD_ATTR: ['data-outline-line']
    });
    const template = document.createElement('template');
    template.innerHTML = clean;
    const renderedHeadings = template.content.querySelectorAll('h1,h2,h3,h4,h5,h6');
    renderedHeadings.forEach((node, index) => {
      const heading = headings[index];
      if (!heading) return;
      node.setAttribute('id', `heading-${heading.line}`);
      node.setAttribute('data-outline-line', String(heading.line));
    });
    return template.innerHTML;
  }

  $: html = renderMarkdown(content, outline);

  export function scrollToLine(line: number) {
    const target = previewHost?.querySelector(`[data-outline-line="${line}"]`);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
</script>

<article bind:this={previewHost} class="markdown-preview">
  {@html html}
</article>
