import { marked } from 'marked';
import type { MarkdownRenderContext, MarkdownRenderResult } from './shared';
import { postProcessMarkdownHtml } from './shared';

marked.setOptions({
  gfm: true,
  breaks: false
});

export async function renderLiteMarkdown(source: string, context: MarkdownRenderContext): Promise<MarkdownRenderResult> {
  const remaining = [...context.headings];
  const renderer = new marked.Renderer();
  renderer.heading = function ({ tokens, depth }) {
    const html = this.parser.parseInline(tokens);
    const template = document.createElement('template');
    template.innerHTML = html;
    template.content.querySelectorAll('img').forEach((image) => image.replaceWith(image.alt));
    const text = template.content.textContent?.replace(/\s+/g, ' ').trim();
    const index = remaining.findIndex((heading) =>
      heading.level === depth && heading.text.replace(/\s+/g, ' ').trim() === text
    );
    const heading = index < 0 ? undefined : remaining.splice(index, 1)[0];
    const position = heading ? ` data-outline-line="${heading.line}"` : '';
    return `<h${depth}${position}>${html}</h${depth}>\n`;
  };
  const raw = marked.parse(source, { async: false, renderer }) as string;
  return {
    html: postProcessMarkdownHtml(raw, context),
    status: 'Lite Markdown'
  };
}
