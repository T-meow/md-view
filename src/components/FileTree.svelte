<script lang="ts">
  import type { FileNode } from '../types';

  export let nodes: FileNode[] = [];
  export let selectedPath = '';
  export let depth = 0;
  export let onSelectFile: (path: string) => void = () => {};

  function activate(node: FileNode) {
    if (node.kind === 'file') {
      onSelectFile(node.path);
    }
  }
</script>

<ul class="file-tree" class:nested={depth > 0}>
  {#each nodes as node (node.path)}
    <li>
      <button
        type="button"
        class:selected={node.path === selectedPath}
        class:directory={node.kind === 'directory'}
        class:file={node.kind === 'file'}
        style={`--depth: ${depth}`}
        title={node.path}
        tabindex={node.kind === 'directory' ? -1 : 0}
        aria-disabled={node.kind === 'directory'}
        on:click={() => activate(node)}
      >
        <span class="twist">{node.kind === 'directory' ? '▾' : '·'}</span>
        <span class="label">{node.name}</span>
      </button>
      {#if node.kind === 'directory'}
        <svelte:self
          nodes={node.children}
          {selectedPath}
          {onSelectFile}
          depth={depth + 1}
        />
      {/if}
    </li>
  {/each}
</ul>
