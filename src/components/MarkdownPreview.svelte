<script lang="ts">
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';
  import { createEventDispatcher, onMount } from 'svelte';
  import { isLocalMarkdownPath, resolveLocalPath, toImageAssetSrc } from '../fileAssets';
  import type { Heading } from '../types';

  export let content = '';
  export let outline: Heading[] = [];
  export let filePath = '';

  const dispatch = createEventDispatcher<{ openLocalFile: string }>();
  let html = '';
  let previewHost: HTMLElement;

  marked.setOptions({
    gfm: true,
    breaks: false
  });

  onMount(() => {
    previewHost.addEventListener('click', handleClick);
    return () => {
      previewHost.removeEventListener('click', handleClick);
    };
  });

  function renderMarkdown(source: string, headings: Heading[], markdownPath: string) {
    const raw = marked.parse(source, { async: false }) as string;
    const template = document.createElement('template');
    template.innerHTML = raw;
    const images = template.content.querySelectorAll('img');
    images.forEach((node) => {
      const source = node.getAttribute('src');
      const nextSource = toImageAssetSrc(source, markdownPath);
      if (nextSource) {
        node.setAttribute('src', nextSource);
      }
    });
    const links = template.content.querySelectorAll('a[href]');
    links.forEach((node) => {
      const href = node.getAttribute('href') ?? '';
      if (!isLocalMarkdownPath(href)) return;
      const localPath = resolveLocalPath(href, markdownPath);
      if (!localPath) return;
      node.setAttribute('href', '#');
      node.setAttribute('data-local-file', localPath);
    });
    const renderedHeadings = template.content.querySelectorAll('h1,h2,h3,h4,h5,h6');
    renderedHeadings.forEach((node, index) => {
      const heading = headings[index];
      if (!heading) return;
      node.setAttribute('id', `heading-${heading.line}`);
      node.setAttribute('data-outline-line', String(heading.line));
    });
    return DOMPurify.sanitize(template.innerHTML, {
      ADD_ATTR: ['data-outline-line', 'data-local-file'],
      ADD_URI_SAFE_ATTR: ['src'],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data|blob|asset):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i
    });
  }

  $: html = renderMarkdown(content, outline, filePath);

  export function scrollToLine(line: number) {
    const target = previewHost?.querySelector(`[data-outline-line="${line}"]`);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function handleClick(event: MouseEvent) {
    const link = (event.target as HTMLElement | null)?.closest('a[data-local-file]');
    if (!(link instanceof HTMLAnchorElement)) return;
    const localFile = link.dataset.localFile;
    if (!localFile) return;
    event.preventDefault();
    dispatch('openLocalFile', localFile);
  }
</script>

<article bind:this={previewHost} class="markdown-preview">
  {@html html}
</article>
