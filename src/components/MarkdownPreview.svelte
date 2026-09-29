<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { renderFastPreview, renderFullMarkdown } from '../markdown/renderers/deferred';
  import { openExternalUrl, validateLocalLinks } from '../runtime';
  import type { Heading, LinkValidationResult } from '../types';
  import { text, type Language } from '../i18n';
  import { enhanceCodeBlocks, createCopyFeedback } from '../markdown/codeTools';
  import { resolveLocalPath } from '../fileAssets';

  export let content = '';
  export let outline: Heading[] = [];
  export let filePath = '';
  export let preferences: unknown = undefined;
  export let fallbackRenderStatus = '';
  export let readingFocusEnabled = true;
  export let initialScroll = 0;
  export let language: Language = 'zh';

  const dispatch = createEventDispatcher<{
    activeLine: number;
    openLocalFile: { path: string; anchor?: string };
    position: number;
    renderHtml: string;
    renderStatus: string;
    readingProgress: number;
    linkStatus: { broken: number; total: number; failed?: boolean };
  }>();
  let html = '';
  let previewHost: HTMLElement;
  let renderToken = 0;
  let scrollFrame = 0;
  let resizeObserver: ResizeObserver | undefined;
  let currentReadingBlock: HTMLElement | null = null;
  let contextReadingBlocks: HTMLElement[] = [];
  let lastActiveLine = 0;
  let lastReadingProgress = -1;
  let imageOverlay: { src: string; source: string; scale: number } | null = null;
  let deferredRenderTimer = 0;
  let readingBlocks: HTMLElement[] = [];
  let blockTops: number[] = [];
  let blockLines = new WeakMap<HTMLElement, number>();
  let layoutDirty = true;
  let restoredPosition = false;
  const copyFeedback = createCopyFeedback(() => text[language].code);
  $: localizeTools(language, previewHost);
  function localizeTools(value: Language, host: HTMLElement | undefined) {
    copyFeedback.reset();
    if (host) {
      enhanceCodeBlocks(host, text[value].code);
      invalidateLayout();
    }
  }
  function invalidateLayout() {
    layoutDirty = true;
    scheduleReadingPositionUpdate();
  }
  $: if (!readingFocusEnabled) {
    clearReadingFocusClasses();
  } else {
    scheduleReadingPositionUpdate();
  }

  onMount(() => {
    previewHost.addEventListener('click', handleClick);
    previewHost.addEventListener('scroll', scheduleReadingPositionUpdate, { passive: true });
    previewHost.addEventListener('load', invalidateLayout, true);
    previewHost.addEventListener('toggle', invalidateLayout, true);
    resizeObserver = new ResizeObserver(invalidateLayout);
    resizeObserver.observe(previewHost);
    return () => {
      previewHost.removeEventListener('click', handleClick);
      previewHost.removeEventListener('scroll', scheduleReadingPositionUpdate);
      dispatch('position', previewHost.scrollTop);
      renderToken += 1;
      copyFeedback.reset();
      previewHost.removeEventListener('load', invalidateLayout, true);
      previewHost.removeEventListener('toggle', invalidateLayout, true);
      resizeObserver?.disconnect();
      if (scrollFrame) {
        cancelAnimationFrame(scrollFrame);
      }
      if (deferredRenderTimer) {
        clearTimeout(deferredRenderTimer);
      }
    };
  });

  $: void renderPreview(content, outline, filePath, preferences);

  async function renderPreview(source: string, headings: Heading[], markdownPath: string, prefs: unknown) {
    const token = ++renderToken;
    copyFeedback.reset();
    if (deferredRenderTimer) {
      clearTimeout(deferredRenderTimer);
      deferredRenderTimer = 0;
    }

    try {
      const quick = renderFastPreview(source, headings, markdownPath);
      applyRenderResult(quick, false);
      await tickAfterHtml();
      if (token !== renderToken) return;
      enhanceCodeBlocks(previewHost, text[language].code);
      if (!restoredPosition) {
        previewHost.scrollTop = initialScroll;
      }
      layoutDirty = true;
      resetReadingPosition();
      updateReadingPosition();
      deferredRenderTimer = window.setTimeout(() => {
        deferredRenderTimer = 0;
        void renderFullPreview(source, headings, markdownPath, prefs, token);
      }, 0);
    } catch (error) {
      if (token !== renderToken) return;
      copyFeedback.reset();
      html = `<pre class="markdown-render-error">${escapeHtml(String(error))}</pre>`;
      dispatch('renderStatus', fallbackRenderStatus);
      dispatch('renderHtml', html);
      await tickAfterHtml();
      if (token !== renderToken) return;
      layoutDirty = true;
      resetReadingPosition();
      updateReadingPosition();
    }
  }

  async function renderFullPreview(
    source: string,
    headings: Heading[],
    markdownPath: string,
    prefs: unknown,
    token: number
  ) {
    try {
      const result = await renderFullMarkdown(source, headings, markdownPath, prefs);
      if (token !== renderToken) return;
      const scroll = restoredPosition ? previewHost.scrollTop : initialScroll;
      applyRenderResult(result, true);
      await tickAfterHtml();
      if (token !== renderToken) return;
      enhanceCodeBlocks(previewHost, text[language].code);
      previewHost.scrollTop = scroll;
      restoredPosition = true;
      layoutDirty = true;
      resetReadingPosition();
      updateReadingPosition();
      if (shouldValidateLocalLinks(prefs) && result.linkTargets?.length) {
        try {
          const validation = await validateLocalLinks(
            markdownPath,
            result.linkTargets,
            Array.from(previewHost.querySelectorAll<HTMLElement>('[id]')).map((node) => node.id)
          );
          if (token === renderToken) applyLinkValidation(validation);
        } catch {
          if (token !== renderToken) return;
          dispatch('linkStatus', { broken: 0, total: 0, failed: true });
          dispatch('renderStatus', `${result.status} · ${text[language].preview.linkCheckFailed}`);
        }
      } else {
        dispatch('linkStatus', { broken: 0, total: 0 });
      }
    } catch (error) {
      if (token !== renderToken) return;
      copyFeedback.reset();
      html = `<pre class="markdown-render-error">${escapeHtml(String(error))}</pre>`;
      dispatch('renderStatus', fallbackRenderStatus);
      dispatch('renderHtml', html);
      await tickAfterHtml();
      if (token !== renderToken) return;
      layoutDirty = true;
      resetReadingPosition();
      updateReadingPosition();
    }
  }

  function applyRenderResult(result: { html: string; status: string }, isComplete: boolean) {
    copyFeedback.reset();
    html = result.html;
    dispatch('renderStatus', isComplete ? result.status : `${result.status}...`);
    dispatch('renderHtml', isComplete ? result.html : '');
    if (!isComplete) {
      dispatch('linkStatus', { broken: 0, total: 0 });
    }
  }

  export function scrollToLine(line: number) {
    const target = previewHost?.querySelector(`[data-outline-line="${line}"]`);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    scheduleReadingPositionUpdate();
  }

  function handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    const action = target?.closest('[data-mermaid-action]');
    if (action instanceof HTMLButtonElement) {
      event.preventDefault();
      handleMermaidAction(action);
      return;
    }

    const codeAction = target?.closest('[data-code-action]');
    if (codeAction instanceof HTMLButtonElement) {
      event.preventDefault();
      handleCodeAction(codeAction);
      return;
    }

    const image = target?.closest('img');
    if (image instanceof HTMLImageElement) {
      event.preventDefault();
      imageOverlay = {
        src: image.currentSrc || image.src,
        source: image.dataset.sourceSrc ?? image.getAttribute('src') ?? '',
        scale: 1
      };
      return;
    }

    const link = target?.closest('a');
    if (!(link instanceof HTMLAnchorElement)) return;
    const href = link.getAttribute('href')?.trim();
    if (href === undefined) return;
    event.preventDefault();

    if (link.dataset.localAnchor !== undefined) {
      scrollToAnchor(link.dataset.localAnchor);
      return;
    }

    // A local file is rendered with href="#". On Windows, link.href resolves
    // that against http://tauri.localhost, so classify the original attribute.
    if (link.dataset.localFile) {
      dispatch('openLocalFile', {
        path: link.dataset.localFile,
        anchor: link.dataset.sourceHref?.split('#').slice(1).join('#') || undefined
      });
      return;
    }

    if (isExternalUrl(href)) {
      void openExternalUrl(link.href);
      return;
    }
    if (href.startsWith('#')) {
      scrollToAnchor(href.slice(1));
      return;
    }
    const localFile = resolveLocalPath(href, filePath);
    if (!localFile) return;
    dispatch('openLocalFile', {
      path: localFile,
      anchor: href.split('#').slice(1).join('#') || undefined
    });
  }

  export function scrollToAnchor(anchor: string) {
    if (!anchor) return;
    try {
      anchor = decodeURIComponent(anchor);
    } catch {
      /* Use the literal anchor. */
    }
    const target = previewHost?.querySelector(`#${CSS.escape(anchor)}, [name="${CSS.escape(anchor)}"]`);
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function scheduleReadingPositionUpdate() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      updateReadingPosition();
    });
  }

  function resetReadingPosition() {
    clearReadingFocusClasses();
    lastActiveLine = -1;
    lastReadingProgress = -1;
  }

  function clearReadingFocusClasses() {
    currentReadingBlock?.classList.remove('current-reading-block');
    for (const block of contextReadingBlocks) {
      block.classList.remove('reading-context-block');
    }
    currentReadingBlock = null;
    contextReadingBlocks = [];
  }

  function updateReadingFocusClasses(nextBlock: HTMLElement | null, blocks: HTMLElement[]) {
    clearReadingFocusClasses();
    if (!nextBlock) return;

    currentReadingBlock = nextBlock;
    currentReadingBlock.classList.add('current-reading-block');
    const activeIndex = blocks.indexOf(nextBlock);
    contextReadingBlocks = [blocks[activeIndex - 1], blocks[activeIndex + 1]].filter(
      (block): block is HTMLElement => Boolean(block)
    );
    for (const block of contextReadingBlocks) {
      block.classList.add('reading-context-block');
    }
  }

  function updateReadingPosition() {
    if (!previewHost) return;
    const progress = calculateReadingProgress();
    if (progress !== lastReadingProgress) {
      lastReadingProgress = progress;
      dispatch('readingProgress', progress);
    }

    const blocks = getReadingBlocks();
    const nextBlock = findCurrentReadingBlock(blocks);
    if (!readingFocusEnabled) {
      clearReadingFocusClasses();
    } else if (nextBlock !== currentReadingBlock) {
      updateReadingFocusClasses(nextBlock, blocks);
    }

    const activeLine = findActiveHeadingLine(nextBlock);
    if (activeLine !== lastActiveLine) {
      lastActiveLine = activeLine;
      dispatch('activeLine', activeLine);
    }
  }

  function calculateReadingProgress() {
    const maxScroll = previewHost.scrollHeight - previewHost.clientHeight;
    if (maxScroll <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round((previewHost.scrollTop / maxScroll) * 100)));
  }

  function findCurrentReadingBlock(blocks: HTMLElement[]) {
    if (blocks.length === 0) return null;
    const maxScroll = previewHost.scrollHeight - previewHost.clientHeight;
    if (maxScroll > 0 && previewHost.scrollTop >= maxScroll - 2) {
      return blocks[blocks.length - 1] ?? null;
    }
    const focusY = previewHost.scrollTop + previewHost.clientHeight * 0.25;
    let left = 0,
      right = blockTops.length;
    while (left < right) {
      const middle = (left + right) >>> 1;
      if (blockTops[middle] <= focusY) left = middle + 1;
      else right = middle;
    }
    return blocks[Math.max(0, left - 1)] ?? null;
  }

  function getReadingBlocks() {
    if (!previewHost) return [];
    if (!layoutDirty) return readingBlocks;
    const hostTop = previewHost.getBoundingClientRect().top;
    readingBlocks = Array.from(
      previewHost.querySelectorAll<HTMLElement>(
        ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > p, :scope > ul, :scope > ol, :scope > blockquote, :scope > dl, :scope > details, :scope > figure, :scope > pre, :scope > table, :scope > nav, :scope > section, :scope > .markdown-mermaid, :scope > .markdown-properties, :scope > .markdown-frontmatter'
      )
    ).filter((block) => block.offsetParent !== null && block.getBoundingClientRect().height > 0);
    blockTops = readingBlocks.map(
      (block) => block.getBoundingClientRect().top - hostTop + previewHost.scrollTop
    );
    blockLines = new WeakMap();
    let headingLine = 0;
    for (const block of readingBlocks) {
      headingLine = Number(block.dataset.outlineLine) || headingLine;
      blockLines.set(block, headingLine);
    }
    layoutDirty = false;
    return readingBlocks;
  }

  function findActiveHeadingLine(block: HTMLElement | null) {
    return block ? blockLines.get(block) || 0 : 0;
  }

  function applyLinkValidation(results: LinkValidationResult[]) {
    const broken = results.filter((result) => !result.ok);
    for (const result of results) {
      if (result.ok) continue;
      const nodes =
        result.kind === 'image'
          ? Array.from(previewHost?.querySelectorAll<HTMLElement>('img[data-source-src]') ?? []).filter(
              (node) => node.dataset.sourceSrc === result.href
            )
          : Array.from(previewHost?.querySelectorAll<HTMLElement>('a') ?? []).filter(
              (node) => node.dataset.sourceHref === result.href || node.getAttribute('href') === result.href
            );
      nodes.forEach((node) => {
        node.classList.add('markdown-broken-link');
        node.title = result.message ?? 'Local target not found';
      });
    }
    dispatch('linkStatus', { broken: broken.length, total: results.length });
  }

  function shouldValidateLocalLinks(value: unknown) {
    return Boolean((value as { validateLocalLinks?: boolean } | undefined)?.validateLocalLinks);
  }

  function handleMermaidAction(button: HTMLButtonElement) {
    const wrapper = button.closest<HTMLElement>('.markdown-mermaid');
    if (!wrapper) return;
    const action = button.dataset.mermaidAction;
    const current = Number(wrapper.dataset.mermaidScale ?? '1') || 1;
    const next =
      action === 'zoom-in'
        ? current + 0.15
        : action === 'zoom-out'
          ? current - 0.15
          : action === 'reset' || action === 'fit'
            ? 1
            : current;
    if (action === 'copy-source') {
      void copyFeedback.copy(
        button,
        wrapper.dataset.mermaidSource ?? button.parentElement?.dataset.mermaidSource ?? '',
        text[language].code.copySource
      );
      return;
    }
    wrapper.dataset.mermaidScale = String(Math.max(0.45, Math.min(2.4, next)));
    wrapper.classList.toggle('fit-width', action === 'fit');
    const svg = wrapper.querySelector<SVGElement>('svg');
    if (svg) {
      svg.style.transform = `scale(${wrapper.dataset.mermaidScale})`;
      svg.style.transformOrigin = 'top center';
    }
    invalidateLayout();
  }

  function handleCodeAction(button: HTMLButtonElement) {
    const pre = button.closest<HTMLElement>('pre');
    if (!pre) return;
    if (button.dataset.codeAction === 'copy') {
      const code = pre.querySelector(':scope > code');
      if (code) void copyFeedback.copy(button, code.textContent ?? '', text[language].code.copy);
      return;
    }
    if (button.dataset.codeAction === 'wrap') {
      button.setAttribute('aria-pressed', String(pre.classList.toggle('code-wrap')));
      invalidateLayout();
    }
  }

  function closeImageOverlay() {
    imageOverlay = null;
  }

  function zoomImage(delta: number) {
    if (!imageOverlay) return;
    imageOverlay = { ...imageOverlay, scale: Math.max(0.35, Math.min(3, imageOverlay.scale + delta)) };
  }

  function isExternalUrl(url: string) {
    return /^(?:https?:|mailto:|tel:|\/\/)/i.test(url);
  }

  async function tickAfterHtml() {
    await Promise.resolve();
    await new Promise((resolve) => requestAnimationFrame(resolve));
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
</script>

<article bind:this={previewHost} class="markdown-preview" class:reading-focus-enabled={readingFocusEnabled}>
  {@html html}
</article>

{#if imageOverlay}
  <div class="image-preview-backdrop" role="presentation" on:click={closeImageOverlay}></div>
  <div class="image-preview-dialog" role="dialog" aria-label="Image preview">
    <div class="image-preview-toolbar">
      <span title={imageOverlay.source}>{imageOverlay.source}</span>
      <button type="button" on:click={() => zoomImage(-0.15)}>缩小</button>
      <button type="button" on:click={() => zoomImage(0.15)}>放大</button>
      <button type="button" on:click={() => void navigator.clipboard?.writeText(imageOverlay?.source ?? '')}
        >复制路径</button
      >
      <button type="button" on:click={closeImageOverlay}>关闭</button>
    </div>
    <div class="image-preview-stage">
      <img src={imageOverlay.src} alt="" style={`transform: scale(${imageOverlay.scale})`} />
    </div>
  </div>
{/if}
