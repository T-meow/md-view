<script lang="ts">
  import MarkdownPreview from '../../src/components/MarkdownPreview.svelte';
  import type { Language } from '../../src/i18n';
  export let content = '';
  export let language: Language = 'zh';
  export let preferences: unknown = undefined;
  export let filePath = '';
  export let onOpenLocalFile: (target: { path: string; anchor?: string }) => void = () => {};
  let preview: MarkdownPreview;
  export function replaceContent(value: string) {
    content = value;
  }
  export function changeLanguage(value: Language) {
    language = value;
  }
  export function scrollToAnchor(value: string) {
    preview.scrollToAnchor(value);
  }
</script>

<MarkdownPreview
  bind:this={preview}
  {content}
  {language}
  {preferences}
  {filePath}
  on:openLocalFile={(event) => onOpenLocalFile(event.detail)}
/>
