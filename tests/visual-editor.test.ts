import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { marked } from 'marked';
import VisualEditorHarness from './fixtures/VisualEditorHarness.svelte';

let app: ReturnType<typeof mount> | undefined;
const changed = vi.fn();
const commandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');
beforeEach(() => {
  changed.mockReset();
  Object.defineProperty(document, 'execCommand', {
    configurable: true,
    value: vi.fn()
  });
});
afterEach(async () => {
  if (app) await unmount(app);
  app = undefined;
  document.body.innerHTML = '';
  if (commandDescriptor) Object.defineProperty(document, 'execCommand', commandDescriptor);
  else Reflect.deleteProperty(document, 'execCommand');
});

async function setup(value: string) {
  app = mount(VisualEditorHarness, {
    target: document.body,
    props: { value, onChange: changed }
  });
  await tick();
  return document.querySelector<HTMLElement>('.visual-editor')!;
}
function edit(host: HTMLElement) {
  host.dispatchEvent(new Event('input', { bubbles: true }));
  return changed.mock.lastCall![0] as string;
}

it('preserves untouched Markdown blocks when another paragraph is edited', async () => {
  const original =
    '````md\n```js\nconst x = 1;\n```\n\n\nkeep blank lines\n````\n\n' +
    '- [x] ~~done~~\n- [ ] pending\n\n' +
    '| left | right |\n| :--- | ---: |\n| a | b |\n\n' +
    '\\*literal\\* and [reference][ref]\n\n[ref]: https://example.com "Title"';
  const host = await setup('Before\n\n' + original);
  host.querySelector('p')!.textContent = 'After';
  expect(edit(host)).toBe('After\n\n' + original);
});

it('preserves code whitespace and chooses a fence longer than embedded backticks', async () => {
  const host = await setup('```md\nold\n```');
  const code = '  first\n\n\n```js\nexample\n```\nlast  \n\n';
  host.querySelector('code')!.textContent = code;
  const result = edit(host);
  const tokens = marked.lexer(result);
  expect(tokens).toHaveLength(1);
  expect(tokens[0].type).toBe('code');
  expect(tokens[0]).toMatchObject({ lang: 'md', text: code.slice(0, -1) });
});

it('keeps checked and unchecked tasks and strikethrough while editing a list item', async () => {
  const host = await setup('- [x] ~~done~~\n- [ ] pending');
  host.querySelectorAll('li')[1].append(' updated');
  const result = edit(host);
  expect(result).toContain('- [x] ~~done~~');
  expect(result).toContain('- [ ] pending updated');
});

it('keeps an ordered list start and nested indentation after editing', async () => {
  const host = await setup('10. first\n    - child\n11. second');
  host.querySelector('li')!.firstChild!.textContent = 'changed';
  const parsed = document.createElement('div');
  parsed.innerHTML = marked.parse(edit(host), { async: false }) as string;
  expect(parsed.querySelector('ol')?.getAttribute('start')).toBe('10');
  expect(parsed.querySelector('ol > li > ul > li')?.textContent).toBe('child');
});

it('keeps literal punctuation, hard breaks, and link titles in an edited paragraph', async () => {
  const host = await setup('\\*literal\\* and [reference](https://example.com "Title")  \nnext line');
  host.querySelector('p')!.append(' updated');
  const parsed = document.createElement('div');
  parsed.innerHTML = marked.parse(edit(host), { async: false }) as string;
  expect(parsed.querySelector('em')).toBeNull();
  expect(parsed.querySelector('p')?.textContent).toBe(host.querySelector('p')?.textContent);
  expect(parsed.querySelector('a')?.title).toBe('Title');
  expect(parsed.querySelectorAll('br')).toHaveLength(1);
});

it.each(['``inside``', ' leading and trailing ', '   '])(
  'round-trips edited inline code %j',
  async (value) => {
    const host = await setup('Some `code`.');
    host.querySelector('code')!.textContent = value;
    const parsed = document.createElement('div');
    parsed.innerHTML = marked.parse(edit(host), { async: false }) as string;
    expect(parsed.querySelector('code')?.textContent).toBe(value);
  }
);

it('preserves alignment when a table cell is edited', async () => {
  const host = await setup('| left | center | right |\n| :--- | :---: | ---: |\n| a | b | c |');
  host.querySelector('td')!.textContent = 'edited | cell';
  const parsed = document.createElement('div');
  parsed.innerHTML = marked.parse(edit(host), { async: false }) as string;
  expect([...parsed.querySelectorAll('th')].map((cell) => cell.getAttribute('align'))).toEqual([
    'left',
    'center',
    'right'
  ]);
  expect(parsed.querySelector('td')?.textContent).toBe('edited | cell');
});

it('keeps paragraph boundaries and order around a nested list while editing', async () => {
  const host = await setup('- first\n\n  second paragraph\n\n  - child\n\n  third paragraph\n\n- end');
  host.querySelector('li p')!.textContent = 'changed';
  const parsed = document.createElement('div');
  parsed.innerHTML = marked.parse(edit(host), { async: false }) as string;
  const item = parsed.querySelector('li')!;
  expect([...item.children].map((child) => child.tagName)).toEqual(['P', 'P', 'UL', 'P']);
  expect([...item.querySelectorAll(':scope > p')].map((paragraph) => paragraph.textContent)).toEqual([
    'changed',
    'second paragraph',
    'third paragraph'
  ]);
  expect(item.querySelector('ul > li')?.textContent).toBe('child');
});
