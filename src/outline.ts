import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import type { Root, Nodes } from 'mdast';
import type { Heading } from './types';

const parser = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml', 'toml'])
  .use(remarkGfm, { singleTilde: false });

export function extractHeadingsFromMarkdown(source: string): Heading[] {
  const headings: Heading[] = [];
  visitHeadings(parser.parse(source) as Root, (node) => {
    const lineNumber = node.position!.start.line;
    headings.push({
      level: node.depth,
      text: nodeText(node),
      line: lineNumber,
      endLine: node.position!.end.line,
      anchor: `heading-${lineNumber}`
    });
  });
  return headings;
}

// Run before remark-rehype so headings retain their real source positions.
export function markHeadingPositions() {
  return (tree: Root) =>
    visitHeadings(tree, (node) => {
      node.data ??= {};
      node.data.hProperties = {
        ...node.data.hProperties,
        'data-outline-line': node.position!.start.line
      };
    });
}

function visitHeadings(node: Nodes, visit: (heading: Extract<Nodes, { type: 'heading' }>) => void) {
  if (node.type === 'heading' && node.position) visit(node);
  if ('children' in node) node.children.forEach((child) => visitHeadings(child, visit));
}

function nodeText(node: Nodes): string {
  if (node.type === 'html') return '';
  if ('children' in node) return node.children.map(nodeText).join('');
  if ('alt' in node) return node.alt ?? '';
  if (node.type === 'break') return '\n';
  return 'value' in node ? node.value : '';
}
