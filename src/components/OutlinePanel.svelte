<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { AppText } from '../i18n';
  import type { Heading } from '../types';

  export let headings: Heading[] = [];
  export let strings: AppText['panels'];

  const dispatch = createEventDispatcher<{ jump: Heading }>();
</script>

<div class="outline-panel">
  {#if headings.length === 0}
    <p class="empty-note">{strings.emptyTitle}</p>
  {:else}
    {#each headings as heading}
      <button
        class="outline-item"
        style={`--level: ${heading.level}`}
        title={`${strings.linePrefix} ${heading.line}${strings.lineSuffix ? ` ${strings.lineSuffix}` : ''}`}
        on:click={() => dispatch('jump', heading)}
      >
        {heading.text}
      </button>
    {/each}
  {/if}
</div>
