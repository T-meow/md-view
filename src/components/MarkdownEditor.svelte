<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { basicSetup, EditorView } from 'codemirror';
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
  import { markdown } from '@codemirror/lang-markdown';
  import { bracketMatching, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
  import { searchKeymap } from '@codemirror/search';
  import { EditorState } from '@codemirror/state';
  import { keymap } from '@codemirror/view';
  import { tags as t } from '@lezer/highlight';

  export let value = '';

  const dispatch = createEventDispatcher<{ change: string }>();
  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let lastApplied = value;

  const themedEditor = EditorView.theme({
    '&': {
      backgroundColor: 'var(--editor-bg)',
      color: 'var(--editor-text)'
    },
    '.cm-content': {
      caretColor: 'var(--editor-cursor)'
    },
    '&.cm-focused': {
      outline: 'none'
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: 'var(--editor-cursor)'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--editor-selection)'
    },
    '.cm-gutters': {
      backgroundColor: 'var(--editor-gutter-bg)',
      borderRightColor: 'var(--border)',
      color: 'var(--editor-gutter-text)'
    },
    '.cm-activeLine, .cm-activeLineGutter': {
      backgroundColor: 'var(--editor-line)'
    },
    '.cm-matchingBracket': {
      backgroundColor: 'var(--selected-bg)',
      color: 'var(--selected-text)'
    }
  });

  const themedHighlight = HighlightStyle.define([
    { tag: t.heading, color: 'var(--editor-heading)', fontWeight: '700' },
    { tag: t.link, color: 'var(--editor-link)', textDecoration: 'underline' },
    { tag: [t.keyword, t.processingInstruction], color: 'var(--editor-keyword)' },
    { tag: [t.string, t.regexp], color: 'var(--editor-string)' },
    { tag: [t.comment, t.quote], color: 'var(--editor-comment)' },
    { tag: [t.monospace, t.meta], color: 'var(--editor-code)' },
    { tag: [t.strong], fontWeight: '700' },
    { tag: [t.emphasis], fontStyle: 'italic' },
    { tag: [t.atom, t.bool, t.number], color: 'var(--editor-code)' },
    { tag: [t.name, t.variableName], color: 'var(--editor-text)' }
  ]);

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          history(),
          markdown(),
          bracketMatching(),
          EditorView.editable.of(true),
          themedEditor,
          syntaxHighlighting(themedHighlight),
          keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const next = update.state.doc.toString();
            lastApplied = next;
            dispatch('change', next);
          })
        ]
      })
    });
  });

  $: if (view && value !== lastApplied && value !== view.state.doc.toString()) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value }
    });
    lastApplied = value;
  }

  export function focusLine(line: number) {
    if (!view) return;
    const safeLine = Math.max(1, Math.min(line, view.state.doc.lines));
    const position = view.state.doc.line(safeLine).from;
    view.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: 'center' })
    });
    view.focus();
  }

  onDestroy(() => {
    view?.destroy();
  });
</script>

<div bind:this={host} class="editor-host"></div>
