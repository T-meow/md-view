import type { AppText } from '../i18n';

export type CodeText = AppText['code'];

// Applied to the mounted preview after both fast and full rendering. Keeping these
// controls out of the renderer also keeps inert buttons out of exported HTML.
export function enhanceCodeBlocks(root: ParentNode, strings: CodeText) {
  root.querySelectorAll<HTMLElement>('pre > code').forEach((code) => {
    const pre = code.parentElement!;
    pre.classList.add('markdown-code-block');
    let toolbar = pre.querySelector<HTMLElement>(':scope > .markdown-code-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'markdown-code-toolbar';
      toolbar.append(document.createElement('span'), codeButton('copy'), codeButton('wrap'));
      pre.prepend(toolbar);
    }
    const language = Array.from(code.classList)
      .find((name) => name.startsWith('language-'))
      ?.slice(9);
    const label = toolbar.querySelector('span');
    if (label) label.textContent = language || strings.plainText;
    const copy = toolbar.querySelector<HTMLButtonElement>('[data-code-action="copy"]');
    if (copy) labelButton(copy, strings.copy);
    const wrap = toolbar.querySelector<HTMLButtonElement>('[data-code-action="wrap"]');
    if (wrap) {
      labelButton(wrap, strings.wrap);
      wrap.setAttribute('aria-pressed', String(pre.classList.contains('code-wrap')));
    }
  });
  root.querySelectorAll<HTMLButtonElement>('[data-mermaid-action="copy-source"]').forEach((button) => {
    labelButton(button, strings.copySource);
  });
}

function codeButton(action: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.codeAction = action;
  return button;
}

function labelButton(button: HTMLButtonElement, label: string) {
  button.textContent = label;
  button.setAttribute('aria-label', label);
  button.title = label;
  if (button.dataset.codeAction === 'copy' || button.dataset.mermaidAction === 'copy-source') {
    button.setAttribute('aria-live', 'polite');
  }
}

export function createCopyFeedback(getStrings: () => CodeText) {
  type Request = { label: string; timer?: ReturnType<typeof setTimeout> };
  const requests = new Map<HTMLButtonElement, Request>();

  function restore(button: HTMLButtonElement, request: Request) {
    clearTimeout(request.timer);
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.classList.remove('copy-failed');
    labelButton(button, request.label);
  }

  return {
    async copy(button: HTMLButtonElement, value: string, label: string) {
      const previous = requests.get(button);
      if (previous) restore(button, previous);
      const request: Request = { label };
      requests.set(button, request);
      const strings = getStrings();
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      labelButton(button, strings.copying);
      const clipboard = navigator.clipboard;
      const available = typeof clipboard?.writeText === 'function';
      try {
        if (!available) throw new Error('Clipboard unavailable');
        await clipboard.writeText(value);
        if (requests.get(button) !== request) return;
        button.disabled = false;
        button.removeAttribute('aria-busy');
        labelButton(button, strings.copied);
        request.timer = setTimeout(() => {
          if (requests.get(button) !== request) return;
          restore(button, request);
          requests.delete(button);
        }, 2000);
      } catch {
        if (requests.get(button) !== request) return;
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.classList.add('copy-failed');
        labelButton(button, strings.copyFailed);
        button.title = available ? strings.copyFailedHint : strings.copyUnavailable;
        button.setAttribute('aria-label', button.title);
      }
    },
    reset() {
      requests.forEach((request, button) => restore(button, request));
      requests.clear();
    }
  };
}
