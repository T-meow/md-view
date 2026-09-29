<script lang="ts">
  import VisualMarkdownEditor from '../../src/components/VisualMarkdownEditor.svelte';
  export let value = '';
  export let onChange: (value: string) => void;
</script>

<VisualMarkdownEditor
  {value}
  on:change={(event) => {
    value = event.detail;
    onChange(value);
  }}
/>
